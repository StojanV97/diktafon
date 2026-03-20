import { NativeModules, Platform } from "react-native"
import * as Sentry from "@sentry/react-native"
import { getSettings, updateSettings } from "./settingsService"
import { getEncryptionKey, encryptText, decryptText } from "./cryptoService"

// Lazy import — react-native-cloud-store is iOS-only native module
let CloudStore = null
function getCloudStore() {
  if (CloudStore) return CloudStore
  if (Platform.OS !== "ios") return null
  if (!NativeModules.CloudStoreModule) return null
  try {
    CloudStore = require("react-native-cloud-store")
    return CloudStore
  } catch {
    if (__DEV__) console.warn("icloudSyncService: react-native-cloud-store not available")
    return null
  }
}

// ── Sync Toggle ────────────────────────────────────────

export async function isSyncEnabled() {
  if (Platform.OS !== "ios") return false
  const settings = await getSettings()
  return settings.icloudSyncEnabled
}

export async function enableSync() {
  await updateSettings({ icloudSyncEnabled: true })
}

export async function disableSync() {
  await updateSettings({ icloudSyncEnabled: false })
}

// ── iCloud Availability ────────────────────────────────

export async function isICloudAvailable() {
  if (Platform.OS !== "ios") return false
  const cs = getCloudStore()
  if (!cs) return false
  try {
    return await cs.isICloudAvailable()
  } catch {
    return false
  }
}

// ── File Sync Operations ───────────────────────────────

const ICLOUD_JOURNAL_PATH = "/journal"

function icloudPath(relativePath) {
  return `${ICLOUD_JOURNAL_PATH}/${relativePath}`
}

export async function writeFileToICloud(relativePath, content) {
  const enabled = await isSyncEnabled()
  if (!enabled) return
  const cs = getCloudStore()
  if (!cs) return

  try {
    await cs.writeFile(icloudPath(relativePath), content, { override: true })
  } catch (e) {
    if (__DEV__) console.warn(`iCloud write failed for ${relativePath}:`, e.message)
    Sentry.captureException(e)
  }
}

export async function readFileFromICloud(relativePath) {
  const cs = getCloudStore()
  if (!cs) return null

  try {
    const content = await cs.readFile(icloudPath(relativePath))
    return content
  } catch {
    return null
  }
}

export async function fileExistsOnICloud(relativePath) {
  const cs = getCloudStore()
  if (!cs) return false

  try {
    return await cs.exist(icloudPath(relativePath))
  } catch {
    return false
  }
}

// ── Upload binary (audio) to iCloud ────────────────────

export async function uploadFileToICloud(localUri, relativePath) {
  const enabled = await isSyncEnabled()
  if (!enabled) return
  const cs = getCloudStore()
  if (!cs) return

  try {
    await cs.upload(localUri, icloudPath(relativePath), { override: true })
  } catch (e) {
    if (__DEV__) console.warn(`iCloud upload failed for ${relativePath}:`, e.message)
    Sentry.captureException(e)
  }
}

export async function downloadFileFromICloud(relativePath, localUri) {
  const cs = getCloudStore()
  if (!cs) return false

  try {
    await cs.download(icloudPath(relativePath), localUri)
    return true
  } catch {
    return false
  }
}

// ── JSON Sync Helpers ──────────────────────────────────

export async function syncJSONToICloud(relativePath, data) {
  const json = JSON.stringify(data)
  const key = await getEncryptionKey()
  if (key) {
    const encrypted = encryptText(json, key)
    await writeFileToICloud(relativePath, Buffer.from(encrypted).toString("base64"))
  } else {
    await writeFileToICloud(relativePath, json)
  }
}

export async function readJSONFromICloud(relativePath) {
  const content = await readFileFromICloud(relativePath)
  if (!content) return null

  // Try decryption first, fall back to plaintext for backward compat
  const key = await getEncryptionKey()
  if (key) {
    try {
      const decrypted = decryptText(Buffer.from(content, "base64"), key)
      return JSON.parse(decrypted)
    } catch {
      // Fall through to plaintext parse (pre-encryption data)
    }
  }

  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

// ── Conflict Resolution ────────────────────────────────

/**
 * Merge two arrays of records by ID, keeping the one with later updated_at.
 * Records unique to either side are included (union).
 */
export function mergeRecords(localRecords, cloudRecords) {
  const merged = new Map()

  for (const record of localRecords) {
    merged.set(record.id, record)
  }

  for (const record of cloudRecords) {
    const existing = merged.get(record.id)
    if (!existing) {
      merged.set(record.id, record)
    } else {
      const localTime = new Date(existing.updated_at || existing.created_at).getTime()
      const cloudTime = new Date(record.updated_at || record.created_at).getTime()
      if (cloudTime > localTime) {
        merged.set(record.id, record)
      }
    }
  }

  return Array.from(merged.values())
}

// ── Full Sync (pull from iCloud, merge, push back) ────

export async function pullAndMerge(localFolders, localEntries) {
  const available = await isICloudAvailable()
  if (!available) return { folders: localFolders, entries: localEntries, changed: false }

  const cloudFolders = await readJSONFromICloud("folders.json")
  const cloudEntries = await readJSONFromICloud("entries.json")

  if (!cloudFolders && !cloudEntries) {
    // No cloud data — push local data up
    await syncJSONToICloud("folders.json", localFolders)
    await syncJSONToICloud("entries.json", localEntries)
    return { folders: localFolders, entries: localEntries, changed: false }
  }

  const mergedFolders = cloudFolders
    ? mergeRecords(localFolders, cloudFolders)
    : localFolders
  const mergedEntries = cloudEntries
    ? mergeRecords(localEntries, cloudEntries)
    : localEntries

  const foldersChanged = mergedFolders.length !== localFolders.length ||
    JSON.stringify(mergedFolders) !== JSON.stringify(localFolders)
  const entriesChanged = mergedEntries.length !== localEntries.length ||
    JSON.stringify(mergedEntries) !== JSON.stringify(localEntries)

  // Push merged data back to iCloud
  await syncJSONToICloud("folders.json", mergedFolders)
  await syncJSONToICloud("entries.json", mergedEntries)

  return {
    folders: mergedFolders,
    entries: mergedEntries,
    changed: foldersChanged || entriesChanged,
  }
}

// ── Sync Status ────────────────────────────────────────

export async function getSyncStatus() {
  const enabled = await isSyncEnabled()
  const available = await isICloudAvailable()
  return {
    enabled,
    available,
    platform: Platform.OS,
  }
}
