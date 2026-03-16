import { File, Directory, Paths } from "expo-file-system";
import JSZip from "jszip";

const journalDir = new Directory(Paths.document, "journal");
const audioDir = new Directory(journalDir, "audio");
const textsDir = new Directory(journalDir, "texts");
const foldersFile = new File(journalDir, "folders.json");
const entriesFile = new File(journalDir, "entries.json");

export async function createBackup() {
  const zip = new JSZip();

  // Add JSON metadata
  const foldersJSON = foldersFile.exists ? await foldersFile.text() : "[]";
  const entriesJSON = entriesFile.exists ? await entriesFile.text() : "[]";
  zip.file("folders.json", foldersJSON);
  zip.file("entries.json", entriesJSON);

  // Add audio and text files based on entries
  const entries = JSON.parse(entriesJSON);
  for (const entry of entries) {
    const audioFile = new File(audioDir, `${entry.id}.wav`);
    if (audioFile.exists) {
      zip.file(`audio/${entry.id}.wav`, audioFile.bytes());
    }
    const textFile = new File(textsDir, `journal_${entry.id}.txt`);
    if (textFile.exists) {
      zip.file(`texts/journal_${entry.id}.txt`, await textFile.text());
    }
  }

  // Generate zip and write to cache
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

  // Validate
  if (!zip.file("folders.json") || !zip.file("entries.json")) {
    throw new Error("Nevazeci backup fajl — nedostaje folders.json ili entries.json");
  }

  // Ensure directories exist
  journalDir.create({ idempotent: true });
  audioDir.create({ idempotent: true });
  textsDir.create({ idempotent: true });

  // Restore JSON metadata — validate before writing to avoid destroying existing data
  const foldersJSON = await zip.file("folders.json").async("string");
  const entriesJSON = await zip.file("entries.json").async("string");
  const folders = JSON.parse(foldersJSON);
  const entries = JSON.parse(entriesJSON);
  foldersFile.write(foldersJSON);
  entriesFile.write(entriesJSON);

  // Restore audio files
  let audioCount = 0;
  let textCount = 0;

  const audioFiles = zip.folder("audio");
  if (audioFiles) {
    const audioPromises = [];
    audioFiles.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      audioPromises.push(
        zipEntry.async("uint8array").then((data) => {
          const dest = new File(audioDir, relativePath);
          dest.write(data);
          audioCount++;
        })
      );
    });
    await Promise.all(audioPromises);
  }

  // Restore text files
  const textFiles = zip.folder("texts");
  if (textFiles) {
    const textPromises = [];
    textFiles.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      textPromises.push(
        zipEntry.async("string").then((data) => {
          const dest = new File(textsDir, relativePath);
          dest.write(data);
          textCount++;
        })
      );
    });
    await Promise.all(textPromises);
  }

  return {
    folders: folders.length,
    entries: entries.length,
    audioFiles: audioCount,
    textFiles: textCount,
  };
}
