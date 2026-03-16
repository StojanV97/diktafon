import { File, Directory, Paths } from "expo-file-system";

const recordingsDir = new Directory(Paths.document, "recordings");
const pendingFile = new File(recordingsDir, "pending.json");

function ensureRecordingsDir() {
  recordingsDir.create({ idempotent: true });
}

export function saveRecording(uri, filename) {
  ensureRecordingsDir();
  const source = new File(uri);
  const dest = new File(recordingsDir, filename);
  source.copy(dest);
  return dest.uri;
}

async function readPending() {
  try {
    if (!pendingFile.exists) return [];
    const raw = await pendingFile.text();
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writePending(entries) {
  ensureRecordingsDir();
  pendingFile.write(JSON.stringify(entries));
}

export async function getPendingRecordings() {
  return readPending();
}

export async function addPending(entry) {
  const pending = await readPending();
  pending.push(entry);
  writePending(pending);
}

export async function removePending(filename) {
  const pending = await readPending();
  writePending(pending.filter((e) => e.filename !== filename));
}

export function listSavedRecordings() {
  ensureRecordingsDir();
  return recordingsDir
    .list()
    .filter((f) => f instanceof File && f.name.endsWith(".m4a"))
    .map((f) => f.name);
}

export function deleteRecording(filename) {
  const file = new File(recordingsDir, filename);
  if (file.exists) {
    file.delete();
  }
  removePending(filename);
}
