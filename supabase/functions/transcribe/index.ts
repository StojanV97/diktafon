import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const MONTHLY_MINUTES_LIMIT = 120
const TOGETHER_API_KEY = Deno.env.get("TOGETHER_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Verify JWT
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Check premium subscription
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_tier, transcription_minutes_used, billing_cycle_start")
      .eq("id", user.id)
      .single()

    if (!profile || profile.subscription_tier !== "premium") {
      return new Response(JSON.stringify({ error: "Premium subscription required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Check usage cap
    if (profile.transcription_minutes_used >= MONTHLY_MINUTES_LIMIT) {
      return new Response(JSON.stringify({ error: `Monthly transcription limit reached (${MONTHLY_MINUTES_LIMIT} min)` }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    return await handleTranscribe(req, supabase, user.id, corsHeaders)
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})

// AES-256-GCM decryption using Web Crypto API
// Format: [12-byte IV][ciphertext][16-byte auth tag]
async function decryptAES256GCM(encrypted: Uint8Array, keyBytes: Uint8Array): Promise<Uint8Array> {
  const IV_LENGTH = 12
  const TAG_LENGTH = 16
  const iv = encrypted.slice(0, IV_LENGTH)
  const ciphertext = encrypted.slice(IV_LENGTH, encrypted.length - TAG_LENGTH)
  const tag = encrypted.slice(encrypted.length - TAG_LENGTH)
  // Web Crypto expects auth tag appended to ciphertext
  const combined = new Uint8Array(ciphertext.length + tag.length)
  combined.set(ciphertext)
  combined.set(tag, ciphertext.length)
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"])
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, combined)
  return new Uint8Array(decrypted)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function handleTranscribe(
  req: Request,
  supabase: any,
  userId: string,
  headers: Record<string, string>,
) {
  const { storage_path, file_key, speaker_labels } = await req.json()

  // Validate storage path belongs to the requesting user
  const expectedPrefix = `transcribe/${userId}/`
  if (typeof storage_path !== "string" || !storage_path.startsWith(expectedPrefix) || storage_path.includes("..")) {
    return new Response(JSON.stringify({ error: "Invalid storage path" }), {
      status: 403,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  // Download audio from storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("audio-uploads")
    .download(storage_path)

  if (downloadError || !fileData) {
    return new Response(JSON.stringify({ error: "Failed to download audio" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  // Decrypt if per-file key provided, otherwise treat as plaintext (legacy)
  const rawBytes = new Uint8Array(await fileData.arrayBuffer())
  let audioBytes: Uint8Array
  if (file_key) {
    const keyBytes = base64ToBytes(file_key)
    audioBytes = await decryptAES256GCM(rawBytes, keyBytes)
  } else {
    audioBytes = rawBytes
  }

  // Send to Together.ai Whisper (synchronous — returns transcript directly)
  const formData = new FormData()
  formData.append("file", new Blob([audioBytes], { type: "audio/wav" }), "audio.wav")
  formData.append("model", "openai/whisper-large-v3")
  formData.append("language", "sr")

  if (speaker_labels) {
    formData.append("response_format", "verbose_json")
    formData.append("diarize", "true")
  }

  const togetherRes = await fetch("https://api.together.xyz/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOGETHER_API_KEY}`,
    },
    body: formData,
  })

  if (!togetherRes.ok) {
    const body = await togetherRes.text()
    return new Response(JSON.stringify({ error: `Together.ai error: ${body}` }), {
      status: 502,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  const result = await togetherRes.json()

  // Delete encrypted audio from storage immediately
  supabase.storage.from("audio-uploads").remove([storage_path]).catch(() => {})

  const text = speaker_labels ? formatSpeakerSegments(result) : (result.text || "")

  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  })
}

function formatSpeakerSegments(data: any): string {
  if (!data.speaker_segments || data.speaker_segments.length === 0) {
    return data.text || ""
  }

  return data.speaker_segments
    .map((seg: any) => {
      const startSec = seg.start || 0
      const m = Math.floor(startSec / 60)
      const s = Math.floor(startSec % 60)
      const timestamp = `${m}:${s.toString().padStart(2, "0")}`
      const speaker = speakerLabel(seg.speaker_id)
      return `[Govornik ${speaker} – ${timestamp}] ${seg.text.trim()}`
    })
    .join("\n")
}

function speakerLabel(speakerId: string): string {
  // "SPEAKER_00" → "A", "SPEAKER_01" → "B", etc.
  const match = speakerId?.match(/(\d+)$/)
  if (!match) return speakerId || "?"
  return String.fromCharCode(65 + parseInt(match[1], 10))
}
