import { useEffect, useMemo, useRef, useState } from "react"
import { AppState } from "react-native"
import * as whisperService from "../services/whisperService"
import {
  preflight,
  transcribeSingle,
  transcribeBatch,
  pollProcessingEntries,
} from "../services/transcriptionService"

export function useTranscription({ entries, setEntries, onComplete }) {
  const [modelDownloadVisible, setModelDownloadVisible] = useState(false)
  const [modelDownloadProgress, setModelDownloadProgress] = useState(0)

  const entriesRef = useRef(entries)
  entriesRef.current = entries

  const hasProcessing = useMemo(
    () => entries.some((e) => e.status === "processing"),
    [entries]
  )

  // Poll processing entries every 5 seconds
  useEffect(() => {
    if (!hasProcessing) return

    const intervalId = setInterval(async () => {
      if (AppState.currentState !== "active") return
      const changed = await pollProcessingEntries(entriesRef.current)
      if (changed.length === 0) return
      setEntries((prev) =>
        prev.map((e) => {
          const update = changed.find((c) => c.entryId === e.id)
          return update ? update.entry : e
        })
      )
      onComplete?.()
    }, 5000)

    return () => clearInterval(intervalId)
  }, [hasProcessing])

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
        return { ready: false, message: "Preuzimanje modela nije uspelo: " + e.message }
      }
    }

    if (check.reason === "PREMIUM_REQUIRED") {
      return { ready: false, reason: "PREMIUM_REQUIRED", message: "Potrebna je Premium pretplata za AssemblyAI transkripciju." }
    }

    return { ready: false, message: "Nepoznata greska" }
  }

  const startTranscription = async (entryId, engine) => {
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

  const startBatchTranscription = async (entryIds, engine) => {
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
