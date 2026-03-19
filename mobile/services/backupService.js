import { File, Paths } from "expo-file-system";
import JSZip from "jszip";
import { exportAllData, importAllData } from "./journalStorage";

export async function createBackup() {
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
  const backupFile = new File(Paths.cache, `diktafon-backup-${date}.zip`);
  backupFile.write(zipData);

  return backupFile.uri;
}

export async function restoreFromBackup(fileUri) {
  const sourceFile = new File(fileUri);
  const zipData = sourceFile.bytes();
  const zip = await JSZip.loadAsync(zipData);

  if (!zip.file("folders.json") || !zip.file("entries.json")) {
    throw new Error("Nevazeci backup fajl — nedostaje folders.json ili entries.json");
  }

  const foldersJSON = await zip.file("folders.json").async("string");
  const entriesJSON = await zip.file("entries.json").async("string");
  let folders, entries;
  try {
    folders = JSON.parse(foldersJSON);
    entries = JSON.parse(entriesJSON);
  } catch {
    throw new Error("Backup fajl je ostecen — podaci nisu citljivi.");
  }

  const audioFiles = [];
  const audioFolder = zip.folder("audio");
  if (audioFolder) {
    const promises = [];
    audioFolder.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      promises.push(
        zipEntry.async("uint8array").then((audioData) => {
          const id = relativePath.replace(".wav", "");
          audioFiles.push({ id, data: audioData });
        })
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
      promises.push(
        zipEntry.async("string").then((text) => {
          const id = relativePath.replace("journal_", "").replace(".txt", "");
          textFiles.push({ id, text });
        })
      );
    });
    await Promise.all(promises);
  }

  // Create a safety backup before overwriting current data
  try {
    await createBackup();
  } catch (e) {
    if (__DEV__) console.warn("Pre-restore backup failed:", e);
  }

  return importAllData({ folders, entries, audioFiles, textFiles });
}
