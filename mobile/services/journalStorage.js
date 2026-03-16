import { File, Directory, Paths } from "expo-file-system";

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

function ensureDirs() {
  journalDir.create({ idempotent: true });
  audioDir.create({ idempotent: true });
  textsDir.create({ idempotent: true });
}

async function readJSON(file) {
  try {
    if (!file.exists) return [];
    const raw = await file.text();
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeJSON(file, data) {
  ensureDirs();
  file.write(JSON.stringify(data));
}

function truncateText(text, max = 200) {
  if (!text || text.length <= max) return text;
  return text.slice(0, max) + "...";
}

// ── Folders ─────────────────────────────────────────────

export async function createFolder(name, engine = "local") {
  const folders = await readJSON(foldersFile);
  const folder = {
    id: generateUUID(),
    name,
    engine,
    created_at: new Date().toISOString(),
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

export async function renameFolder(id, name) {
  const folders = await readJSON(foldersFile);
  const folder = folders.find((f) => f.id === id);
  if (!folder) return null;
  folder.name = name;
  writeJSON(foldersFile, folders);
  return folder;
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
    const audioFile = new File(audioDir, `${e.id}.m4a`);
    if (audioFile.exists) audioFile.delete();
    const textFile = new File(textsDir, `journal_${e.id}.txt`);
    if (textFile.exists) textFile.delete();
  });
  writeJSON(entriesFile, entries.filter((e) => e.folder_id !== id));
  return true;
}

// ── Entries ─────────────────────────────────────────────

export async function createEntry(folderId, filename, audioSourceUri) {
  ensureDirs();
  const id = generateUUID();

  // Copy audio from recorder temp path to journal/audio/{id}.m4a
  const source = new File(audioSourceUri);
  const dest = new File(audioDir, `${id}.m4a`);
  source.copy(dest);

  const entry = {
    id,
    folder_id: folderId,
    filename,
    text: "",
    created_at: new Date().toISOString(),
    duration_seconds: 0,
    status: "recorded",
    audio_file: `${id}.m4a`,
  };

  const entries = await readJSON(entriesFile);
  entries.unshift(entry);
  writeJSON(entriesFile, entries);
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

  const audioFile = new File(audioDir, `${entryId}.m4a`);
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
  delete entry.assemblyai_id;
  writeJSON(entriesFile, entries);
  return { ...entry, text };
}

export async function failEntry(entryId, error) {
  const entries = await readJSON(entriesFile);
  const entry = entries.find((e) => e.id === entryId);
  if (!entry) return null;
  entry.status = "error";
  entry.text = error;
  delete entry.assemblyai_id;
  writeJSON(entriesFile, entries);
  return { ...entry };
}

// ── Audio ───────────────────────────────────────────────

export function entryAudioUri(entryId) {
  const file = new File(audioDir, `${entryId}.m4a`);
  return file.uri;
}
