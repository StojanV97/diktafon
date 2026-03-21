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
    // Never sync plaintext to iCloud — encryption key required
    if (__DEV__) console.warn("icloudSyncService: skipping sync, no encryption key")
    return
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

// ── iCloud File Deletion ────────────────────────────────

export async function deleteFileFromICloud(relativePath) {
  const enabled = await isSyncEnabled()
  if (!enabled) return
  const cs = getCloudStore()
  if (!cs) return

  try {
    const fullPath = icloudPath(relativePath)
    const exists = await cs.exist(fullPath)
    if (exists) await cs.unlink(fullPath)
  } catch (e) {
    if (__DEV__) console.warn(`iCloud delete failed for ${relativePath}:`, e.message)
    Sentry.captureException(e)
  }
}

export async function deleteEntryFilesFromICloud(entryId) {
  await deleteFileFromICloud(`audio/${entryId}.wav`)
  await deleteFileFromICloud(`texts/journal_${entryId}.txt`)
}

// ── Conflict Resolution ────────────────────────────────

/**
 * Merge two arrays of records by ID, keeping the one with later updated_at.
 * Records unique to either side are included (union).
 * Local tombstones (deleted_locally) are preserved — cloud records with
 * matching IDs are skipped to prevent resurrection.
 */
export function mergeRecords(localRecords, cloudRecords) {
  const merged = new Map()
  const tombstoneIds = new Set(
    localRecords.filter(r => r.deleted_locally).map(r => r.id)
  )

  for (const record of localRecords) {
    merged.set(record.id, record)
  }

  for (const record of cloudRecords) {
    // Never resurrect tombstoned records from cloud
    if (tombstoneIds.has(record.id)) continue

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

  // Push only non-tombstoned data to iCloud (tombstones are local-only)
  const cloudSafeFolders = mergedFolders.filter(f => !f.deleted_locally)
  const cloudSafeEntries = mergedEntries.filter(e => !e.deleted_locally)
  await syncJSONToICloud("folders.json", cloudSafeFolders)
  await syncJSONToICloud("entries.json", cloudSafeEntries)

  return {
    folders: mergedFolders,
    entries: mergedEntries,
    changed: foldersChanged || entriesChanged,
  }
}

// ── Fresh Install Restore ───────────────────────────────

export async function checkICloudDataExists() {
  const available = await isICloudAvailable()
  if (!available) return false
  const hasFolders = await fileExistsOnICloud("folders.json")
  const hasEntries = await fileExistsOnICloud("entries.json")
  return hasFolders || hasEntries
}

export async function restoreFromICloud() {
  const folders = await readJSONFromICloud("folders.json") || []
  const entries = await readJSONFromICloud("entries.json") || []

  // Download text files for completed entries (small, do immediately)
  const texts = {}
  for (const entry of entries) {
    if (entry.status !== "done") continue
    try {
      const content = await readFileFromICloud(`texts/journal_${entry.id}.txt`)
      if (content) texts[entry.id] = content
    } catch {}
    // Mark entries for lazy audio download
    if (entry.audio_file) entry.audio_on_icloud = true
  }

  return { folders, entries, texts }
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
