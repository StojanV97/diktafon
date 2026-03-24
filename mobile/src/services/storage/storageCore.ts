import { File, Directory, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as Sentry from "@sentry/react-native";
import crypto from "react-native-quick-crypto";
import {
  syncJSONToCloud,
} from "../../../services/cloudSyncService";
import {
  getEncryptionKey,
  encryptText,
  decryptText,
} from "../../../services/cryptoService";

export function generateUUID(): string {
  return crypto.randomUUID();
}

export const journalDir = new Directory(Paths.document, "journal");
export const audioDir = new Directory(journalDir, "audio");
export const textsDir = new Directory(journalDir, "texts");
export const foldersFile = new File(journalDir, "folders.json");
export const entriesFile = new File(journalDir, "entries.json");

export const DAILY_LOG_FOLDER_NAME = "Dnevni Log";
export const DEFAULT_FOLDER_COLOR = "#4A9EFF";
export const DAILY_LOG_FOLDER_COLOR = "#3B5EDB";

// In-memory cache — avoids re-reading + JSON-parsing on every read (esp. 5s polling)
let _foldersCache: any[] | null = null;
let _entriesCache: any[] | null = null;

// Corruption detection — set when both main + .bak files are unreadable
let _corruptionDetected: string | null = null;
// Last write error — for surfacing disk-full / permission errors to the UI
let _lastWriteError: Error | null = null;

// Serialized write queue — prevents concurrent read-modify-write races
let _writeQueue = Promise.resolve();

export function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = _writeQueue.then(fn);
  _writeQueue = result.then(
    () => {},
    () => {}
  );
  return result;
}

export function ensureDirs(): void {
  journalDir.create({ idempotent: true });
  audioDir.create({ idempotent: true });
  textsDir.create({ idempotent: true });
}

export async function readJSON(file: InstanceType<typeof File>): Promise<any[]> {
  if (file === foldersFile && _foldersCache !== null) return _foldersCache;
  if (file === entriesFile && _entriesCache !== null) return _entriesCache;

  let result: any[];
  try {
    if (!file.exists) {
      const bakFile = new File(file.parentDirectory, file.name + ".bak");
      if (bakFile.exists) {
        const key = await getEncryptionKey();
        if (key) {
          try {
            const bytes = bakFile.bytesSync();
            const decrypted = decryptText(bytes, key);
            result = JSON.parse(decrypted);
          } catch {
            const bakRaw = await bakFile.text();
            result = JSON.parse(bakRaw);
          }
        } else {
          const bakRaw = await bakFile.text();
          result = JSON.parse(bakRaw);
        }
        if (__DEV__) console.warn(`readJSON: ${file.name} missing, recovered from .bak`);
        await writeJSON(file, result);
      } else {
        result = [];
      }
    } else {
      const key = await getEncryptionKey();
      if (key) {
        try {
          const bytes = file.bytesSync();
          const decrypted = decryptText(bytes, key);
          result = JSON.parse(decrypted);
        } catch {
          const raw = await file.text();
          result = JSON.parse(raw);
        }
      } else {
        const raw = await file.text();
        result = JSON.parse(raw);
      }
    }
  } catch (e) {
    const bakFile = new File(file.parentDirectory, file.name + ".bak");
    if (bakFile.exists) {
      try {
        const key = await getEncryptionKey();
        if (key) {
          try {
            const bytes = bakFile.bytesSync();
            const decrypted = decryptText(bytes, key);
            result = JSON.parse(decrypted);
          } catch {
            const bakRaw = await bakFile.text();
            result = JSON.parse(bakRaw);
          }
        } else {
          const bakRaw = await bakFile.text();
          result = JSON.parse(bakRaw);
        }
        if (__DEV__) console.warn(`readJSON: ${file.name} corrupted, recovered from .bak`);
        await writeJSON(file, result);
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

export async function writeJSON(file: InstanceType<typeof File>, data: any[]): Promise<void> {
  try {
    ensureDirs();
    const json = JSON.stringify(data);
    const key = await getEncryptionKey();
    const tmpFile = new File(file.parentDirectory, file.name + ".tmp");
    if (key) {
      const encrypted = encryptText(json, key);
      const base64 = Buffer.from(encrypted).toString("base64");
      await FileSystem.writeAsStringAsync(tmpFile.uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else {
      await FileSystem.writeAsStringAsync(tmpFile.uri, json);
    }
    if (file.exists) {
      const bakFile = new File(file.parentDirectory, file.name + ".bak");
      if (bakFile.exists) bakFile.delete();
      file.copy(bakFile);
      file.delete();
    }
    tmpFile.move(file);

    if (file === foldersFile) _foldersCache = data;
    else if (file === entriesFile) _entriesCache = data;

    if (file === foldersFile) {
      syncJSONToCloud("folders.json", data).catch((e: Error) =>
        Sentry.captureMessage("Cloud sync failed: " + e.message, "warning")
      );
    } else if (file === entriesFile) {
      syncJSONToCloud("entries.json", data).catch((e: Error) =>
        Sentry.captureMessage("Cloud sync failed: " + e.message, "warning")
      );
    }
  } catch (e) {
    if (__DEV__) console.warn(`writeJSON: failed to write ${file.name}:`, e);
    Sentry.captureException(e);
    _lastWriteError = e as Error;
    throw e;
  }
}

export function getCorruptionStatus(): string | null {
  return _corruptionDetected;
}

export function getLastWriteError(): Error | null {
  const err = _lastWriteError;
  _lastWriteError = null;
  return err;
}

export async function writeEncryptedText(textFile: InstanceType<typeof File>, plaintext: string): Promise<void> {
  const key = await getEncryptionKey();
  if (key) {
    const encrypted = encryptText(plaintext, key);
    const base64 = Buffer.from(encrypted).toString("base64");
    await FileSystem.writeAsStringAsync(textFile.uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } else {
    await FileSystem.writeAsStringAsync(textFile.uri, plaintext);
  }
}

export async function readDecryptedText(textFile: InstanceType<typeof File>): Promise<string> {
  const key = await getEncryptionKey();
  if (!key) {
    return await textFile.text();
  }
  try {
    const bytes = textFile.bytes();
    return decryptText(bytes, key);
  } catch {
    try {
      return await textFile.text();
    } catch {
      return "";
    }
  }
}
