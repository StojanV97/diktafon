import { File, Directory, Paths } from "expo-file-system";
import * as Sentry from "@sentry/react-native";
import {
  syncJSONToICloud,
  uploadFileToICloud,
  writeFileToICloud,
  isSyncEnabled,
} from "./icloudSyncService";

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const journalDir = new Directory(Paths.document, "journal");
const audioDir = new Directory(journalDir, "audio");
const textsDir = new Directory(journalDir, "texts");
const foldersFile = new File(journalDir, "folders.json");
const entriesFile = new File(journalDir, "entries.json");

// In-memory cache — avoids re-reading + JSON-parsing on every read (esp. 5s polling)
let _foldersCache = null;
let _entriesCache = null;

// Corruption detection — set when both main + .bak files are unreadable
let _corruptionDetected = null;
// Last write error — for surfacing disk-full / permission errors to the UI
let _lastWriteError = null;

function ensureDirs() {
  journalDir.create({ idempotent: true });
  audioDir.create({ idempotent: true });
  textsDir.create({ idempotent: true });
}

async function readJSON(file) {
  // Return cached data if available (avoids disk I/O + JSON.parse)
  if (file === foldersFile && _foldersCache !== null) return _foldersCache;
  if (file === entriesFile && _entriesCache !== null) return _entriesCache;

  let result;
  try {
    if (!file.exists) { result = []; }
    else {
      const raw = await file.text();
      result = JSON.parse(raw);
    }
  } catch (e) {
    // Main file is corrupted — try the backup
    const bakFile = new File(file.parentDirectory, file.name + ".bak");
    if (bakFile.exists) {
      try {
        const bakRaw = await bakFile.text();
        result = JSON.parse(bakRaw);
        console.warn(`readJSON: ${file.name} corrupted, recovered from .bak`);
        file.write(bakRaw);
      } catch {
        console.warn(`readJSON: both ${file.name} and .bak are corrupted`);
        _corruptionDetected = file.name;
        Sentry.captureMessage(`Data corruption: ${file.name} and .bak both unreadable`, "error");
        result = [];
      }
    } else {
      console.warn(`readJSON: ${file.name} corrupted, no .bak available`);
      _corruptionDetected = file.name;
      Sentry.captureMessage(`Data corruption: ${file.name} corrupted, no .bak`, "error");
      result = [];
    }
  }

  if (file === foldersFile) _foldersCache = result;
  else if (file === entriesFile) _entriesCache = result;
  return result;
}

function writeJSON(file, data) {
  try {
    ensureDirs();
    const json = JSON.stringify(data);
    // Write to temp file first, then back up old file, then move temp into place
    const tmpFile = new File(file.parentDirectory, file.name + ".tmp");
    tmpFile.write(json);
    // Back up the current file before replacing
    if (file.exists) {
      const bakFile = new File(file.parentDirectory, file.name + ".bak");
      if (bakFile.exists) bakFile.delete();
      file.copy(bakFile);
    }
    // Move temp file to real path (atomic on most filesystems)
    if (file.exists) file.delete();
    tmpFile.move(file);

    // Update cache with written data
    if (file === foldersFile) _foldersCache = data;
    else if (file === entriesFile) _entriesCache = data;

    // Fire-and-forget iCloud sync
    if (file === foldersFile) {
      syncJSONToICloud("folders.json", data).catch(() => {})
    } else if (file === entriesFile) {
      syncJSONToICloud("entries.json", data).catch(() => {})
    }
  } catch (e) {
    console.warn(`writeJSON: failed to write ${file.name}:`, e);
    Sentry.captureException(e);
    _lastWriteError = e;
    throw e;
  }
}

export function getCorruptionStatus() {
  return _corruptionDetected;
}

export function getLastWriteError() {
  const err = _lastWriteError;
  _lastWriteError = null;
  return err;
}

function truncateText(text, max = 200) {
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + "...";
}

// ── Migration ──────────────────────────────────────────

export async function migrateData() {
  const folders = await readJSON(foldersFile);
  let changed = false;
  for (const folder of folders) {
    if (!folder.color) {
      folder.color = "#4A9EFF";
      changed = true;
    }
    if (!folder.tags) {
      folder.tags = [];
      changed = true;
    }
    if (folder.engine !== undefined) {
      delete folder.engine;
      changed = true;
    }
  }
  if (changed) writeJSON(foldersFile, folders);

  // Reset entries stuck in "processing" for >24 hours back to "recorded"
  const entries = await readJSON(entriesFile);
  let entriesFixed = false;
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    if (entry.status === "processing" && new Date(entry.created_at).getTime() < oneDayAgo) {
      entry.status = "recorded";
      delete entry.assemblyai_id;
      entriesFixed = true;
    }
  }
  if (entriesFixed) writeJSON(entriesFile, entries);

  // Backfill updated_at from created_at for conflict resolution
  const allEntries = await readJSON(entriesFile);
  let updatedAtFixed = false;
  for (const entry of allEntries) {
    if (!entry.updated_at) {
      entry.updated_at = entry.created_at;
      updatedAtFixed = true;
    }
  }
  if (updatedAtFixed) writeJSON(entriesFile, allEntries);

  // Backfill updated_at on folders
  const allFolders = await readJSON(foldersFile);
  let foldersUpdatedAtFixed = false;
  for (const folder of allFolders) {
    if (!folder.updated_at) {
      folder.updated_at = folder.created_at;
      foldersUpdatedAtFixed = true;
    }
  }
  if (foldersUpdatedAtFixed) writeJSON(foldersFile, allFolders);

  // Backfill recorded_date for existing daily log entries
  const dailyLogFolder = folders.find((f) => f.is_daily_log === true);
  if (dailyLogFolder) {
    const dailyEntries = await readJSON(entriesFile);
    let entriesChanged = false;
    for (const entry of dailyEntries) {
      if (entry.folder_id === dailyLogFolder.id && !entry.recorded_date) {
        entry.recorded_date = entry.created_at.slice(0, 10);
        entriesChanged = true;
      }
    }
    if (entriesChanged) writeJSON(entriesFile, dailyEntries);
  }
}

// ── Folders ─────────────────────────────────────────────

export async function createFolder(name, color = "#4A9EFF", tags = []) {
  const folders = await readJSON(foldersFile);
  const now = new Date().toISOString()
  const folder = {
    id: generateUUID(),
    name,
    color,
    tags,
    created_at: now,
    updated_at: now,
  };
  folders.unshift(folder);
  writeJSON(foldersFile, folders);
  return folder;
}

export async function fetchFolders() {
  return readJSON(foldersFile);
}

export async function getFolder(id) {
  const folders = await readJSON(foldersFile);
  return folders.find((f) => f.id === id) || null;
}

export async function updateFolder(id, updates) {
  const folders = await readJSON(foldersFile);
  const folder = folders.find((f) => f.id === id);
  if (!folder) return null;
  if (updates.name !== undefined) folder.name = updates.name;
  if (updates.color !== undefined) folder.color = updates.color;
  if (updates.tags !== undefined) folder.tags = updates.tags;
  folder.updated_at = new Date().toISOString();
  writeJSON(foldersFile, folders);
  return folder;
}

export async function getAllTags() {
  const folders = await readJSON(foldersFile);
  const tagSet = new Set();
  for (const folder of folders) {
    if (folder.tags) folder.tags.forEach((t) => tagSet.add(t));
  }
  return [...tagSet].sort();
}

export async function deleteFolder(id) {
  const folders = await readJSON(foldersFile);
  const idx = folders.findIndex((f) => f.id === id);
  if (idx === -1) return false;
  folders.splice(idx, 1);
  writeJSON(foldersFile, folders);

  // Cascade: delete all entries in this folder
  const entries = await readJSON(entriesFile);
  const toDelete = entries.filter((e) => e.folder_id === id);
  toDelete.forEach((e) => {
    const audioFile = new File(audioDir, `${e.id}.wav`);
    if (audioFile.exists) audioFile.delete();
    const textFile = new File(textsDir, `journal_${e.id}.txt`);
    if (textFile.exists) textFile.delete();
  });
  writeJSON(entriesFile, entries.filter((e) => e.folder_id !== id));
  return true;
}

// ── Entries ─────────────────────────────────────────────

export async function createEntry(folderId, filename, audioSourceUri, durationSeconds = 0, recordingType = "beleshka") {
  ensureDirs();
  const id = generateUUID();

  // Copy audio from recorder temp path to journal/audio/{id}.wav
  const source = new File(audioSourceUri);
  const dest = new File(audioDir, `${id}.wav`);
  source.copy(dest);

  const now = new Date().toISOString()
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
  writeJSON(entriesFile, entries);

  // Sync audio to iCloud (fire-and-forget)
  uploadFileToICloud(dest.uri, `audio/${id}.wav`).catch(() => {})

  return entry;
}

export async function fetchEntries(folderId) {
  const entries = await readJSON(entriesFile);
  return entries.filter((e) => e.folder_id === folderId);
}

export async function fetchEntry(entryId) {
  const entries = await readJSON(entriesFile);
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return null;

  // Load full text from file
  const textFile = new File(textsDir, `journal_${entryId}.txt`);
  if (textFile.exists) {
    try {
      entry.text = await textFile.text();
    } catch {
      // keep truncated text from JSON
    }
  }
  return entry;
}

export async function deleteEntry(entryId) {
  const entries = await readJSON(entriesFile);
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx === -1) return false;
  entries.splice(idx, 1);
  writeJSON(entriesFile, entries);

  const audioFile = new File(audioDir, `${entryId}.wav`);
  if (audioFile.exists) audioFile.delete();
  const textFile = new File(textsDir, `journal_${entryId}.txt`);
  if (textFile.exists) textFile.delete();
  return true;
}

// ── Transcription state ────────────────────────────────

export async function updateEntryToProcessing(entryId, assemblyaiId) {
  const entries = await readJSON(entriesFile);
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return null;
  entry.status = "processing";
  entry.assemblyai_id = assemblyaiId;
  entry.updated_at = new Date().toISOString();
  writeJSON(entriesFile, entries);
  return { ...entry };
}

export async function completeEntry(entryId, text, durationSeconds) {
  ensureDirs();

  // Write full text to file
  const textFile = new File(textsDir, `journal_${entryId}.txt`);
  textFile.write(text);

  const entries = await readJSON(entriesFile);
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return null;
  entry.status = "done";
  entry.text = truncateText(text);
  entry.duration_seconds = durationSeconds;
  entry.updated_at = new Date().toISOString();
  delete entry.assemblyai_id;
  writeJSON(entriesFile, entries);

  // Sync transcript to iCloud
  writeFileToICloud(`texts/journal_${entryId}.txt`, text).catch(() => {})

  return { ...entry, text };
}

export async function updateEntryText(entryId, newText) {
  ensureDirs()
  const textFile = new File(textsDir, `journal_${entryId}.txt`)
  textFile.write(newText)
  const entries = await readJSON(entriesFile)
  const entry = entries.find((e) => e.id === entryId)
  if (!entry) return null
  entry.text = truncateText(newText)
  entry.updated_at = new Date().toISOString()
  writeJSON(entriesFile, entries)

  // Sync transcript to iCloud
  writeFileToICloud(`texts/journal_${entryId}.txt`, newText).catch(() => {})

  return { ...entry, text: newText }
}

export async function failEntry(entryId, error) {
  const entries = await readJSON(entriesFile);
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return null;
  entry.status = "error";
  entry.text = error;
  entry.updated_at = new Date().toISOString();
  delete entry.assemblyai_id;
  writeJSON(entriesFile, entries);
  return { ...entry };
}

// ── Audio ───────────────────────────────────────────────

export function entryAudioUri(entryId) {
  const file = new File(audioDir, `${entryId}.wav`);
  return file.uri;
}

export function deleteEntryAudio(entryId) {
  const audioFile = new File(audioDir, `${entryId}.wav`);
  if (audioFile.exists) audioFile.delete();
}

// ── Daily Log ───────────────────────────────────────────

export async function getOrCreateDailyLogFolder() {
  const folders = await readJSON(foldersFile);
  let folder = folders.find((f) => f.is_daily_log === true);
  if (!folder) {
    const now = new Date().toISOString()
    folder = {
      id: generateUUID(),
      name: "Dnevni Log",
      color: "#3B5EDB",
      tags: [],
      is_daily_log: true,
      created_at: now,
      updated_at: now,
    };
    folders.unshift(folder);
    writeJSON(foldersFile, folders);
  }
  return folder;
}

export async function createDailyLogEntry(audioSourceUri, durationSeconds = 0) {
  const folder = await getOrCreateDailyLogFolder();
  ensureDirs();
  const id = generateUUID();

  const source = new File(audioSourceUri);
  const dest = new File(audioDir, `${id}.wav`);
  source.copy(dest);

  const now = new Date();
  const filename = `zapis_${now.toISOString().slice(0, 19).replace(/[T:]/g, "-")}.wav`;

  const nowISO = now.toISOString()
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
  writeJSON(entriesFile, entries);

  // Sync audio to iCloud
  uploadFileToICloud(dest.uri, `audio/${id}.wav`).catch(() => {})

  return entry;
}

export async function fetchDailyLogEntries() {
  const folders = await readJSON(foldersFile);
  const folder = folders.find((f) => f.is_daily_log === true);
  if (!folder) return [];
  const entries = await readJSON(entriesFile);
  return entries
    .filter((e) => e.folder_id === folder.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

export async function fetchDailyLogStats() {
  const today = new Date().toISOString().slice(0, 10);
  const entries = await fetchDailyLogEntries();
  const todayEntries = entries.filter(
    (e) => (e.recorded_date || e.created_at.slice(0, 10)) === today
  );
  return {
    clipCount: todayEntries.length,
    totalDuration: todayEntries.reduce((sum, e) => sum + (e.duration_seconds || 0), 0),
    latestTimestamp: todayEntries.length > 0 ? todayEntries[0].created_at : null,
  };
}

export async function getDailyCombinedTranscript(date) {
  const allEntries = await fetchDailyLogEntries();
  const dayEntries = allEntries
    .filter((e) => (e.recorded_date || e.created_at.slice(0, 10)) === date)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const parts = [];
  for (const entry of dayEntries) {
    if (entry.status !== "done") continue;
    const textFile = new File(textsDir, `journal_${entry.id}.txt`);
    let fullText = entry.text || "";
    if (textFile.exists) {
      try {
        fullText = await textFile.text();
      } catch {
        // fall back to truncated text from JSON
      }
    }
    const time = new Date(entry.created_at);
    const h = time.getHours().toString().padStart(2, "0");
    const m = time.getMinutes().toString().padStart(2, "0");
    parts.push(`[${h}:${m}]\n${fullText}`);
  }
  return parts.join("\n\n");
}

export async function getDailyCombinedTranscripts(dates) {
  const allEntries = await fetchDailyLogEntries();
  const results = {};

  for (const date of dates) {
    const dayEntries = allEntries
      .filter((e) => (e.recorded_date || e.created_at.slice(0, 10)) === date)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const parts = [];
    for (const entry of dayEntries) {
      if (entry.status !== "done") continue;
      const textFile = new File(textsDir, `journal_${entry.id}.txt`);
      let fullText = entry.text || "";
      if (textFile.exists) {
        try {
          fullText = await textFile.text();
        } catch {
          // fall back to truncated text from JSON
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

// ── Consolidation ───────────────────────────────────────

export async function consolidateDailyLogEntries(date) {
  const folder = await getOrCreateDailyLogFolder();
  const allEntries = await readJSON(entriesFile);

  const dayDone = allEntries
    .filter(
      (e) =>
        e.folder_id === folder.id &&
        (e.recorded_date || e.created_at.slice(0, 10)) === date &&
        e.status === "done"
    )
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  if (dayDone.length === 0) return null;

  // Build combined text with timestamps
  const parts = [];
  let totalDuration = 0;
  for (const entry of dayDone) {
    const textFile = new File(textsDir, `journal_${entry.id}.txt`);
    let fullText = entry.text || "";
    if (textFile.exists) {
      try {
        fullText = await textFile.text();
      } catch {
        // fall back to truncated text from JSON
      }
    }
    const time = new Date(entry.created_at);
    const h = time.getHours().toString().padStart(2, "0");
    const m = time.getMinutes().toString().padStart(2, "0");
    parts.push(`[${h}:${m}]\n${fullText}`);
    totalDuration += entry.duration_seconds || 0;
  }
  const combinedText = parts.join("\n\n");

  // Create new combined entry
  ensureDirs();
  const id = generateUUID();
  const combinedTextFile = new File(textsDir, `journal_${id}.txt`);
  combinedTextFile.write(combinedText);

  const combinedEntry = {
    id,
    folder_id: folder.id,
    filename: `kombinovano_${date}.txt`,
    text: truncateText(combinedText),
    created_at: dayDone[0].created_at,
    updated_at: new Date().toISOString(),
    duration_seconds: totalDuration,
    status: "done",
    audio_file: null,
    recorded_date: date,
  };

  // Delete originals (audio + text files)
  const doneIds = new Set(dayDone.map((e) => e.id));
  for (const entry of dayDone) {
    const audioFile = new File(audioDir, `${entry.id}.wav`);
    if (audioFile.exists) audioFile.delete();
    const textFile = new File(textsDir, `journal_${entry.id}.txt`);
    if (textFile.exists) textFile.delete();
  }

  // Update entries.json: remove originals, add combined
  const remaining = allEntries.filter((e) => !doneIds.has(e.id));
  remaining.unshift(combinedEntry);
  writeJSON(entriesFile, remaining);

  return { ...combinedEntry, text: combinedText };
}

// ── Bulk Import/Export ──────────────────────────────────

export async function exportAllData() {
  const folders = await readJSON(foldersFile);
  const entries = await readJSON(entriesFile);

  const audioFiles = [];
  const textFiles = [];

  for (const entry of entries) {
    const audioFile = new File(audioDir, `${entry.id}.wav`);
    if (audioFile.exists) {
      audioFiles.push({ id: entry.id, data: audioFile.bytes() });
    }
    const textFile = new File(textsDir, `journal_${entry.id}.txt`);
    if (textFile.exists) {
      textFiles.push({ id: entry.id, text: await textFile.text() });
    }
  }

  return { folders, entries, audioFiles, textFiles };
}

export function importAllData(data) {
  ensureDirs();
  writeJSON(foldersFile, data.folders);
  writeJSON(entriesFile, data.entries);

  let audioCount = 0;
  let textCount = 0;

  for (const { id, data: audioData } of data.audioFiles) {
    const dest = new File(audioDir, `${id}.wav`);
    dest.write(audioData);
    audioCount++;
  }

  for (const { id, text } of data.textFiles) {
    const dest = new File(textsDir, `journal_${id}.txt`);
    dest.write(text);
    textCount++;
  }

  return {
    folders: data.folders.length,
    entries: data.entries.length,
    audioFiles: audioCount,
    textFiles: textCount,
  };
}

// ── iCloud Sync Support ─────────────────────────────────

export async function getRawFolders() {
  return readJSON(foldersFile)
}

export async function getRawEntries() {
  return readJSON(entriesFile)
}

export function overwriteFolders(folders) {
  writeJSON(foldersFile, folders)
}

export function overwriteEntries(entries) {
  writeJSON(entriesFile, entries)
}

export async function moveEntryToFolder(entryId, targetFolderId) {
  const entries = await readJSON(entriesFile);
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return null;
  entry.folder_id = targetFolderId;
  entry.updated_at = new Date().toISOString();
  writeJSON(entriesFile, entries);
  return { ...entry };
}
