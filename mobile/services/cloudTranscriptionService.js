import * as FileSystem from "expo-file-system/legacy"
import crypto from "react-native-quick-crypto"
import { encryptBytes } from "./cryptoService"
import { supabase } from "./supabaseClient"
import { t } from "../src/i18n"

const DEV_API_KEY = __DEV__ ? process.env.EXPO_PUBLIC_TOGETHER_KEY : null

const TRANSCRIBE_TIMEOUT_MS = 120000 // 2 minutes — Whisper can be slow on long audio

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...options, signal: controller.signal })
    .catch((e) => {
      if (e.name === "AbortError") throw new Error(t('cloudTranscription.timeout'))
      throw new Error(t('cloudTranscription.networkError'))
    })
    .finally(() => clearTimeout(timer))
}

// ── Dev key check ──────────────────────────────────────

export function hasDevKey() {
  return !!DEV_API_KEY
}

// ── Direct Together.ai API (dev mode) ──────────────────

async function transcribeDirect(fileUri, { speakerLabels } = {}) {
  const fileContent = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const binaryString = atob(fileContent)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  const formData = new FormData()
  formData.append("file", {
    uri: fileUri,
    type: "audio/wav",
    name: "audio.wav",
  })
  formData.append("model", "openai/whisper-large-v3")
  formData.append("language", "sr")

  if (speakerLabels) {
    formData.append("response_format", "verbose_json")
    formData.append("diarize", "true")
  }

  const res = await fetchWithTimeout("https://api.together.xyz/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${DEV_API_KEY}`,
    },
    body: formData,
  }, TRANSCRIBE_TIMEOUT_MS)

  if (!res.ok) {
    const body = await res.text()
    if (__DEV__) console.error("[cloudTranscription] API error:", res.status, body)
    throw new Error(t('cloudTranscription.transcriptionFailed'))
  }

  const data = await res.json()
  const text = speakerLabels ? formatSpeakerSegments(data) : (data.text || "")
  return { text, duration_seconds: null }
}

// ── Supabase proxy (prod mode) ─────────────────────────

async function transcribeViaProxy(fileUri, { speakerLabels } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error("AUTH_REQUIRED")

  // Generate a random per-file key and encrypt audio before upload
  const fileKey = crypto.randomBytes(32)
  const fileKeyBase64 = Buffer.from(fileKey).toString("base64")

  const fileContent = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  const rawBytes = decode(fileContent)
  const encryptedBytes = encryptBytes(rawBytes, fileKey)

  // Upload encrypted audio to Supabase Storage
  const filename = `transcribe/${session.user.id}/${Date.now()}.enc`
  const { error: uploadError } = await supabase.storage
    .from("audio-uploads")
    .upload(filename, encryptedBytes, {
      contentType: "application/octet-stream",
      upsert: true,
    })

  if (uploadError) {
    if (__DEV__) console.warn("Supabase upload error:", uploadError.message)
    throw new Error(t("cloudTranscription.uploadFailed"))
  }

  // Call edge function — returns transcript synchronously
  const { data, error } = await supabase.functions.invoke("transcribe", {
    body: {
      storage_path: filename,
      file_key: fileKeyBase64,
      speaker_labels: speakerLabels ?? false,
    },
  })

  if (error) throw error
  return { text: data.text || "", duration_seconds: null }
}

// ── Public API ─────────────────────────────────────────

export async function transcribe(fileUri, { speakerLabels } = {}) {
  if (DEV_API_KEY) return transcribeDirect(fileUri, { speakerLabels })
  return transcribeViaProxy(fileUri, { speakerLabels })
}

// ── Speaker diarization formatting ────────────────────

function formatSpeakerSegments(data) {
  if (!data.speaker_segments || data.speaker_segments.length === 0) {
    return data.text || ""
  }

  return data.speaker_segments
    .map((seg) => {
      const startSec = seg.start || 0
      const m = Math.floor(startSec / 60)
      const s = Math.floor(startSec % 60)
      const timestamp = `${m}:${s.toString().padStart(2, "0")}`
      const match = seg.speaker_id?.match(/(\d+)$/)
      const speaker = match ? String.fromCharCode(65 + parseInt(match[1], 10)) : "?"
      return `[Govornik ${speaker} – ${timestamp}] ${seg.text.trim()}`
    })
    .join("\n")
}

// Base64 decode helper
function decode(base64) {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}
