import { useState } from "react"
import * as whisperService from "../services/whisperService"
import { t } from "../src/i18n"
import {
  preflight,
  resolveEngine,
  transcribeSingle,
  transcribeBatch,
} from "../services/transcriptionService"

export function useTranscription({ entries, setEntries, onComplete }) {
  const [modelDownloadVisible, setModelDownloadVisible] = useState(false)
  const [modelDownloadProgress, setModelDownloadProgress] = useState(0)

  const updateEntry = (entryId, updated) => {
    setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)))
  }

  const handlePreflight = async (engine) => {
    const check = await preflight(engine)
    if (check.ready) return { ready: true }

    if (check.reason === "MODEL_NOT_DOWNLOADED") {
      setModelDownloadProgress(0)
      setModelDownloadVisible(true)
      try {
        await whisperService.downloadModel((p) => setModelDownloadProgress(p))
        setModelDownloadVisible(false)
        return { ready: true }
      } catch (e) {
        setModelDownloadVisible(false)
        return { ready: false, message: t("errors.modelDownloadFailed", { error: e.message }) }
      }
    }

    if (check.reason === "PREMIUM_REQUIRED") {
      return { ready: false, reason: "PREMIUM_REQUIRED", message: t("errors.premiumRequired") }
    }

    return { ready: false, message: t("errors.unknown") }
  }

  const startTranscription = async (entryId) => {
    const engine = await resolveEngine()
    const preflightResult = await handlePreflight(engine)
    if (!preflightResult.ready) return { started: false, message: preflightResult.message }

    let error = null
    await transcribeSingle(entryId, engine, {
      onStatusChange: updateEntry,
      onError: (_id, e) => { error = e.message },
    })
    onComplete?.()
    return error ? { started: true, error } : { started: true }
  }

  const startBatchTranscription = async (entryIds) => {
    const engine = await resolveEngine()
    const preflightResult = await handlePreflight(engine)
    if (!preflightResult.ready) return { started: false, message: preflightResult.message }

    const errors = []
    await transcribeBatch(entryIds, engine, {
      onStatusChange: updateEntry,
      onError: (id, e) => { errors.push({ id, message: e.message }) },
    })
    onComplete?.()
    return { started: true, errors }
  }

  return {
    startTranscription,
    startBatchTranscription,
    modelDownload: { visible: modelDownloadVisible, progress: modelDownloadProgress },
  }
}
