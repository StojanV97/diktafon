import * as assemblyAIService from "./assemblyAIService"
import * as whisperService from "./whisperService"
import { getSettings } from "./settingsService"
import { parseReminder } from "./reminderParseService"
import { t } from "../src/i18n"

const POLL_INTERVAL_MS = 3000
const MAX_POLLS = 60 // 3 minutes max

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function transcribeWithAssemblyAI(audioUri) {
  const { assemblyai_id } = await assemblyAIService.submit(audioUri, {
    speakerLabels: false,
  })

  for (let i = 0; i < MAX_POLLS; i++) {
    await delay(POLL_INTERVAL_MS)
    const result = await assemblyAIService.check(assemblyai_id)
    if (result.status === "done") return result.text
    if (result.status === "error") {
      throw new Error(result.error || t("reminders.transcriptionFailed"))
    }
  }
  throw new Error(t("reminders.transcriptionFailed"))
}

async function transcribeWithWhisper(audioUri) {
  const { text } = await whisperService.transcribe(audioUri)
  if (!text) throw new Error(t("reminders.transcriptionFailed"))
  return text
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

  const { defaultEngine } = await getSettings()
  const transcript = defaultEngine === "assemblyai"
    ? await transcribeWithAssemblyAI(audioUri)
    : await transcribeWithWhisper(audioUri)

  // Parse with Claude Haiku
  onStateChange?.("parsing")
  const parsed = await parseReminder(transcript)

  return { transcript, parsed }
}
