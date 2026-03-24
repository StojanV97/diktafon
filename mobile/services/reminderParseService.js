import { supabase } from "./supabaseClient"
import { t } from "../src/i18n"

const DEV_ANTHROPIC_KEY = __DEV__ ? process.env.EXPO_PUBLIC_ANTHROPIC_KEY : null

const PARSE_TIMEOUT_MS = 30000

const SYSTEM_PROMPT = `You are a reminder parser for a Serbian voice memo app. The user speaks a reminder in Serbian (Latin script, may lack diacritics). Extract:

1. "action" — what the user wants to be reminded about (in Serbian, cleaned up, imperative/infinitive form)
2. "datetime" — when they want to be reminded, as an ISO 8601 string with timezone offset. Resolve relative expressions using the provided current_datetime. If only a time is given with no date, assume today (or tomorrow if the time has already passed). If no time is specified at all, return null.
3. "recurrence" — if the user wants this to repeat. Return null for one-time reminders. Otherwise return: { "type": "daily" | "weekly" | "monthly", "days_of_week": [0-6] } where 0=Sunday. Only include days_of_week for weekly recurrence.

Respond ONLY with valid JSON, no markdown, no explanation:
{"action": "...", "datetime": "..." or null, "recurrence": {...} or null}`

function withTimeout(promise, ms) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(t("reminders.parseFailed"))), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

async function parseDirect(text, currentDatetime) {
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
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Current date/time: ${currentDatetime}\nTranscript: "${text}"`,
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const body = await res.text()
      if (__DEV__) console.error("[parseDirect] API error:", res.status, body)
      throw new Error(`Anthropic API error: ${res.status}`)
    }

    const result = await res.json()
    const content = result.content?.[0]?.text
    if (!content) {
      if (__DEV__) console.error("[parseDirect] Empty content:", JSON.stringify(result))
      throw new Error("Empty response from LLM")
    }

    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    try {
      return JSON.parse(cleaned)
    } catch (parseErr) {
      if (__DEV__) console.error("[parseDirect] JSON parse failed:", cleaned)
      throw new Error("Failed to parse LLM response as JSON")
    }
  } finally {
    clearTimeout(timer)
  }
}

const VALID_RECURRENCE_TYPES = ["daily", "weekly", "monthly"]

function validateParsedResult(parsed, fallbackAction) {
  const result = {
    action: typeof parsed?.action === "string" && parsed.action.trim()
      ? parsed.action.trim()
      : fallbackAction,
    datetime: null,
    recurrence: null,
  }
  if (typeof parsed?.datetime === "string" && !isNaN(new Date(parsed.datetime).getTime())) {
    result.datetime = parsed.datetime
  }
  if (parsed?.recurrence && VALID_RECURRENCE_TYPES.includes(parsed.recurrence.type)) {
    const rec = { type: parsed.recurrence.type }
    if (parsed.recurrence.type === "weekly" && Array.isArray(parsed.recurrence.days_of_week)) {
      rec.days_of_week = parsed.recurrence.days_of_week.filter(
        (d) => typeof d === "number" && d >= 0 && d <= 6
      )
    }
    result.recurrence = rec
  }
  return result
}

export async function parseReminder(text) {
  const currentDatetime = new Date().toISOString()

  let raw
  if (DEV_ANTHROPIC_KEY) {
    if (__DEV__) console.log("[parseReminder] using direct Anthropic API")
    raw = await parseDirect(text, currentDatetime)
  } else {
    if (__DEV__) console.log("[parseReminder] using Supabase edge function")
    const { data, error } = await withTimeout(
      supabase.functions.invoke("parse-reminder", {
        body: { text, current_datetime: currentDatetime },
      }),
      PARSE_TIMEOUT_MS
    )
    if (error) {
      if (__DEV__) console.error("[parseReminder] Supabase error:", error)
      throw new Error(error.message || "Supabase function failed")
    }
    raw = data
  }

  return validateParsedResult(raw, text)
}
