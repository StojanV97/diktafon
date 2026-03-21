import { useState, useRef, useCallback, useEffect } from "react"

export default function useAutoSave(saveFn, delay = 1500) {
  const [editableText, setEditableText] = useState("")
  const editableTextRef = useRef("")
  const saveTimerRef = useRef(null)
  const lastSavedRef = useRef("")

  const clearTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  const doSave = useCallback((text) => {
    if (!text || !text.trim()) return
    if (text === lastSavedRef.current) return
    lastSavedRef.current = text
    try {
      const result = saveFn(text)
      // Handle async saveFn — reset lastSavedRef on failure so next save retries
      if (result && typeof result.catch === "function") {
        result.catch(() => { lastSavedRef.current = "" })
      }
    } catch {
      // Sync failure (e.g. disk full) — reset so next save retries
      lastSavedRef.current = ""
    }
  }, [saveFn])

  const handleTextChange = useCallback((newText) => {
    setEditableText(newText)
    editableTextRef.current = newText
    clearTimer()
    saveTimerRef.current = setTimeout(() => {
      doSave(newText)
    }, delay)
  }, [clearTimer, doSave, delay])

  const flush = useCallback(() => {
    clearTimer()
    doSave(editableTextRef.current)
  }, [clearTimer, doSave])

  const init = useCallback((text) => {
    setEditableText(text)
    editableTextRef.current = text
    lastSavedRef.current = text
  }, [])

  useEffect(() => {
    return () => {
      clearTimer()
      doSave(editableTextRef.current)
    }
  }, [clearTimer, doSave])

  return { editableText, handleTextChange, flush, init }
}
