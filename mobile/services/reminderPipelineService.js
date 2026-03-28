import * as cloudService from "./cloudTranscriptionService"
import * as whisperService from "./whisperService"
import { resolveEngine } from "./transcriptionService"
import { parseReminder } from "./reminderParseService"
import { t } from "../src/i18n"

async function transcribeWithCloud(audioUri) {
  const { text } = await cloudService.transcribe(audioUri)
  if (!text) throw new Error(t("reminders.transcriptionFailed"))
  return text
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

  const engine = await resolveEngine()
  const transcript = engine === "cloud"
    ? await transcribeWithCloud(audioUri)
    : await transcribeWithWhisper(audioUri)

  // Parse with Claude Haiku
  onStateChange?.("parsing")
  const parsed = await parseReminder(transcript)

  return { transcript, parsed }
}
