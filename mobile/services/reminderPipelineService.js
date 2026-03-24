import * as assemblyAIService from "./assemblyAIService"
import { parseReminder } from "./reminderParseService"
import { t } from "../src/i18n"

const POLL_INTERVAL_MS = 3000
const MAX_POLLS = 60 // 3 minutes max

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Full reminder pipeline: transcribe audio -> parse with LLM -> return result.
 * Audio file is NOT saved — caller should delete it after use.
 *
 * @param {string} audioUri - Path to recorded audio file
 * @param {(state: string) => void} onStateChange - Called with "transcribing" | "parsing"
 * @returns {{ transcript: string, parsed: ParsedReminderResult }}
 */
export async function processReminderRecording(audioUri, onStateChange) {
  onStateChange?.("transcribing")

  // 1. Submit to AssemblyAI (always cloud, no speaker labels for short clips)
  const { assemblyai_id } = await assemblyAIService.submit(audioUri, {
    speakerLabels: false,
  })

  // 2. Poll for transcription result
  let transcript = null
  for (let i = 0; i < MAX_POLLS; i++) {
    await delay(POLL_INTERVAL_MS)
    const result = await assemblyAIService.check(assemblyai_id)
    if (result.status === "done") {
      transcript = result.text
      break
    }
    if (result.status === "error") {
      throw new Error(result.error || t("reminders.transcriptionFailed"))
    }
  }
  if (!transcript) {
    throw new Error(t("reminders.transcriptionFailed"))
  }

  // 3. Parse with Claude Haiku
  onStateChange?.("parsing")
  const parsed = await parseReminder(transcript)

  return { transcript, parsed }
}
