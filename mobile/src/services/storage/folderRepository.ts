import {
  foldersFile, entriesFile, audioDir, textsDir,
  readJSON, writeJSON, withWriteLock, generateUUID,
  DEFAULT_FOLDER_COLOR,
} from "./storageCore";
import { File } from "expo-file-system";
import { deleteEntryFilesFromCloud } from "../../../services/cloudSyncService";

export function createFolder(name: string, color = DEFAULT_FOLDER_COLOR, tags: string[] = []) {
  return withWriteLock(async () => {
    const folders = await readJSON(foldersFile);
    const now = new Date().toISOString();
    const folder = {
      id: generateUUID(),
      name,
      color,
      tags,
      created_at: now,
      updated_at: now,
    };
    folders.unshift(folder);
    await writeJSON(foldersFile, folders);
    return folder;
  });
}

export async function fetchFolders() {
  const folders = await readJSON(foldersFile);
  return folders.filter((f: any) => !f.deleted_locally);
}

export async function getFolder(id: string) {
  const folders = await readJSON(foldersFile);
  return folders.find((f: any) => f.id === id) || null;
}

export function updateFolder(id: string, updates: { name?: string; color?: string; tags?: string[] }) {
  return withWriteLock(async () => {
    const folders = await readJSON(foldersFile);
    const folder = folders.find((f: any) => f.id === id);
    if (!folder) return null;
    if (updates.name !== undefined) folder.name = updates.name;
    if (updates.color !== undefined) folder.color = updates.color;
    if (updates.tags !== undefined) folder.tags = updates.tags;
    folder.updated_at = new Date().toISOString();
    await writeJSON(foldersFile, folders);
    return folder;
  });
}

export async function getAllTags() {
  const folders = await readJSON(foldersFile);
  const tagSet = new Set<string>();
  for (const folder of folders) {
    if (folder.tags) folder.tags.forEach((t: string) => tagSet.add(t));
  }
  return [...tagSet].sort();
}

export function deleteFolder(id: string) {
  return withWriteLock(async () => {
    const folders = await readJSON(foldersFile);
    const idx = folders.findIndex((f: any) => f.id === id);
    if (idx === -1) return false;

    const entries = await readJSON(entriesFile);
    const toDelete = entries.filter((e: any) => e.folder_id === id);
    await writeJSON(entriesFile, entries.filter((e: any) => e.folder_id !== id));

    for (const e of toDelete) {
      try {
        const audioFile = new File(audioDir, `${e.id}.wav`);
        if (audioFile.exists) audioFile.delete();
        const textFile = new File(textsDir, `journal_${e.id}.txt`);
        if (textFile.exists) textFile.delete();
      } catch {}
    }

    folders.splice(idx, 1);
    await writeJSON(foldersFile, folders);
    return true;
  });
}

export function tombstoneFolder(folderId: string) {
  return withWriteLock(async () => {
    const folders = await readJSON(foldersFile);
    const folder = folders.find((f: any) => f.id === folderId);
    if (!folder) return [];

    const entries = await readJSON(entriesFile);
    const tombstonedIds: string[] = [];

    for (const entry of entries) {
      if (entry.folder_id === folderId && !entry.deleted_locally) {
        entry.deleted_locally = true;
        entry.updated_at = new Date().toISOString();
        tombstonedIds.push(entry.id);
        const audioFile = new File(audioDir, `${entry.id}.wav`);
        if (audioFile.exists) audioFile.delete();
        const textFile = new File(textsDir, `journal_${entry.id}.txt`);
        if (textFile.exists) textFile.delete();
      }
    }
    await writeJSON(entriesFile, entries);

    folder.deleted_locally = true;
    folder.updated_at = new Date().toISOString();
    await writeJSON(foldersFile, folders);

    return tombstonedIds;
  });
}

export function deleteFolderWithICloud(folderId: string) {
  return withWriteLock(async () => {
    const folders = await readJSON(foldersFile);
    const idx = folders.findIndex((f: any) => f.id === folderId);
    if (idx === -1) return false;

    const entries = await readJSON(entriesFile);
    const toDelete = entries.filter((e: any) => e.folder_id === folderId);
    await writeJSON(entriesFile, entries.filter((e: any) => e.folder_id !== folderId));

    for (const e of toDelete) {
      try {
        const audioFile = new File(audioDir, `${e.id}.wav`);
        if (audioFile.exists) audioFile.delete();
        const textFile = new File(textsDir, `journal_${e.id}.txt`);
        if (textFile.exists) textFile.delete();
      } catch {}
      deleteEntryFilesFromCloud(e.id).catch(() => {});
    }

    folders.splice(idx, 1);
    await writeJSON(foldersFile, folders);
    return true;
  });
}

export async function getTombstonedFolders() {
  const folders = await readJSON(foldersFile);
  return folders.filter((f: any) => f.deleted_locally === true);
}
