import * as FileSystem from "expo-file-system";

const RECORDINGS_DIR = FileSystem.documentDirectory + "recordings/";
const PENDING_FILE = RECORDINGS_DIR + "pending.json";

async function ensureRecordingsDir() {
  try {
    await FileSystem.makeDirectoryAsync(RECORDINGS_DIR, { intermediates: true });
  } catch (e) {
    // Directory already exists or other non-critical error
  }
}

export async function saveRecording(uri, filename) {
  await ensureRecordingsDir();
  const dest = RECORDINGS_DIR + filename;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

async function readPending() {
  try {
    const raw = await FileSystem.readAsStringAsync(PENDING_FILE);
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writePending(entries) {
  await ensureRecordingsDir();
  await FileSystem.writeAsStringAsync(PENDING_FILE, JSON.stringify(entries));
}

export async function getPendingRecordings() {
  return readPending();
}

export async function addPending(entry) {
  const pending = await readPending();
  pending.push(entry);
  await writePending(pending);
}

export async function removePending(filename) {
  const pending = await readPending();
  await writePending(pending.filter((e) => e.filename !== filename));
}

export async function listSavedRecordings() {
  await ensureRecordingsDir();
  const files = await FileSystem.readDirectoryAsync(RECORDINGS_DIR);
  return files.filter((f) => f.endsWith(".m4a"));
}

export async function deleteRecording(filename) {
  const path = RECORDINGS_DIR + filename;
  try {
    await FileSystem.deleteAsync(path);
  } catch (e) {
    // File doesn't exist or other non-critical error
  }
  await removePending(filename);
}
