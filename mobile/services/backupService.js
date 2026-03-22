import { File, Paths } from "expo-file-system";
import JSZip from "jszip";
import crypto from "react-native-quick-crypto";
import { exportAllData, importAllData } from "./journalStorage";
import { encryptBlob, decryptBlob } from "./cryptoService";
import { t } from "../src/i18n";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeBackupPath(relativePath) {
  if (relativePath.includes("..") || relativePath.startsWith("/")) return null;
  return relativePath;
}

export async function createBackup(password) {
  const zip = new JSZip();
  const data = await exportAllData();

  zip.file("folders.json", JSON.stringify(data.folders));
  zip.file("entries.json", JSON.stringify(data.entries));

  for (const { id, data: audioData } of data.audioFiles) {
    zip.file(`audio/${id}.wav`, audioData);
  }
  for (const { id, text } of data.textFiles) {
    zip.file(`texts/journal_${id}.txt`, text);
  }

  const zipData = await zip.generateAsync({ type: "uint8array" });
  const date = new Date().toISOString().slice(0, 10);

  if (password) {
    const encrypted = encryptBlob(zipData, password);
    const backupFile = new File(Paths.cache, `diktafon-backup-${date}.enc`);
    backupFile.write(encrypted);
    return backupFile.uri;
  }

  const backupFile = new File(Paths.cache, `diktafon-backup-${date}.zip`);
  backupFile.write(zipData);
  return backupFile.uri;
}

export async function restoreFromBackup(fileUri, password) {
  const sourceFile = new File(fileUri);
  let zipData;

  if (password) {
    const encryptedData = sourceFile.bytesSync();
    try {
      const decrypted = decryptBlob(encryptedData, password);
      zipData = decrypted;
    } catch (e) {
      if (e.message === "Pogresna lozinka") throw new Error(t("settings.backup.wrongPassword"));
      throw new Error(t("settings.backup.wrongPasswordOrCorrupted"));
    }
  } else {
    zipData = sourceFile.bytesSync();
  }

  const zip = await JSZip.loadAsync(zipData);

  if (!zip.file("folders.json") || !zip.file("entries.json")) {
    throw new Error(t("settings.backup.invalidBackup"));
  }

  const foldersJSON = await zip.file("folders.json").async("string");
  const entriesJSON = await zip.file("entries.json").async("string");
  let folders, entries;
  try {
    folders = JSON.parse(foldersJSON);
    entries = JSON.parse(entriesJSON);
  } catch {
    throw new Error(t("settings.backup.corruptedData"));
  }

  const audioFiles = [];
  let skippedFiles = 0;
  const audioFolder = zip.folder("audio");
  if (audioFolder) {
    const promises = [];
    audioFolder.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      const safe = sanitizeBackupPath(relativePath);
      if (!safe) { skippedFiles++; return; }
      const id = safe.replace(".wav", "");
      if (!UUID_RE.test(id)) { skippedFiles++; return; }
      promises.push(
        zipEntry.async("uint8array").then((audioData) => {
          audioFiles.push({ id, data: audioData });
        }).catch(() => { skippedFiles++; })
      );
    });
    await Promise.all(promises);
  }

  const textFiles = [];
  const textFolder = zip.folder("texts");
  if (textFolder) {
    const promises = [];
    textFolder.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      const safe = sanitizeBackupPath(relativePath);
      if (!safe) { skippedFiles++; return; }
      const id = safe.replace("journal_", "").replace(".txt", "");
      if (!UUID_RE.test(id)) { skippedFiles++; return; }
      promises.push(
        zipEntry.async("string").then((text) => {
          textFiles.push({ id, text });
        }).catch(() => { skippedFiles++; })
      );
    });
    await Promise.all(promises);
  }

  // Create a safety backup before overwriting current data
  try {
    await createBackup(null);
  } catch (e) {
    if (__DEV__) console.warn("Pre-restore backup failed:", e);
    throw new Error("SAFETY_BACKUP_FAILED: " + e.message);
  }

  const stats = await importAllData({ folders, entries, audioFiles, textFiles });
  return { ...stats, skippedFiles };
}
