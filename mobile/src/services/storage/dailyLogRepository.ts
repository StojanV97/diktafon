import { File } from "expo-file-system";
import * as Sentry from "@sentry/react-native";
import {
  foldersFile, entriesFile, audioDir, textsDir,
  readJSON, writeJSON, withWriteLock, ensureDirs, generateUUID,
  writeEncryptedText, readDecryptedText,
  DAILY_LOG_FOLDER_NAME, DAILY_LOG_FOLDER_COLOR,
} from "./storageCore";
import { encryptAudioFile } from "./audioHelpers";
import { uploadFileToICloud } from "../../../services/icloudSyncService";

// Internal version (no lock) — used by createDailyLogEntry / consolidateDailyLogEntries
// which already hold the write lock
async function _getOrCreateDailyLogFolder() {
  const folders = await readJSON(foldersFile);
  let folder = folders.find((f: any) => f.is_daily_log === true);
  if (!folder) {
    const now = new Date().toISOString();
    folder = {
      id: generateUUID(),
      name: DAILY_LOG_FOLDER_NAME,
      color: DAILY_LOG_FOLDER_COLOR,
      tags: [],
      is_daily_log: true,
      created_at: now,
      updated_at: now,
    };
    folders.unshift(folder);
    await writeJSON(foldersFile, folders);
  }
  return folder;
}

export function getOrCreateDailyLogFolder() {
  return withWriteLock(() => _getOrCreateDailyLogFolder());
}

export function createDailyLogEntry(audioSourceUri: string, durationSeconds = 0) {
  return withWriteLock(async () => {
    const folder = await _getOrCreateDailyLogFolder();
    ensureDirs();
    const id = generateUUID();

    const source = new File(audioSourceUri);
    const dest = new File(audioDir, `${id}.wav`);
    source.copy(dest);

    await encryptAudioFile(dest);

    const now = new Date();
    const filename = `zapis_${now.toISOString().slice(0, 19).replace(/[T:]/g, "-")}.wav`;

    const nowISO = now.toISOString();
    const entry = {
      id,
      folder_id: folder.id,
      filename,
      text: "",
      created_at: nowISO,
      updated_at: nowISO,
      duration_seconds: durationSeconds,
      status: "recorded",
      audio_file: `${id}.wav`,
      recorded_date: nowISO.slice(0, 10),
      recording_type: "beleshka",
    };

    const entries = await readJSON(entriesFile);
    entries.unshift(entry);
    await writeJSON(entriesFile, entries);

    uploadFileToICloud(dest.uri, `audio/${id}.wav`).catch((e: Error) =>
      Sentry.captureMessage("iCloud sync failed: " + e.message, "warning")
    );

    return entry;
  });
}

export async function fetchDailyLogEntries() {
  const folders = await readJSON(foldersFile);
  const folder = folders.find((f: any) => f.is_daily_log === true);
  if (!folder) return [];
  const entries = await readJSON(entriesFile);
  return entries
    .filter((e: any) => e.folder_id === folder.id && !e.deleted_locally)
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function fetchDailyLogStats() {
  const today = new Date().toISOString().slice(0, 10);
  const entries = await fetchDailyLogEntries();
  const todayEntries = entries.filter(
    (e: any) => (e.recorded_date || e.created_at.slice(0, 10)) === today
  );
  return {
    clipCount: todayEntries.length,
    totalDuration: todayEntries.reduce((sum: number, e: any) => sum + (e.duration_seconds || 0), 0),
    latestTimestamp: todayEntries.length > 0 ? todayEntries[0].created_at : null,
  };
}

export async function getDailyCombinedTranscript(date: string) {
  const allEntries = await fetchDailyLogEntries();
  const dayEntries = allEntries
    .filter((e: any) => (e.recorded_date || e.created_at.slice(0, 10)) === date)
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const parts: string[] = [];
  for (const entry of dayEntries) {
    if (entry.status !== "done") continue;
    const textFile = new File(textsDir, `journal_${entry.id}.txt`);
    let fullText = entry.text || "";
    if (textFile.exists) {
      try {
        fullText = await readDecryptedText(textFile);
      } catch {
        // fall back to text from JSON
      }
    }
    const time = new Date(entry.created_at);
    const h = time.getHours().toString().padStart(2, "0");
    const m = time.getMinutes().toString().padStart(2, "0");
    parts.push(`[${h}:${m}]\n${fullText}`);
  }
  return parts.join("\n\n");
}

export async function getDailyCombinedTranscripts(dates: string[]) {
  const allEntries = await fetchDailyLogEntries();
  const results: Record<string, string> = {};

  for (const date of dates) {
    const dayEntries = allEntries
      .filter((e: any) => (e.recorded_date || e.created_at.slice(0, 10)) === date)
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const parts: string[] = [];
    for (const entry of dayEntries) {
      if (entry.status !== "done") continue;
      const textFile = new File(textsDir, `journal_${entry.id}.txt`);
      let fullText = entry.text || "";
      if (textFile.exists) {
        try {
          fullText = await readDecryptedText(textFile);
        } catch {
          // fall back to text from JSON
        }
      }
      const time = new Date(entry.created_at);
      const h = time.getHours().toString().padStart(2, "0");
      const m = time.getMinutes().toString().padStart(2, "0");
      parts.push(`[${h}:${m}]\n${fullText}`);
    }
    results[date] = parts.join("\n\n");
  }
  return results;
}

export function consolidateDailyLogEntries(date: string) {
  return withWriteLock(async () => {
    const folder = await _getOrCreateDailyLogFolder();
    const allEntries = await readJSON(entriesFile);

    const dayDone = allEntries
      .filter(
        (e: any) =>
          e.folder_id === folder.id &&
          (e.recorded_date || e.created_at.slice(0, 10)) === date &&
          e.status === "done"
      )
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (dayDone.length === 0) return null;

    const parts: string[] = [];
    let totalDuration = 0;
    for (const entry of dayDone) {
      const textFile = new File(textsDir, `journal_${entry.id}.txt`);
      let fullText = entry.text || "";
      if (textFile.exists) {
        try {
          fullText = await readDecryptedText(textFile);
        } catch {
          // fall back to text from JSON
        }
      }
      const time = new Date(entry.created_at);
      const h = time.getHours().toString().padStart(2, "0");
      const m = time.getMinutes().toString().padStart(2, "0");
      parts.push(`[${h}:${m}]\n${fullText}`);
      totalDuration += entry.duration_seconds || 0;
    }
    const combinedText = parts.join("\n\n");

    ensureDirs();
    const id = generateUUID();
    const combinedTextFile = new File(textsDir, `journal_${id}.txt`);
    await writeEncryptedText(combinedTextFile, combinedText);

    uploadFileToICloud(combinedTextFile.uri, `texts/journal_${id}.txt`).catch((e: Error) =>
      Sentry.captureMessage("iCloud sync failed for combined text: " + e.message, "warning")
    );

    const combinedEntry = {
      id,
      folder_id: folder.id,
      filename: `kombinovano_${date}.txt`,
      text: "",
      encrypted: true,
      created_at: dayDone[0].created_at,
      updated_at: new Date().toISOString(),
      duration_seconds: totalDuration,
      status: "done",
      audio_file: null,
      recorded_date: date,
    };

    const doneIds = new Set(dayDone.map((e: any) => e.id));
    const remaining = allEntries.filter((e: any) => !doneIds.has(e.id));
    remaining.unshift(combinedEntry);
    await writeJSON(entriesFile, remaining);

    for (const entry of dayDone) {
      const audioFile = new File(audioDir, `${entry.id}.wav`);
      if (audioFile.exists) audioFile.delete();
      const textFile = new File(textsDir, `journal_${entry.id}.txt`);
      if (textFile.exists) textFile.delete();
    }

    return { ...combinedEntry, text: combinedText };
  });
}
