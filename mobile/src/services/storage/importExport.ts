import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import {
  foldersFile, entriesFile, audioDir, textsDir,
  readJSON, writeJSON, withWriteLock, ensureDirs,
  readDecryptedText,
} from "./storageCore";
import {
  getEncryptionKey,
  encryptText,
  decryptBytes,
  encryptBytes,
} from "../../../services/cryptoService";

export async function exportAllData() {
  const folders = await readJSON(foldersFile);
  const entries = await readJSON(entriesFile);

  const audioFiles: { id: string; data: any }[] = [];
  const textFiles: { id: string; text: string }[] = [];
  const key = await getEncryptionKey();

  for (const entry of entries) {
    const audioFile = new File(audioDir, `${entry.id}.wav`);
    if (audioFile.exists) {
      let audioData: any = audioFile.bytes();
      if (key) {
        try {
          audioData = decryptBytes(audioData, key);
        } catch {}
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

export function importAllData(data: {
  folders: any[];
  entries: any[];
  audioFiles: { id: string; data: Uint8Array }[];
  textFiles: { id: string; text: string }[];
}) {
  return withWriteLock(async () => {
    ensureDirs();
    await writeJSON(foldersFile, data.folders);

    const key = await getEncryptionKey();
    if (key) {
      for (const entry of data.entries) {
        if (entry.status === "done") {
          entry.text = "";
          entry.encrypted = true;
        }
      }
    }
    await writeJSON(entriesFile, data.entries);

    let audioCount = 0;
    let textCount = 0;

    for (const { id, data: audioData } of data.audioFiles) {
      const dest = new File(audioDir, `${id}.wav`);
      if (key) {
        const encrypted = encryptBytes(audioData, key);
        const base64 = Buffer.from(encrypted).toString("base64");
        await FileSystem.writeAsStringAsync(dest.uri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        const base64 = Buffer.from(audioData).toString("base64");
        await FileSystem.writeAsStringAsync(dest.uri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      audioCount++;
    }

    for (const { id, text } of data.textFiles) {
      const dest = new File(textsDir, `journal_${id}.txt`);
      if (key) {
        const encrypted = encryptText(text, key);
        const base64 = Buffer.from(encrypted).toString("base64");
        await FileSystem.writeAsStringAsync(dest.uri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        await FileSystem.writeAsStringAsync(dest.uri, text);
      }
      textCount++;
    }

    return {
      folders: data.folders.length,
      entries: data.entries.length,
      audioFiles: audioCount,
      textFiles: textCount,
    };
  });
}

export function importFromICloudRestore(data: {
  folders: any[];
  entries: any[];
  texts: Record<string, any>;
}) {
  return withWriteLock(async () => {
    ensureDirs();
    await writeJSON(foldersFile, data.folders);
    await writeJSON(entriesFile, data.entries);

    for (const [entryId, content] of Object.entries(data.texts)) {
      const textFile = new File(textsDir, `journal_${entryId}.txt`);
      await FileSystem.writeAsStringAsync(textFile.uri, content as string);
    }
  });
}

export async function getRawFolders() {
  return readJSON(foldersFile);
}

export async function getRawEntries() {
  return readJSON(entriesFile);
}

export function overwriteFolders(folders: any[]) {
  return withWriteLock(async () => {
    await writeJSON(foldersFile, folders);
  });
}

export function overwriteEntries(entries: any[]) {
  return withWriteLock(async () => {
    await writeJSON(entriesFile, entries);
  });
}
