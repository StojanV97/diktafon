import * as Sentry from "@sentry/react-native"
import * as whisperService from "./whisperService"
import * as cloudService from "./cloudTranscriptionService"
import { isPremium } from "./subscriptionService"
import {
  fetchEntry,
  getDecryptedAudioUri,
  completeEntry,
  failEntry,
} from "./journalStorage"

export async function preflight(engine) {
  if (engine === "local") {
    const status = whisperService.getModelStatus()
    if (!status.downloaded) return { ready: false, reason: "MODEL_NOT_DOWNLOADED" }
    return { ready: true }
  }
  // Dev mode: skip premium check if .env key is present
  if (cloudService.hasDevKey()) return { ready: true }
  const premium = await isPremium()
  if (!premium) return { ready: false, reason: "PREMIUM_REQUIRED" }
  return { ready: true }
}

export async function transcribeSingle(entryId, engine, { onStatusChange, onError }) {
  const entry = await fetchEntry(entryId)
  const audioUri = await getDecryptedAudioUri(entryId)

  try {
    if (engine === "cloud") {
      const speakerLabels = (entry.recording_type || "beleshka") === "razgovor"
      onStatusChange?.(entryId, { ...entry, status: "processing" })
      const { text } = await cloudService.transcribe(audioUri, { speakerLabels })
      const updated = await completeEntry(entryId, text, null)
      onStatusChange?.(entryId, updated)
    } else {
      onStatusChange?.(entryId, { ...entry, status: "processing" })
      const { text, duration_seconds } = await whisperService.transcribe(audioUri)
      const updated = await completeEntry(entryId, text, duration_seconds)
      onStatusChange?.(entryId, updated)
    }
  } catch (e) {
    Sentry.captureException(e, { extra: { entryId, engine } })
    const updated = await failEntry(entryId, e.message)
    if (updated) onStatusChange?.(entryId, updated)
    onError?.(entryId, e)
  }
}

export async function transcribeBatch(entryIds, engine, callbacks) {
  if (engine === "local") {
    // Sequential — whisper is single-threaded
    for (const entryId of entryIds) {
      await transcribeSingle(entryId, engine, callbacks)
    }
  } else {
    // Parallel for cloud
    await Promise.all(
      entryIds.map((entryId) => transcribeSingle(entryId, engine, callbacks))
    )
  }
}
