import * as FileSystem from "expo-file-system/legacy"
import { supabase } from "./supabaseClient"
import { t } from "../src/i18n"

const DEV_API_KEY = __DEV__ ? process.env.EXPO_PUBLIC_ASSEMBLYAI_KEY : null

const AAI_BASE = "https://api.assemblyai.com/v2"

const UPLOAD_TIMEOUT_MS = 60000
const SUBMIT_TIMEOUT_MS = 30000
const CHECK_TIMEOUT_MS = 15000

function withTimeout(promise, ms) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(t('assemblyAI.timeout'))), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal })
    .catch((e) => {
      if (e.name === "AbortError") throw new Error(t('assemblyAI.timeout'))
      throw new Error(t('assemblyAI.networkError'))
    })
    .finally(() => clearTimeout(timer))
}

function validateTranscriptResponse(data) {
  if (!data || typeof data !== "object") return false
  if (typeof data.status !== "string") return false
  if (data.status === "completed") {
    if (data.utterances != null && !Array.isArray(data.utterances)) return false
    if (data.text != null && typeof data.text !== "string") return false
  }
  return true
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
  let uploadBody
  try {
    uploadBody = JSON.parse(uploadRes.body)
  } catch {
    throw new Error(t('assemblyAI.invalidUploadResponse'))
  }
  const { upload_url } = uploadBody
  if (!upload_url) {
    throw new Error(t('assemblyAI.noUploadUrl'))
  }

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
  if (!res.ok) {
    if (__DEV__) console.warn("AssemblyAI submit error:", data.error)
    throw new Error(t('assemblyAI.submitError'))
  }
  if (!data.id) throw new Error(t('assemblyAI.noTranscriptId'))
  return { assemblyai_id: data.id }
}

async function checkDirect(transcriptId) {
  const res = await fetchWithTimeout(`${AAI_BASE}/transcript/${transcriptId}`, {
    headers: { authorization: DEV_API_KEY },
  }, CHECK_TIMEOUT_MS)
  let data
  try {
    data = await res.json()
  } catch {
    throw new Error(t('assemblyAI.invalidStatusResponse'))
  }

  if (!res.ok) {
    if (__DEV__) console.warn("AssemblyAI check error:", data.error)
    return { status: "error", error: t('assemblyAI.statusCheckError') }
  }

  if (!validateTranscriptResponse(data)) {
    if (__DEV__) console.warn("AssemblyAI invalid response shape:", JSON.stringify(data).slice(0, 200))
    return { status: "error", error: t('assemblyAI.invalidResponse') }
  }

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
    if (__DEV__) console.warn("AssemblyAI transcription error:", data.error)
    return { status: "error", error: t('assemblyAI.transcriptionFailed') }
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
      lines.push(`\n${t('assemblyAI.speakerLabel', { num: u.speaker, time: `${m}:${s}` })}`)
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

  if (uploadError) {
    if (__DEV__) console.warn("Supabase upload error:", uploadError.message)
    throw new Error("Upload snimka nije uspeo. Pokusajte ponovo.")
  }

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
