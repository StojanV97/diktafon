import * as Sentry from "@sentry/react-native"
import * as whisperService from "./whisperService"
import * as assemblyAIService from "./assemblyAIService"
import { isPremium } from "./subscriptionService"
import {
  fetchEntry,
  entryAudioUri,
  updateEntryToProcessing,
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
  if (assemblyAIService.hasDevKey()) return { ready: true }
  const premium = await isPremium()
  if (!premium) return { ready: false, reason: "PREMIUM_REQUIRED" }
  return { ready: true }
}

export async function transcribeSingle(entryId, engine, { onStatusChange, onError }) {
  const entry = await fetchEntry(entryId)
  const audioUri = entryAudioUri(entryId)

  try {
    if (engine === "assemblyai") {
      const speakerLabels = (entry.recording_type || "beleshka") === "razgovor"
      const { assemblyai_id } = await assemblyAIService.submit(audioUri, { speakerLabels })
      const updated = await updateEntryToProcessing(entryId, assemblyai_id)
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

const MAX_CONSECUTIVE_FAILURES = 12 // 12 consecutive failures before giving up
const MAX_TOTAL_FAILURES = 60
const BACKOFF_AFTER = 3 // skip every other poll after 3+ consecutive failures
const _pollState = {} // { consecutive: number, total: number }

export async function pollProcessingEntries(entries) {
  const processing = entries.filter(
    (e) => e.status === "processing" && e.assemblyai_id
  )
  if (processing.length === 0) return []

  const processingIds = new Set(processing.map((e) => e.id))
  // Clean up stale keys for entries no longer processing
  for (const key of Object.keys(_pollState)) {
    if (!processingIds.has(key)) delete _pollState[key]
  }

  const changed = []
  await Promise.all(
    processing.map(async (e) => {
      const state = _pollState[e.id] || { consecutive: 0, total: 0 }

      // Simple backoff: skip every other poll after BACKOFF_AFTER consecutive failures
      if (state.consecutive >= BACKOFF_AFTER && state.total % 2 !== 0) {
        state.total++
        _pollState[e.id] = state
        return
      }

      try {
        const result = await assemblyAIService.check(e.assemblyai_id)
        // Reset on success
        delete _pollState[e.id]
        if (result.status === "done") {
          const updated = await completeEntry(e.id, result.text, result.duration_seconds)
          if (updated) changed.push({ entryId: e.id, entry: updated })
        } else if (result.status === "error") {
          const updated = await failEntry(e.id, result.error)
          if (updated) changed.push({ entryId: e.id, entry: updated })
        }
      } catch (err) {
        state.consecutive++
        state.total++
        _pollState[e.id] = state

        if (state.consecutive >= MAX_CONSECUTIVE_FAILURES || state.total >= MAX_TOTAL_FAILURES) {
          Sentry.captureException(err, {
            extra: { entryId: e.id, assemblyaiId: e.assemblyai_id, consecutive: state.consecutive, total: state.total },
          })
          const updated = await failEntry(e.id, "Transkripcija nije uspela. Pokusajte ponovo.")
          if (updated) changed.push({ entryId: e.id, entry: updated })
          delete _pollState[e.id]
        }
      }
    })
  )
  return changed
}
