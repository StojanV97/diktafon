import * as FileSystem from "expo-file-system/legacy"
import { supabase } from "./supabaseClient"

const DEV_API_KEY = process.env.EXPO_PUBLIC_ASSEMBLYAI_KEY

const AAI_BASE = "https://api.assemblyai.com/v2"

const UPLOAD_TIMEOUT_MS = 60000
const SUBMIT_TIMEOUT_MS = 30000
const CHECK_TIMEOUT_MS = 15000

function withTimeout(promise, ms) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Prekoraceno vreme. Proverite internet vezu.")), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal })
    .catch((e) => {
      if (e.name === "AbortError") throw new Error("Prekoraceno vreme. Proverite internet vezu.")
      throw new Error("Greska u mrezi. Proverite internet vezu.")
    })
    .finally(() => clearTimeout(timer))
}

// ── Dev key check ──────────────────────────────────────

export function hasDevKey() {
  return !!DEV_API_KEY
}

// ── Direct AssemblyAI API (dev mode) ───────────────────

async function submitDirect(fileUri, options = {}) {
  // 1. Upload audio file (with timeout)
  const uploadRes = await withTimeout(
    FileSystem.uploadAsync(`${AAI_BASE}/upload`, fileUri, {
      httpMethod: "POST",
      headers: { authorization: DEV_API_KEY },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    }),
    UPLOAD_TIMEOUT_MS
  )
  const { upload_url } = JSON.parse(uploadRes.body)

  // 2. Create transcript job
  const body = {
    audio_url: upload_url,
    language_code: "sr",
    speech_models: ["universal-3-pro", "universal-2"],
    speaker_labels: options.speakerLabels ?? true,
  }
  const res = await fetchWithTimeout(`${AAI_BASE}/transcript`, {
    method: "POST",
    headers: {
      authorization: DEV_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }, SUBMIT_TIMEOUT_MS)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "Greska pri slanju na AssemblyAI")
  return { assemblyai_id: data.id }
}

async function checkDirect(transcriptId) {
  const res = await fetchWithTimeout(`${AAI_BASE}/transcript/${transcriptId}`, {
    headers: { authorization: DEV_API_KEY },
  }, CHECK_TIMEOUT_MS)
  const data = await res.json()

  if (data.status === "completed") {
    const text = data.utterances
      ? formatUtterances(data)
      : data.text || ""
    return {
      status: "done",
      text,
      duration_seconds: data.audio_duration ? Math.round(data.audio_duration) : null,
    }
  }
  if (data.status === "error") {
    return { status: "error", error: data.error || "Transcription failed" }
  }
  return { status: "processing" }
}

function formatUtterances(data) {
  const lines = []
  let currentSpeaker = null
  for (const u of data.utterances) {
    if (u.speaker !== currentSpeaker) {
      currentSpeaker = u.speaker
      const totalSec = Math.floor(u.start / 1000)
      const m = Math.floor(totalSec / 60)
      const s = String(totalSec % 60).padStart(2, "0")
      lines.push(`\n[Govornik ${u.speaker} – ${m}:${s}]`)
    }
    lines.push(u.text)
  }
  return lines.join("\n").trim()
}

// ── Public API ─────────────────────────────────────────

export async function submit(fileUri, options = {}) {
  if (DEV_API_KEY) return submitDirect(fileUri, options)

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error("AUTH_REQUIRED")

  // Upload audio to Supabase Storage (temp bucket)
  const filename = `transcribe/${session.user.id}/${Date.now()}.wav`
  const fileContent = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const { error: uploadError } = await supabase.storage
    .from("audio-uploads")
    .upload(filename, decode(fileContent), {
      contentType: "audio/wav",
      upsert: true,
    })

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)

  // Call edge function to submit to AssemblyAI
  const { data, error } = await supabase.functions.invoke("transcribe/submit", {
    body: {
      storage_path: filename,
      speaker_labels: options.speakerLabels ?? true,
    },
  })

  if (error) throw error
  return { assemblyai_id: data.assemblyai_id }
}

export async function check(transcriptId) {
  if (DEV_API_KEY) return checkDirect(transcriptId)

  const { data, error } = await supabase.functions.invoke("transcribe/status", {
    body: { id: transcriptId },
  })

  if (error) throw error
  return data
}

// Base64 decode helper for Supabase storage upload
function decode(base64) {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}
