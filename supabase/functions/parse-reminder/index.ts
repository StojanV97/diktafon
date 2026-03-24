import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

// Simple in-memory rate limiter (per IP, 30 requests/min)
const rateLimiter = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000

const SYSTEM_PROMPT = `You are a reminder parser for a Serbian voice memo app. The user speaks a reminder in Serbian (Latin script, may lack diacritics). Extract:

1. "action" — what the user wants to be reminded about (in Serbian, cleaned up, imperative/infinitive form)
2. "datetime" — when they want to be reminded, as an ISO 8601 string with timezone offset. Resolve relative expressions using the provided current_datetime. If only a time is given with no date, assume today (or tomorrow if the time has already passed). If no time is specified at all, return null.
3. "recurrence" — if the user wants this to repeat. Return null for one-time reminders. Otherwise return: { "type": "daily" | "weekly" | "monthly", "days_of_week": [0-6] } where 0=Sunday. Only include days_of_week for weekly recurrence.

Serbian time patterns to handle:
- "sutra" = tomorrow, "prekosutra" = day after tomorrow
- "u ponedeljak/utorak/sredu/cetvrtak/petak/subotu/nedelju" = next occurrence of that weekday
- "za X minuta/sati/dana" = relative from now
- "u Xh", "u X sati", "u X casova", "u X popodne/ujutru"
- "na kraju dana" / "uveče" = 20:00
- "svakog dana / svaki dan" = daily recurrence
- "svake nedelje / svaki ponedeljak" = weekly recurrence
- "svakog meseca / prvog u mesecu" = monthly recurrence

Respond ONLY with valid JSON, no markdown, no explanation:
{"action": "...", "datetime": "..." or null, "recurrence": {...} or null}`

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  // Rate limiting
  const ip = req.headers.get("x-forwarded-for") || "unknown"
  const now = Date.now()
  const entry = rateLimiter.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS }
  if (now > entry.resetAt) {
    entry.count = 0
    entry.resetAt = now + RATE_WINDOW_MS
  }
  entry.count++
  rateLimiter.set(ip, entry)
  if (entry.count > RATE_LIMIT) {
    return new Response(
      JSON.stringify({ error: "Rate limit exceeded" }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }

  try {
    const { text, current_datetime } = await req.json()

    if (!text || typeof text !== "string" || text.length > 2000) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing text" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    if (!current_datetime || typeof current_datetime !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid or missing current_datetime" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
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
            content: `Current date/time: ${current_datetime}\nTranscript: "${text}"`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      return new Response(
        JSON.stringify({ error: `Anthropic API error: ${errBody}` }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    const result = await response.json()
    const content = result.content?.[0]?.text
    if (!content) {
      return new Response(
        JSON.stringify({ error: "Empty response from LLM" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    // Strip markdown fences if present
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    const parsed = JSON.parse(cleaned)

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
