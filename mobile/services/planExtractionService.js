import * as cloudService from "./cloudTranscriptionService"
import * as whisperService from "./whisperService"
import { getSettings } from "./settingsService"
import { supabase } from "./supabaseClient"
import { t } from "../src/i18n"
import * as FileSystem from "expo-file-system/legacy"

const DEV_ANTHROPIC_KEY = __DEV__ ? process.env.EXPO_PUBLIC_ANTHROPIC_KEY : null

const PARSE_TIMEOUT_MS = 30000

const SYSTEM_PROMPT = `You are a plan extractor for a Serbian voice memo app. The user speaks their plans in Serbian (Latin script, may lack diacritics). Extract action items and the target date.

Return ONLY valid JSON, no markdown, no explanation:
{"date": "YYYY-MM-DD" or null, "items": ["item1", "item2", ...]}

Rules:
- Items should be short, imperative/infinitive form in Serbian
- "sutra" = tomorrow relative to today's date (provided)
- "prekosutra" = day after tomorrow
- Day names like "ponedeljak" = next occurrence of that day
- If no date is mentioned or can be inferred, set date to null
- If no actionable items found, return empty items array
- Do NOT include greetings, filler words, or non-actionable content`

function withTimeout(promise, ms) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(t("plans.extractionFailed"))), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function parseDirect(text, today) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS)

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": DEV_ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Today's date: ${today}\nTranscript: "${text}"`,
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.text()
      if (__DEV__) console.error("[parsePlan] API error:", res.status, body)
      throw new Error(`Anthropic API error: ${res.status}`)
    }

    const result = await res.json()
    const content = result.content?.[0]?.text
    if (!content) throw new Error("Empty response from LLM")

    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    return JSON.parse(cleaned)
  } finally {
    clearTimeout(timer)
  }
}

function validateParsedResult(raw) {
  const result = { date: null, items: [] }

  if (typeof raw?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    result.date = raw.date
  }

  if (Array.isArray(raw?.items)) {
    result.items = raw.items
      .filter((item) => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim())
  }

  return result
}

async function parsePlanFromText(text) {
  const today = new Date().toISOString().slice(0, 10)

  let raw
  if (DEV_ANTHROPIC_KEY) {
    if (__DEV__) console.log("[parsePlan] using direct Anthropic API")
    raw = await parseDirect(text, today)
  } else {
    if (__DEV__) console.log("[parsePlan] using Supabase edge function")
    const { data, error } = await withTimeout(
      supabase.functions.invoke("parse-plan", {
        body: { text, today },
      }),
      PARSE_TIMEOUT_MS
    )
    if (error) throw new Error(error.message || "Supabase function failed")
    raw = data
  }

  return validateParsedResult(raw)
}

/**
 * Full plan extraction pipeline: transcribe audio -> extract plan with LLM.
 * Audio file is deleted after processing.
 *
 * @param {string} audioUri - Path to recorded audio file
 * @param {(state: string) => void} onStateChange - Called with "transcribing" | "extracting"
 * @returns {{ date: string | null, items: string[] }}
 */
export async function extractPlan(audioUri, onStateChange) {
  try {
    onStateChange?.("transcribing")

    const { defaultEngine } = await getSettings()
    const { text } = defaultEngine === "cloud"
      ? await cloudService.transcribe(audioUri)
      : await whisperService.transcribe(audioUri)

    if (!text) throw new Error(t("plans.extractionFailed"))

    onStateChange?.("extracting")
    const result = await parsePlanFromText(text)

    if (result.items.length === 0) {
      throw new Error(t("plans.noItems"))
    }

    return result
  } finally {
    try {
      await FileSystem.deleteAsync(audioUri, { idempotent: true })
    } catch {}
  }
}
