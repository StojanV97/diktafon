import { File, Directory, Paths } from "expo-file-system";
import * as Sentry from "@sentry/react-native";
import crypto from "react-native-quick-crypto";
import {
  syncJSONToICloud,
  uploadFileToICloud,
  deleteEntryFilesFromICloud,
} from "./icloudSyncService";
import {
  getEncryptionKey,
  encryptText,
  decryptText,
  encryptBytes,
  decryptBytes,
} from "./cryptoService";

function generateUUID() {
  return crypto.randomUUID();
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

// Serialized write queue — prevents concurrent read-modify-write races
let _writeQueue = Promise.resolve()

function withWriteLock(fn) {
  const result = _writeQueue.then(fn)
  _writeQueue = result.then(() => {}, () => {})
  return result
}

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
        if (__DEV__) console.warn(`readJSON: ${file.name} corrupted, recovered from .bak`);
        file.write(bakRaw);
      } catch {
        if (__DEV__) console.warn(`readJSON: both ${file.name} and .bak are corrupted`);
        _corruptionDetected = file.name;
        Sentry.captureMessage(`Data corruption: ${file.name} and .bak both unreadable`, "error");
        result = [];
      }
    } else {
      if (__DEV__) console.warn(`readJSON: ${file.name} corrupted, no .bak available`);
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
      syncJSONToICloud("folders.json", data).catch((e) => Sentry.captureMessage("iCloud sync failed: " + e.message, "warning"))
    } else if (file === entriesFile) {
      syncJSONToICloud("entries.json", data).catch((e) => Sentry.captureMessage("iCloud sync failed: " + e.message, "warning"))
    }
  } catch (e) {
    if (__DEV__) console.warn(`writeJSON: failed to write ${file.name}:`, e);
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

// ── Encryption helpers ─────────────────────────────────

async function writeEncryptedText(textFile, plaintext) {
  const key = await getEncryptionKey()
  if (key) {
    const encrypted = encryptText(plaintext, key)
    textFile.write(encrypted)
  } else {
    textFile.write(plaintext)
  }
}

async function readDecryptedText(textFile) {
  const key = await getEncryptionKey()
  if (!key) {
    // No encryption key — read as plaintext
    return await textFile.text()
  }
  try {
    // Try decrypting as encrypted binary
    const bytes = textFile.bytes()
    return decryptText(bytes, key)
  } catch {
    // Likely a legacy plaintext file — read as UTF-8
    try {
      return await textFile.text()
    } catch {
      return ""
    }
  }
}

// ── Audio encryption helpers ───────────────────────────

const tempAudioDir = new Directory(Paths.cache, "decrypted_audio");

async function encryptAudioFile(audioFile) {
  const key = await getEncryptionKey()
  if (!key) return
  const rawBytes = audioFile.bytes()
  const encrypted = encryptBytes(rawBytes, key)
  audioFile.write(encrypted)
}

export async function getDecryptedAudioUri(entryId) {
  const audioFile = new File(audioDir, `${entryId}.wav`)
  if (!audioFile.exists) return null

  const key = await getEncryptionKey()
  if (!key) return audioFile.uri

  try {
    const encBytes = audioFile.bytes()
    const decrypted = decryptBytes(encBytes, key)
    tempAudioDir.create({ idempotent: true })
    const tempFile = new File(tempAudioDir, `${entryId}.wav`)
    tempFile.write(decrypted)
    return tempFile.uri
  } catch {
    // Likely unencrypted legacy file — return as-is
    return audioFile.uri
  }
}

export function cleanupDecryptedAudio() {
  try {
    if (tempAudioDir.exists) tempAudioDir.delete()
  } catch {}
}

// ── Migration ──────────────────────────────────────────

export function migrateData() {
  return withWriteLock(async () => {
    const folders = await readJSON(foldersFile);
    let foldersChanged = false;
    for (const folder of folders) {
      if (!folder.color) {
        folder.color = "#4A9EFF";
        foldersChanged = true;
      }
      if (!folder.tags) {
        folder.tags = [];
        foldersChanged = true;
      }
      if (folder.engine !== undefined) {
        delete folder.engine;
        foldersChanged = true;
      }
      if (!folder.updated_at) {
        folder.updated_at = folder.created_at;
        foldersChanged = true;
      }
    }
    if (foldersChanged) writeJSON(foldersFile, folders);

    const entries = await readJSON(entriesFile);
    let entriesChanged = false;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const dailyLogFolder = folders.find((f) => f.is_daily_log === true);

    for (const entry of entries) {
      // Reset entries stuck in "processing" for >24 hours back to "recorded"
      if (entry.status === "processing" && new Date(entry.created_at).getTime() < oneDayAgo) {
        entry.status = "recorded";
        delete entry.assemblyai_id;
        entriesChanged = true;
      }
      // Backfill updated_at from created_at
      if (!entry.updated_at) {
        entry.updated_at = entry.created_at;
        entriesChanged = true;
      }
      // Backfill recorded_date for daily log entries
      if (dailyLogFolder && entry.folder_id === dailyLogFolder.id && !entry.recorded_date) {
        entry.recorded_date = entry.created_at.slice(0, 10);
        entriesChanged = true;
      }
    }
    if (entriesChanged) writeJSON(entriesFile, entries);

    // ── Encrypt existing plaintext transcripts ──
    // initEncryption() is already called by App.js before migrateData()
    const key = await getEncryptionKey()
    if (key) {
      let encryptionMigrated = false
      for (const entry of entries) {
        if (entry.status === "done" && !entry.encrypted) {
          const textFile = new File(textsDir, `journal_${entry.id}.txt`)
          if (textFile.exists) {
            try {
              // Try decrypt first — file may already be encrypted from a previous interrupted migration
              const bytes = textFile.bytes()
              decryptText(bytes, key)
              // Decrypt succeeded — file is already encrypted, just mark metadata
              entry.text = ""
              entry.encrypted = true
              encryptionMigrated = true
            } catch {
              // Decrypt failed — file is plaintext, encrypt it
              try {
                const plaintext = await textFile.text()
                const encrypted = encryptText(plaintext, key)
                textFile.write(encrypted)
                entry.text = ""
                entry.encrypted = true
                encryptionMigrated = true
              } catch (encErr) {
                Sentry.captureMessage(
                  `Encryption migration failed for entry ${entry.id}: ${encErr.message}`,
                  "warning"
                )
              }
            }
          }
        }
      }
      if (encryptionMigrated) writeJSON(entriesFile, entries)

      // ── Encrypt existing plaintext audio files ──
      for (const entry of entries) {
        if (!entry.audio_file) continue
        const audioFile = new File(audioDir, entry.audio_file)
        if (!audioFile.exists) continue
        try {
          const bytes = audioFile.bytes()
          // Try decrypt — if it succeeds, file is already encrypted
          decryptBytes(bytes, key)
        } catch {
          // Decrypt failed — file is plaintext, encrypt it
          try {
            const raw = audioFile.bytes()
            const encrypted = encryptBytes(raw, key)
            audioFile.write(encrypted)
          } catch (encErr) {
            Sentry.captureMessage(
              `Audio encryption migration failed for ${entry.id}: ${encErr.message}`,
              "warning"
            )
          }
        }
      }
    }

    await cleanOrphanedFiles();
  })
}

async function cleanOrphanedFiles() {
  try {
    const entries = await readJSON(entriesFile)
    const entryIds = new Set(entries.map((e) => e.id))

    // Clean orphaned audio files
    const audioItems = audioDir.list()
    for (const item of audioItems) {
      if (!item.name.endsWith(".wav")) continue
      const id = item.name.replace(".wav", "")
      if (!entryIds.has(id)) {
        try { item.delete() } catch {}
      }
    }

    // Clean orphaned text files
    const textItems = textsDir.list()
    for (const item of textItems) {
      if (!item.name.endsWith(".txt")) continue
      const id = item.name.replace("journal_", "").replace(".txt", "")
      if (!entryIds.has(id)) {
        try { item.delete() } catch {}
      }
    }
  } catch {
    // Non-critical — skip if listing fails
  }
}

// ── Tombstone Operations ────────────────────────────────

export function tombstoneEntry(entryId) {
  return withWriteLock(async () => {
    const entries = await readJSON(entriesFile)
    const entry = entries.find(e => e.id === entryId)
    if (!entry) return false
    entry.deleted_locally = true
    entry.updated_at = new Date().toISOString()
    writeJSON(entriesFile, entries)

    // Delete local files
    const audioFile = new File(audioDir, `${entryId}.wav`)
    if (audioFile.exists) audioFile.delete()
    const textFile = new File(textsDir, `journal_${entryId}.txt`)
    if (textFile.exists) textFile.delete()
    return true
  })
}

export function tombstoneFolder(folderId) {
  return withWriteLock(async () => {
    const folders = await readJSON(foldersFile)
    const folder = folders.find(f => f.id === folderId)
    if (!folder) return []

    const entries = await readJSON(entriesFile)
    const tombstonedIds = []

    // Tombstone all entries in this folder
    for (const entry of entries) {
      if (entry.folder_id === folderId && !entry.deleted_locally) {
        entry.deleted_locally = true
        entry.updated_at = new Date().toISOString()
        tombstonedIds.push(entry.id)
        const audioFile = new File(audioDir, `${entry.id}.wav`)
        if (audioFile.exists) audioFile.delete()
        const textFile = new File(textsDir, `journal_${entry.id}.txt`)
        if (textFile.exists) textFile.delete()
      }
    }
    writeJSON(entriesFile, entries)

    // Tombstone the folder itself
    folder.deleted_locally = true
    folder.updated_at = new Date().toISOString()
    writeJSON(foldersFile, folders)

    return tombstonedIds
  })
}

export function deleteEntryWithICloud(entryId) {
  return withWriteLock(async () => {
    const entries = await readJSON(entriesFile)
    const idx = entries.findIndex(e => e.id === entryId)
    if (idx === -1) return false
    entries.splice(idx, 1)
    writeJSON(entriesFile, entries)

    const audioFile = new File(audioDir, `${entryId}.wav`)
    if (audioFile.exists) audioFile.delete()
    const textFile = new File(textsDir, `journal_${entryId}.txt`)
    if (textFile.exists) textFile.delete()

    // Fire-and-forget iCloud delete
    deleteEntryFilesFromICloud(entryId).catch(() => {})
    return true
  })
}

export function deleteFolderWithICloud(folderId) {
  return withWriteLock(async () => {
    const folders = await readJSON(foldersFile)
    const idx = folders.findIndex(f => f.id === folderId)
    if (idx === -1) return false

    const entries = await readJSON(entriesFile)
    const toDelete = entries.filter(e => e.folder_id === folderId)
    writeJSON(entriesFile, entries.filter(e => e.folder_id !== folderId))

    for (const e of toDelete) {
      try {
        const audioFile = new File(audioDir, `${e.id}.wav`)
        if (audioFile.exists) audioFile.delete()
        const textFile = new File(textsDir, `journal_${e.id}.txt`)
        if (textFile.exists) textFile.delete()
      } catch {}
      // Fire-and-forget iCloud delete
      deleteEntryFilesFromICloud(e.id).catch(() => {})
    }

    folders.splice(idx, 1)
    writeJSON(foldersFile, folders)
    return true
  })
}

export async function getTombstonedEntries() {
  const entries = await readJSON(entriesFile)
  return entries.filter(e => e.deleted_locally === true)
}

export async function getTombstonedFolders() {
  const folders = await readJSON(foldersFile)
  return folders.filter(f => f.deleted_locally === true)
}

export function reviveTombstonedRecords() {
  return withWriteLock(async () => {
    const folders = await readJSON(foldersFile)
    let foldersChanged = false
    for (const f of folders) {
      if (f.deleted_locally) {
        delete f.deleted_locally
        f.updated_at = new Date().toISOString()
        foldersChanged = true
      }
    }
    if (foldersChanged) writeJSON(foldersFile, folders)

    const entries = await readJSON(entriesFile)
    let entriesChanged = false
    for (const e of entries) {
      if (e.deleted_locally) {
        delete e.deleted_locally
        e.updated_at = new Date().toISOString()
        entriesChanged = true
      }
    }
    if (entriesChanged) writeJSON(entriesFile, entries)
  })
}

// ── Folders ─────────────────────────────────────────────

export function createFolder(name, color = "#4A9EFF", tags = []) {
  return withWriteLock(async () => {
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
  })
}

export async function fetchFolders() {
  const folders = await readJSON(foldersFile);
  return folders.filter(f => !f.deleted_locally);
}

export async function getFolder(id) {
  const folders = await readJSON(foldersFile);
  return folders.find((f) => f.id === id) || null;
}

export function updateFolder(id, updates) {
  return withWriteLock(async () => {
    const folders = await readJSON(foldersFile);
    const folder = folders.find((f) => f.id === id);
    if (!folder) return null;
    if (updates.name !== undefined) folder.name = updates.name;
    if (updates.color !== undefined) folder.color = updates.color;
    if (updates.tags !== undefined) folder.tags = updates.tags;
    folder.updated_at = new Date().toISOString();
    writeJSON(foldersFile, folders);
    return folder;
  })
}

export async function getAllTags() {
  const folders = await readJSON(foldersFile);
  const tagSet = new Set();
  for (const folder of folders) {
    if (folder.tags) folder.tags.forEach((t) => tagSet.add(t));
  }
  return [...tagSet].sort();
}

export function deleteFolder(id) {
  return withWriteLock(async () => {
    const folders = await readJSON(foldersFile)
    const idx = folders.findIndex((f) => f.id === id)
    if (idx === -1) return false

    // Step 1: Remove entries first (safest — folder still visible if crash)
    const entries = await readJSON(entriesFile)
    const toDelete = entries.filter((e) => e.folder_id === id)
    writeJSON(entriesFile, entries.filter((e) => e.folder_id !== id))

    // Step 2: Clean up files (best-effort)
    for (const e of toDelete) {
      try {
        const audioFile = new File(audioDir, `${e.id}.wav`)
        if (audioFile.exists) audioFile.delete()
        const textFile = new File(textsDir, `journal_${e.id}.txt`)
        if (textFile.exists) textFile.delete()
      } catch {}
    }

    // Step 3: Remove folder last
    folders.splice(idx, 1)
    writeJSON(foldersFile, folders)
    return true
  })
}

// ── Entries ─────────────────────────────────────────────

export function createEntry(folderId, filename, audioSourceUri, durationSeconds = 0, recordingType = "beleshka") {
  return withWriteLock(async () => {
    ensureDirs();
    const id = generateUUID();

    // Copy audio from recorder temp path to journal/audio/{id}.wav
    const source = new File(audioSourceUri);
    const dest = new File(audioDir, `${id}.wav`);
    source.copy(dest);

    // Encrypt audio at rest
    await encryptAudioFile(dest);

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

    // Sync audio to iCloud (fire-and-forget, already encrypted)
    uploadFileToICloud(dest.uri, `audio/${id}.wav`).catch((e) => Sentry.captureMessage("iCloud sync failed: " + e.message, "warning"))

    return entry;
  })
}

export async function fetchEntries(folderId) {
  const entries = await readJSON(entriesFile);
  return entries.filter((e) => e.folder_id === folderId && !e.deleted_locally);
}

export async function fetchEntry(entryId) {
  const entries = await readJSON(entriesFile);
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return null;

  // Load full text from file (decrypt if encrypted)
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

export function deleteEntry(entryId) {
  return withWriteLock(async () => {
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
  })
}

// ── Transcription state ────────────────────────────────

export function updateEntryToProcessing(entryId, assemblyaiId) {
  return withWriteLock(async () => {
    const entries = await readJSON(entriesFile);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return null;
    entry.status = "processing";
    entry.assemblyai_id = assemblyaiId;
    entry.updated_at = new Date().toISOString();
    writeJSON(entriesFile, entries);
    return { ...entry };
  })
}

export function completeEntry(entryId, text, durationSeconds) {
  return withWriteLock(async () => {
    ensureDirs();

    const entries = await readJSON(entriesFile);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return null;

    // Update metadata FIRST — if crash after this, fetchEntry() handles missing text file gracefully
    entry.status = "done";
    entry.text = "";
    entry.encrypted = true;
    entry.duration_seconds = durationSeconds;
    entry.updated_at = new Date().toISOString();
    delete entry.assemblyai_id;
    writeJSON(entriesFile, entries);

    // Write encrypted text file AFTER metadata is consistent
    const textFile = new File(textsDir, `journal_${entryId}.txt`);
    await writeEncryptedText(textFile, text);

    // Sync transcript to iCloud (encrypted file)
    uploadFileToICloud(textFile.uri, `texts/journal_${entryId}.txt`).catch((e) => Sentry.captureMessage("iCloud sync failed: " + e.message, "warning"))

    return { ...entry, text };
  })
}

export function updateEntryText(entryId, newText) {
  return withWriteLock(async () => {
    ensureDirs()
    const entries = await readJSON(entriesFile)
    const entry = entries.find((e) => e.id === entryId)
    if (!entry) return null
    // Update metadata FIRST — if crash after this, fetchEntry() handles missing text file gracefully
    entry.text = ""
    entry.encrypted = true
    entry.updated_at = new Date().toISOString()
    writeJSON(entriesFile, entries)

    // Write encrypted text file AFTER metadata is consistent
    const textFile = new File(textsDir, `journal_${entryId}.txt`)
    await writeEncryptedText(textFile, newText)

    // Sync transcript to iCloud (encrypted file)
    uploadFileToICloud(textFile.uri, `texts/journal_${entryId}.txt`).catch((e) => Sentry.captureMessage("iCloud sync failed: " + e.message, "warning"))

    return { ...entry, text: newText }
  })
}

export function failEntry(entryId, error) {
  return withWriteLock(async () => {
    const entries = await readJSON(entriesFile);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return null;
    entry.status = "error";
    entry.text = "Transkribovanje nije uspelo";
    entry.updated_at = new Date().toISOString();
    delete entry.assemblyai_id;
    writeJSON(entriesFile, entries);
    return { ...entry };
  })
}

// ── Audio ───────────────────────────────────────────────

export function entryAudioUri(entryId) {
  const file = new File(audioDir, `${entryId}.wav`);
  return file.uri;
}

export function entryAudioExists(entryId) {
  const file = new File(audioDir, `${entryId}.wav`);
  return file.exists;
}

export function deleteEntryAudio(entryId) {
  const audioFile = new File(audioDir, `${entryId}.wav`);
  if (audioFile.exists) audioFile.delete();
}

// ── Daily Log ───────────────────────────────────────────

// Internal version (no lock) — used by createDailyLogEntry / consolidateDailyLogEntries
// which already hold the write lock
async function _getOrCreateDailyLogFolder() {
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

export function getOrCreateDailyLogFolder() {
  return withWriteLock(() => _getOrCreateDailyLogFolder())
}

export function createDailyLogEntry(audioSourceUri, durationSeconds = 0) {
  return withWriteLock(async () => {
    const folder = await _getOrCreateDailyLogFolder();
    ensureDirs();
    const id = generateUUID();

    const source = new File(audioSourceUri);
    const dest = new File(audioDir, `${id}.wav`);
    source.copy(dest);

    // Encrypt audio at rest
    await encryptAudioFile(dest);

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
    uploadFileToICloud(dest.uri, `audio/${id}.wav`).catch((e) => Sentry.captureMessage("iCloud sync failed: " + e.message, "warning"))

    return entry;
  })
}

export async function fetchDailyLogEntries() {
  const folders = await readJSON(foldersFile);
  const folder = folders.find((f) => f.is_daily_log === true);
  if (!folder) return [];
  const entries = await readJSON(entriesFile);
  return entries
    .filter((e) => e.folder_id === folder.id && !e.deleted_locally)
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

// ── Consolidation ───────────────────────────────────────

export function consolidateDailyLogEntries(date) {
  return withWriteLock(async () => {
    const folder = await _getOrCreateDailyLogFolder();
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

    // Create new combined entry
    ensureDirs();
    const id = generateUUID();
    const combinedTextFile = new File(textsDir, `journal_${id}.txt`);
    await writeEncryptedText(combinedTextFile, combinedText);

    // Sync combined transcript to iCloud
    uploadFileToICloud(combinedTextFile.uri, `texts/journal_${id}.txt`)
      .catch((e) => Sentry.captureMessage("iCloud sync failed for combined text: " + e.message, "warning"))

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

    // Update entries.json first: remove originals, add combined
    const doneIds = new Set(dayDone.map((e) => e.id));
    const remaining = allEntries.filter((e) => !doneIds.has(e.id));
    remaining.unshift(combinedEntry);
    writeJSON(entriesFile, remaining);

    // Delete originals (audio + text files) — orphan cleanup handles stragglers on crash
    for (const entry of dayDone) {
      const audioFile = new File(audioDir, `${entry.id}.wav`);
      if (audioFile.exists) audioFile.delete();
      const textFile = new File(textsDir, `journal_${entry.id}.txt`);
      if (textFile.exists) textFile.delete();
    }

    return { ...combinedEntry, text: combinedText };
  })
}

// ── Bulk Import/Export ──────────────────────────────────

export async function exportAllData() {
  const folders = await readJSON(foldersFile);
  const entries = await readJSON(entriesFile);

  const audioFiles = [];
  const textFiles = [];
  const key = await getEncryptionKey();

  for (const entry of entries) {
    const audioFile = new File(audioDir, `${entry.id}.wav`);
    if (audioFile.exists) {
      let audioData = audioFile.bytes()
      // Decrypt audio for export (backups contain plaintext)
      if (key) {
        try { audioData = decryptBytes(audioData, key) } catch {}
      }
      audioFiles.push({ id: entry.id, data: audioData });
    }
    const textFile = new File(textsDir, `journal_${entry.id}.txt`);
    if (textFile.exists) {
      try {
        const text = await readDecryptedText(textFile);
        textFiles.push({ id: entry.id, text });
      } catch {
        // Skip unreadable files
      }
    }
  }

  return { folders, entries, audioFiles, textFiles };
}

export function importAllData(data) {
  return withWriteLock(async () => {
    ensureDirs();
    writeJSON(foldersFile, data.folders);

    // Mark entries as encrypted before writing metadata (single write)
    const key = await getEncryptionKey()
    if (key) {
      for (const entry of data.entries) {
        if (entry.status === "done") {
          entry.text = ""
          entry.encrypted = true
        }
      }
    }
    writeJSON(entriesFile, data.entries);

    let audioCount = 0;
    let textCount = 0;

    for (const { id, data: audioData } of data.audioFiles) {
      const dest = new File(audioDir, `${id}.wav`);
      if (key) {
        dest.write(encryptBytes(audioData, key))
      } else {
        dest.write(audioData)
      }
      audioCount++;
    }

    for (const { id, text } of data.textFiles) {
      const dest = new File(textsDir, `journal_${id}.txt`);
      if (key) {
        dest.write(encryptText(text, key))
      } else {
        dest.write(text)
      }
      textCount++;
    }

    return {
      folders: data.folders.length,
      entries: data.entries.length,
      audioFiles: audioCount,
      textFiles: textCount,
    };
  })
}

// ── iCloud Audio Download ────────────────────────────────

export async function downloadAudioFromICloud(entryId) {
  const { downloadFileFromICloud, fileExistsOnICloud } = require("./icloudSyncService")

  const icloudRelPath = `audio/${entryId}.wav`
  const exists = await fileExistsOnICloud(icloudRelPath)
  if (!exists) return false

  ensureDirs()
  const localFile = new File(audioDir, `${entryId}.wav`)
  const success = await downloadFileFromICloud(icloudRelPath, localFile.uri)
  return success && localFile.exists
}

// ── iCloud Restore Support ───────────────────────────────

export function importFromICloudRestore(data) {
  return withWriteLock(async () => {
    ensureDirs()
    writeJSON(foldersFile, data.folders)
    writeJSON(entriesFile, data.entries)

    // Write downloaded text file contents (already encrypted from iCloud)
    for (const [entryId, content] of Object.entries(data.texts)) {
      const textFile = new File(textsDir, `journal_${entryId}.txt`)
      textFile.write(content)
    }
  })
}

// ── iCloud Sync Support ─────────────────────────────────

export async function getRawFolders() {
  return readJSON(foldersFile)
}

export async function getRawEntries() {
  return readJSON(entriesFile)
}

export function overwriteFolders(folders) {
  return withWriteLock(() => {
    writeJSON(foldersFile, folders)
  })
}

export function overwriteEntries(entries) {
  return withWriteLock(() => {
    writeJSON(entriesFile, entries)
  })
}

export function moveEntryToFolder(entryId, targetFolderId) {
  return withWriteLock(async () => {
    const entries = await readJSON(entriesFile);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return null;
    entry.folder_id = targetFolderId;
    entry.updated_at = new Date().toISOString();
    writeJSON(entriesFile, entries);
    return { ...entry };
  })
}
