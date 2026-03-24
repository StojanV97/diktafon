import { File } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as Sentry from "@sentry/react-native";
import {
  foldersFile, entriesFile, audioDir, textsDir,
  readJSON, writeJSON, withWriteLock,
  DEFAULT_FOLDER_COLOR,
} from "./storageCore";
import {
  getEncryptionKey,
  encryptText,
  decryptText,
  encryptBytes,
  decryptBytes,
} from "../../../services/cryptoService";

export function migrateData() {
  return withWriteLock(async () => {
    const folders = await readJSON(foldersFile);
    let foldersChanged = false;
    for (const folder of folders) {
      if (!folder.color) {
        folder.color = DEFAULT_FOLDER_COLOR;
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
    if (foldersChanged) await writeJSON(foldersFile, folders);

    const entries = await readJSON(entriesFile);
    let entriesChanged = false;
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const dailyLogFolder = folders.find((f: any) => f.is_daily_log === true);

    for (const entry of entries) {
      if (entry.status === "processing" && new Date(entry.created_at).getTime() < oneDayAgo) {
        entry.status = "recorded";
        delete entry.assemblyai_id;
        entriesChanged = true;
      }
      if (!entry.updated_at) {
        entry.updated_at = entry.created_at;
        entriesChanged = true;
      }
      if (dailyLogFolder && entry.folder_id === dailyLogFolder.id && !entry.recorded_date) {
        entry.recorded_date = entry.created_at.slice(0, 10);
        entriesChanged = true;
      }
    }
    if (entriesChanged) await writeJSON(entriesFile, entries);

    // ── Encrypt existing plaintext transcripts ──
    const key = await getEncryptionKey();
    if (key) {
      let encryptionMigrated = false;
      for (const entry of entries) {
        if (entry.status === "done" && !entry.encrypted) {
          const textFile = new File(textsDir, `journal_${entry.id}.txt`);
          if (textFile.exists) {
            try {
              const bytes = textFile.bytes();
              decryptText(bytes, key);
              entry.text = "";
              entry.encrypted = true;
              encryptionMigrated = true;
            } catch {
              try {
                const plaintext = await textFile.text();
                const encrypted = encryptText(plaintext, key);
                const base64 = Buffer.from(encrypted).toString("base64");
                await FileSystem.writeAsStringAsync(textFile.uri, base64, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                entry.text = "";
                entry.encrypted = true;
                encryptionMigrated = true;
              } catch (encErr: any) {
                Sentry.captureMessage(
                  `Encryption migration failed for entry ${entry.id}: ${encErr.message}`,
                  "warning"
                );
              }
            }
          }
        }
      }
      if (encryptionMigrated) await writeJSON(entriesFile, entries);

      // ── Encrypt existing plaintext audio files ──
      for (const entry of entries) {
        if (!entry.audio_file) continue;
        const audioFile = new File(audioDir, entry.audio_file);
        if (!audioFile.exists) continue;
        try {
          const bytes = audioFile.bytes();
          decryptBytes(bytes, key);
        } catch {
          try {
            const raw = audioFile.bytes();
            const encrypted = encryptBytes(raw, key);
            const base64 = Buffer.from(encrypted).toString("base64");
            await FileSystem.writeAsStringAsync(audioFile.uri, base64, {
              encoding: FileSystem.EncodingType.Base64,
            });
          } catch (encErr: any) {
            Sentry.captureMessage(
              `Audio encryption migration failed for ${entry.id}: ${encErr.message}`,
              "warning"
            );
          }
        }
      }
    }

    await cleanOrphanedFiles();
  });
}

async function cleanOrphanedFiles() {
  try {
    const entries = await readJSON(entriesFile);
    const entryIds = new Set(entries.map((e: any) => e.id));

    const audioItems = audioDir.list();
    for (const item of audioItems) {
      if (!item.name.endsWith(".wav")) continue;
      const id = item.name.replace(".wav", "");
      if (!entryIds.has(id)) {
        try {
          item.delete();
        } catch {}
      }
    }

    const textItems = textsDir.list();
    for (const item of textItems) {
      if (!item.name.endsWith(".txt")) continue;
      const id = item.name.replace("journal_", "").replace(".txt", "");
      if (!entryIds.has(id)) {
        try {
          item.delete();
        } catch {}
      }
    }
  } catch {
    // Non-critical — skip if listing fails
  }
}
