import * as whisperService from "./whisperService"
import * as assemblyAIService from "./assemblyAIService"
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
  const hasKey = await assemblyAIService.hasApiKey()
  if (!hasKey) return { ready: false, reason: "API_KEY_MISSING" }
  return { ready: true }
}

export async function transcribeSingle(entryId, engine, { onStatusChange, onError }) {
  const entry = await fetchEntry(entryId)
  const audioUri = entryAudioUri(entryId)

  try {
    if (engine === "assemblyai") {
      const speakerLabels = (entry.recording_type || "beleshka") === "razgovor"
      const { assemblyai_id } = await assemblyAIService.submitAndGetId(audioUri, { speakerLabels })
      const updated = await updateEntryToProcessing(entryId, assemblyai_id)
      onStatusChange?.(entryId, updated)
    } else {
      onStatusChange?.(entryId, { ...entry, status: "processing" })
      const { text, duration_seconds } = await whisperService.transcribe(audioUri)
      const updated = await completeEntry(entryId, text, duration_seconds)
      onStatusChange?.(entryId, updated)
    }
  } catch (e) {
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

export async function pollProcessingEntries(entries) {
  const processing = entries.filter(
    (e) => e.status === "processing" && e.assemblyai_id
  )
  if (processing.length === 0) return []

  const changed = []
  await Promise.all(
    processing.map(async (e) => {
      try {
        const result = await assemblyAIService.checkTranscript(e.assemblyai_id)
        if (result.status === "done") {
          const updated = await completeEntry(e.id, result.text, result.duration_seconds)
          if (updated) changed.push({ entryId: e.id, entry: updated })
        } else if (result.status === "error") {
          const updated = await failEntry(e.id, result.error)
          if (updated) changed.push({ entryId: e.id, entry: updated })
        }
      } catch {
        // Retry next interval
      }
    })
  )
  return changed
}
