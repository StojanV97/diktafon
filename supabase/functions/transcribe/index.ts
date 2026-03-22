import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const MONTHLY_MINUTES_LIMIT = 120
const ASSEMBLYAI_API_KEY = Deno.env.get("ASSEMBLYAI_API_KEY")!
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

    const url = new URL(req.url)
    const path = url.pathname.split("/").pop()

    if (req.method === "POST" && path === "submit") {
      return await handleSubmit(req, supabase, user.id, corsHeaders)
    }

    if (req.method === "POST" && path === "status") {
      return await handleStatus(req, corsHeaders)
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
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

async function handleSubmit(
  req: Request,
  supabase: any,
  userId: string,
  headers: Record<string, string>,
) {
  const { storage_path, speaker_labels, file_key } = await req.json()

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

  // Upload decrypted audio directly to AssemblyAI (in-memory, never persisted)
  const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: {
      authorization: ASSEMBLYAI_API_KEY,
      "content-type": "application/octet-stream",
    },
    body: audioBytes,
  })

  if (!uploadRes.ok) {
    return new Response(JSON.stringify({ error: "AssemblyAI upload failed" }), {
      status: 502,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  const { upload_url } = await uploadRes.json()

  // Submit transcription job
  const res = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      authorization: ASSEMBLYAI_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: upload_url,
      language_code: "sr",
      speaker_labels: speaker_labels ?? true,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    return new Response(JSON.stringify({ error: `AssemblyAI error: ${body}` }), {
      status: 502,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  const data = await res.json()

  // Delete encrypted audio from storage immediately
  supabase.storage.from("audio-uploads").remove([storage_path]).catch(() => {})

  return new Response(JSON.stringify({ assemblyai_id: data.id }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  })
}

async function handleStatus(req: Request, headers: Record<string, string>) {
  const { id } = await req.json()

  // Validate transcript ID format (alphanumeric AssemblyAI IDs only)
  if (typeof id !== "string" || !/^[a-z0-9_-]+$/i.test(id) || id.length > 64) {
    return new Response(JSON.stringify({ error: "Invalid transcript ID" }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
    headers: { authorization: ASSEMBLYAI_API_KEY },
  })

  if (!res.ok) {
    return new Response(JSON.stringify({ error: "AssemblyAI status check failed" }), {
      status: 502,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  const data = await res.json()

  if (data.status === "completed") {
    const text = formatUtterances(data)
    const duration_seconds = Math.round(data.audio_duration || 0)
    return new Response(JSON.stringify({ status: "done", text, duration_seconds }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  if (data.status === "error") {
    return new Response(JSON.stringify({ status: "error", error: data.error }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ status: "processing" }), {
    status: 200,
    headers: { ...headers, "Content-Type": "application/json" },
  })
}

// NOTE: formatUtterances is also duplicated in mobile/services/assemblyAIService.js
// (separate Deno runtime, no shared code path — intentional duplication)
function formatUtterances(data: any): string {
  if (!data.utterances || data.utterances.length === 0) {
    return data.text || ""
  }

  return data.utterances
    .map((u: any) => {
      const startSec = (u.start || 0) / 1000
      const m = Math.floor(startSec / 60)
      const s = Math.floor(startSec % 60)
      const timestamp = `${m}:${s.toString().padStart(2, "0")}`
      return `[Govornik ${u.speaker} – ${timestamp}] ${u.text}`
    })
    .join("\n")
}
