import { File, Directory, Paths } from "expo-file-system";
import {
  getEncryptionKey,
  encryptBytes,
  decryptBytes,
} from "../../../services/cryptoService";
import { audioDir, ensureDirs } from "./storageCore";

const tempAudioDir = new Directory(Paths.cache, "decrypted_audio");

export async function encryptAudioFile(audioFile: InstanceType<typeof File>): Promise<void> {
  const key = await getEncryptionKey();
  if (!key) return;
  const rawBytes = audioFile.bytesSync();
  const encrypted = encryptBytes(rawBytes, key);
  audioFile.write(encrypted);
}

export async function getDecryptedAudioUri(entryId: string): Promise<string | null> {
  const audioFile = new File(audioDir, `${entryId}.wav`);
  if (!audioFile.exists) return null;

  const key = await getEncryptionKey();
  if (!key) return audioFile.uri;

  try {
    const encBytes = audioFile.bytesSync();
    const decrypted = decryptBytes(encBytes, key);
    tempAudioDir.create({ idempotent: true });
    const tempFile = new File(tempAudioDir, `${entryId}.wav`);
    tempFile.write(decrypted);
    return tempFile.uri;
  } catch {
    return audioFile.uri;
  }
}

export function cleanupDecryptedAudio(): void {
  try {
    if (tempAudioDir.exists) tempAudioDir.delete();
  } catch {}
}

export function entryAudioUri(entryId: string): string {
  const file = new File(audioDir, `${entryId}.wav`);
  return file.uri;
}

export function entryAudioExists(entryId: string): boolean {
  const file = new File(audioDir, `${entryId}.wav`);
  return file.exists;
}

export function deleteEntryAudio(entryId: string): void {
  const audioFile = new File(audioDir, `${entryId}.wav`);
  if (audioFile.exists) audioFile.delete();
}

export async function downloadAudioFromICloud(entryId: string): Promise<boolean> {
  const { downloadFileFromICloud, fileExistsOnICloud } = require("../../../services/icloudSyncService");

  const icloudRelPath = `audio/${entryId}.wav`;
  const exists = await fileExistsOnICloud(icloudRelPath);
  if (!exists) return false;

  ensureDirs();
  const localFile = new File(audioDir, `${entryId}.wav`);
  const success = await downloadFileFromICloud(icloudRelPath, localFile.uri);
  return success && localFile.exists;
}
