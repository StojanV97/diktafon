import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as Sentry from "@sentry/react-native";
import {
  foldersFile, entriesFile, audioDir, textsDir,
  readJSON, writeJSON, withWriteLock, ensureDirs, generateUUID,
  writeEncryptedText, readDecryptedText,
} from "./storageCore";
import { encryptAudioFile } from "./audioHelpers";
import {
  uploadFileToCloud,
  deleteEntryFilesFromCloud,
} from "../../../services/cloudSyncService";

export function createEntry(
  folderId: string,
  filename: string,
  audioSourceUri: string,
  durationSeconds = 0,
  recordingType = "beleshka"
) {
  return withWriteLock(async () => {
    ensureDirs();
    const id = generateUUID();

    const dest = new File(audioDir, `${id}.wav`);
    await FileSystem.copyAsync({ from: audioSourceUri, to: dest.uri });

    await encryptAudioFile(dest);

    const now = new Date().toISOString();
    const entry = {
      id,
      folder_id: folderId,
      filename,
      text: "",
      created_at: now,
      updated_at: now,
      duration_seconds: durationSeconds,
      status: "recorded",
      audio_file: `${id}.wav`,
      recording_type: recordingType,
    };

    const entries = await readJSON(entriesFile);
    entries.unshift(entry);
    await writeJSON(entriesFile, entries);

    uploadFileToCloud(dest.uri, `audio/${id}.wav`).catch((e: Error) =>
      Sentry.captureMessage("Cloud sync failed: " + e.message, "warning")
    );

    return entry;
  });
}

export async function fetchEntries(folderId: string) {
  const entries = await readJSON(entriesFile);
  return entries.filter((e: any) => e.folder_id === folderId && !e.deleted_locally);
}

export async function fetchEntry(entryId: string) {
  const entries = await readJSON(entriesFile);
  const entry = entries.find((e: any) => e.id === entryId);
  if (!entry) return null;

  const textFile = new File(textsDir, `journal_${entryId}.txt`);
  if (textFile.exists) {
    try {
      entry.text = await readDecryptedText(textFile);
    } catch {
      // keep text from JSON
    }
  }
  return entry;
}

export function deleteEntry(entryId: string) {
  return withWriteLock(async () => {
    const entries = await readJSON(entriesFile);
    const idx = entries.findIndex((e: any) => e.id === entryId);
    if (idx === -1) return false;
    entries.splice(idx, 1);
    await writeJSON(entriesFile, entries);

    const audioFile = new File(audioDir, `${entryId}.wav`);
    if (audioFile.exists) audioFile.delete();
    const textFile = new File(textsDir, `journal_${entryId}.txt`);
    if (textFile.exists) textFile.delete();
    return true;
  });
}

export function tombstoneEntry(entryId: string) {
  return withWriteLock(async () => {
    const entries = await readJSON(entriesFile);
    const entry = entries.find((e: any) => e.id === entryId);
    if (!entry) return false;
    entry.deleted_locally = true;
    entry.updated_at = new Date().toISOString();
    await writeJSON(entriesFile, entries);

    const audioFile = new File(audioDir, `${entryId}.wav`);
    if (audioFile.exists) audioFile.delete();
    const textFile = new File(textsDir, `journal_${entryId}.txt`);
    if (textFile.exists) textFile.delete();
    return true;
  });
}

export function deleteEntryWithICloud(entryId: string) {
  return withWriteLock(async () => {
    const entries = await readJSON(entriesFile);
    const idx = entries.findIndex((e: any) => e.id === entryId);
    if (idx === -1) return false;
    entries.splice(idx, 1);
    await writeJSON(entriesFile, entries);

    const audioFile = new File(audioDir, `${entryId}.wav`);
    if (audioFile.exists) audioFile.delete();
    const textFile = new File(textsDir, `journal_${entryId}.txt`);
    if (textFile.exists) textFile.delete();

    deleteEntryFilesFromCloud(entryId).catch(() => {});
    return true;
  });
}

export async function getTombstonedEntries() {
  const entries = await readJSON(entriesFile);
  return entries.filter((e: any) => e.deleted_locally === true);
}

export function reviveTombstonedRecords() {
  return withWriteLock(async () => {
    const folders = await readJSON(foldersFile);
    let foldersChanged = false;
    for (const f of folders) {
      if (f.deleted_locally) {
        delete f.deleted_locally;
        f.updated_at = new Date().toISOString();
        foldersChanged = true;
      }
    }
    if (foldersChanged) await writeJSON(foldersFile, folders);

    const entries = await readJSON(entriesFile);
    let entriesChanged = false;
    for (const e of entries) {
      if (e.deleted_locally) {
        delete e.deleted_locally;
        e.updated_at = new Date().toISOString();
        entriesChanged = true;
      }
    }
    if (entriesChanged) await writeJSON(entriesFile, entries);
  });
}

// ── Transcription state ────────────────────────────────

export function updateEntryToProcessing(entryId: string, assemblyaiId: string) {
  return withWriteLock(async () => {
    const entries = await readJSON(entriesFile);
    const entry = entries.find((e: any) => e.id === entryId);
    if (!entry) return null;
    entry.status = "processing";
    entry.assemblyai_id = assemblyaiId;
    entry.updated_at = new Date().toISOString();
    await writeJSON(entriesFile, entries);
    return { ...entry };
  });
}

export function completeEntry(entryId: string, text: string, durationSeconds: number) {
  return withWriteLock(async () => {
    ensureDirs();
    const entries = await readJSON(entriesFile);
    const entry = entries.find((e: any) => e.id === entryId);
    if (!entry) return null;

    entry.status = "done";
    entry.text = "";
    entry.encrypted = true;
    entry.duration_seconds = durationSeconds;
    entry.updated_at = new Date().toISOString();
    delete entry.assemblyai_id;
    await writeJSON(entriesFile, entries);

    const textFile = new File(textsDir, `journal_${entryId}.txt`);
    await writeEncryptedText(textFile, text);

    uploadFileToCloud(textFile.uri, `texts/journal_${entryId}.txt`).catch((e: Error) =>
      Sentry.captureMessage("Cloud sync failed: " + e.message, "warning")
    );

    return { ...entry, text };
  });
}

export function updateEntryText(entryId: string, newText: string) {
  return withWriteLock(async () => {
    ensureDirs();
    const entries = await readJSON(entriesFile);
    const entry = entries.find((e: any) => e.id === entryId);
    if (!entry) return null;
    entry.text = "";
    entry.encrypted = true;
    entry.updated_at = new Date().toISOString();
    await writeJSON(entriesFile, entries);

    const textFile = new File(textsDir, `journal_${entryId}.txt`);
    await writeEncryptedText(textFile, newText);

    uploadFileToCloud(textFile.uri, `texts/journal_${entryId}.txt`).catch((e: Error) =>
      Sentry.captureMessage("Cloud sync failed: " + e.message, "warning")
    );

    return { ...entry, text: newText };
  });
}

export function failEntry(entryId: string, error?: string) {
  return withWriteLock(async () => {
    const entries = await readJSON(entriesFile);
    const entry = entries.find((e: any) => e.id === entryId);
    if (!entry) return null;
    entry.status = "error";
    entry.text = "";
    entry.updated_at = new Date().toISOString();
    delete entry.assemblyai_id;
    await writeJSON(entriesFile, entries);
    return { ...entry };
  });
}

export function moveEntryToFolder(entryId: string, targetFolderId: string) {
  return withWriteLock(async () => {
    const entries = await readJSON(entriesFile);
    const entry = entries.find((e: any) => e.id === entryId);
    if (!entry) return null;
    entry.folder_id = targetFolderId;
    entry.updated_at = new Date().toISOString();
    await writeJSON(entriesFile, entries);
    return { ...entry };
  });
}
