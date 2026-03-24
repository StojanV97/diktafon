import { Platform } from "react-native"
import { File, Paths } from "expo-file-system"
import * as Sentry from "@sentry/react-native"
import { getSettings, updateSettings } from "./settingsService"
import { getEncryptionKey, encryptText, decryptText } from "./cryptoService"
import { mergeRecords } from "./icloudSyncService"

// Lazy import — Google Sign-In is Android-only in this app
let GoogleSignin: any = null
function getGoogleSignin() {
  if (GoogleSignin) return GoogleSignin
  if (Platform.OS !== "android") return null
  try {
    const mod = require("@react-native-google-signin/google-signin")
    GoogleSignin = mod.GoogleSignin
    return GoogleSignin
  } catch {
    if (__DEV__) console.warn("googleDriveSyncService: @react-native-google-signin not available")
    return null
  }
}

// ── Google Drive REST API helpers ─────────────────────

const DRIVE_API = "https://www.googleapis.com/drive"
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive"

async function getAccessToken(): Promise<string | null> {
  const gs = getGoogleSignin()
  if (!gs) return null
  try {
    const { accessToken } = await gs.getTokens()
    return accessToken
  } catch {
    return null
  }
}

/**
 * Find a file in appDataFolder by name (path used as name).
 * Returns the Google Drive file ID or null.
 */
async function findFileByName(name: string, token: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${name}' and 'appDataFolder' in parents and trashed=false`)
  const res = await fetch(`${DRIVE_API}/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

/**
 * Upload or update a text/binary file in appDataFolder.
 * If a file with the same name exists, it is updated. Otherwise created.
 */
async function upsertFile(
  name: string,
  content: Uint8Array | string,
  mimeType: string,
  token: string
): Promise<boolean> {
  try {
    const existingId = await findFileByName(name, token)
    const body = typeof content === "string" ? content : content
    const boundary = "diktafon_boundary_" + Date.now()
    const isText = typeof content === "string"

    const metadata = existingId
      ? { name }
      : { name, parents: ["appDataFolder"] }

    // Multipart upload (metadata + content)
    const metaPart = JSON.stringify(metadata)
    const parts = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`,
    ]

    if (isText) {
      parts.push(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n${content}\r\n`)
    } else {
      // For binary: encode as base64 in the multipart body
      const b64 = Buffer.from(content).toString("base64")
      parts.push(
        `--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64}\r\n`
      )
    }
    parts.push(`--${boundary}--`)
    const multipartBody = parts.join("")

    const url = existingId
      ? `${DRIVE_UPLOAD_API}/v3/files/${existingId}?uploadType=multipart`
      : `${DRIVE_UPLOAD_API}/v3/files?uploadType=multipart`

    const method = existingId ? "PATCH" : "POST"

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    })

    return res.ok
  } catch (e) {
    if (__DEV__) console.warn(`Google Drive upsert failed for ${name}:`, e)
    Sentry.captureException(e)
    return false
  }
}

/**
 * Download file content from appDataFolder by name.
 */
async function downloadFile(name: string, token: string): Promise<ArrayBuffer | null> {
  const fileId = await findFileByName(name, token)
  if (!fileId) return null

  const res = await fetch(`${DRIVE_API}/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return await res.arrayBuffer()
}

/**
 * Download file content as text.
 */
async function downloadFileAsText(name: string, token: string): Promise<string | null> {
  const fileId = await findFileByName(name, token)
  if (!fileId) return null

  const res = await fetch(`${DRIVE_API}/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  return await res.text()
}

/**
 * Delete a file from appDataFolder by name.
 */
async function deleteFileByName(name: string, token: string): Promise<boolean> {
  const fileId = await findFileByName(name, token)
  if (!fileId) return true // Already gone

  const res = await fetch(`${DRIVE_API}/v3/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
  return res.ok || res.status === 404
}

// ── Auth ──────────────────────────────────────────────

export async function signInToGoogle(): Promise<{ email: string } | null> {
  const gs = getGoogleSignin()
  if (!gs) return null
  try {
    await gs.hasPlayServices()
    const userInfo = await gs.signIn()
    const email = userInfo?.data?.user?.email ?? ""
    if (email) {
      await updateSettings({ googleDriveEmail: email })
    }
    return { email }
  } catch (e) {
    if (__DEV__) console.warn("Google Sign-In failed:", e)
    Sentry.captureException(e)
    return null
  }
}

export async function signOutFromGoogle(): Promise<void> {
  const gs = getGoogleSignin()
  if (!gs) return
  try {
    await gs.signOut()
    await updateSettings({ googleDriveSyncEnabled: false, googleDriveEmail: "" })
  } catch (e) {
    if (__DEV__) console.warn("Google Sign-Out failed:", e)
  }
}

export async function isSignedIn(): Promise<boolean> {
  const gs = getGoogleSignin()
  if (!gs) return false
  try {
    return gs.hasPreviousSignIn()
  } catch {
    return false
  }
}

// ── Sync Toggle ───────────────────────────────────────

export async function isSyncEnabled(): Promise<boolean> {
  if (Platform.OS !== "android") return false
  const settings = await getSettings()
  return settings.googleDriveSyncEnabled
}

export async function enableSync(): Promise<void> {
  await updateSettings({ googleDriveSyncEnabled: true })
}

export async function disableSync(): Promise<void> {
  await updateSettings({ googleDriveSyncEnabled: false })
}

// ── Availability ──────────────────────────────────────

export async function isGoogleDriveAvailable(): Promise<boolean> {
  if (Platform.OS !== "android") return false
  return await isSignedIn()
}

// ── File Sync Operations ──────────────────────────────

const DRIVE_JOURNAL_PREFIX = "journal/"

function drivePath(relativePath: string): string {
  return `${DRIVE_JOURNAL_PREFIX}${relativePath}`
}

export async function writeFileToGoogleDrive(relativePath: string, content: string): Promise<void> {
  const enabled = await isSyncEnabled()
  if (!enabled) return
  const token = await getAccessToken()
  if (!token) return

  await upsertFile(drivePath(relativePath), content, "text/plain", token)
}

export async function uploadFileToGoogleDrive(localUri: string, relativePath: string): Promise<void> {
  const enabled = await isSyncEnabled()
  if (!enabled) return
  const token = await getAccessToken()
  if (!token) return

  try {
    const file = new File(localUri)
    if (!file.exists) return
    const bytes = file.bytes()
    await upsertFile(drivePath(relativePath), bytes, "application/octet-stream", token)
  } catch (e) {
    if (__DEV__) console.warn(`Google Drive upload failed for ${relativePath}:`, e)
    Sentry.captureException(e)
  }
}

export async function readFileFromGoogleDrive(relativePath: string): Promise<string | null> {
  const token = await getAccessToken()
  if (!token) return null
  return await downloadFileAsText(drivePath(relativePath), token)
}

export async function downloadFileFromGoogleDrive(relativePath: string, localUri: string): Promise<boolean> {
  const token = await getAccessToken()
  if (!token) return false

  try {
    const data = await downloadFile(drivePath(relativePath), token)
    if (!data) return false
    const localFile = new File(localUri)
    localFile.write(new Uint8Array(data))
    return true
  } catch {
    return false
  }
}

export async function deleteFileFromGoogleDrive(relativePath: string): Promise<void> {
  const enabled = await isSyncEnabled()
  if (!enabled) return
  const token = await getAccessToken()
  if (!token) return

  try {
    await deleteFileByName(drivePath(relativePath), token)
  } catch (e) {
    if (__DEV__) console.warn(`Google Drive delete failed for ${relativePath}:`, e)
    Sentry.captureException(e)
  }
}

export async function deleteEntryFilesFromGoogleDrive(entryId: string): Promise<void> {
  await deleteFileFromGoogleDrive(`audio/${entryId}.wav`)
  await deleteFileFromGoogleDrive(`texts/journal_${entryId}.txt`)
}

// ── JSON Sync Helpers ─────────────────────────────────

export async function syncJSONToGoogleDrive(relativePath: string, data: any[]): Promise<void> {
  const json = JSON.stringify(data)
  const key = await getEncryptionKey()
  if (key) {
    const encrypted = encryptText(json, key)
    await writeFileToGoogleDrive(relativePath, Buffer.from(encrypted).toString("base64"))
  } else {
    // Never sync plaintext — encryption key required
    if (__DEV__) console.warn("googleDriveSyncService: skipping sync, no encryption key")
    return
  }
}

export async function readJSONFromGoogleDrive(relativePath: string): Promise<any[] | null> {
  const content = await readFileFromGoogleDrive(relativePath)
  if (!content) return null

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

// ── Full Sync (pull from Google Drive, merge, push back) ──

export async function pullAndMerge(
  localFolders: any[],
  localEntries: any[]
): Promise<{ folders: any[]; entries: any[]; changed: boolean }> {
  const available = await isGoogleDriveAvailable()
  if (!available) return { folders: localFolders, entries: localEntries, changed: false }

  const cloudFolders = await readJSONFromGoogleDrive("folders.json")
  const cloudEntries = await readJSONFromGoogleDrive("entries.json")

  if (!cloudFolders && !cloudEntries) {
    // No cloud data — push local data up
    await syncJSONToGoogleDrive("folders.json", localFolders)
    await syncJSONToGoogleDrive("entries.json", localEntries)
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

  // Push only non-tombstoned data (tombstones are local-only)
  const cloudSafeFolders = mergedFolders.filter((f: any) => !f.deleted_locally)
  const cloudSafeEntries = mergedEntries.filter((e: any) => !e.deleted_locally)
  await syncJSONToGoogleDrive("folders.json", cloudSafeFolders)
  await syncJSONToGoogleDrive("entries.json", cloudSafeEntries)

  return {
    folders: mergedFolders,
    entries: mergedEntries,
    changed: foldersChanged || entriesChanged,
  }
}

// ── Fresh Install Restore ─────────────────────────────

export async function checkGoogleDriveDataExists(): Promise<boolean> {
  const available = await isGoogleDriveAvailable()
  if (!available) return false
  const token = await getAccessToken()
  if (!token) return false

  const foldersId = await findFileByName(drivePath("folders.json"), token)
  const entriesId = await findFileByName(drivePath("entries.json"), token)
  return !!(foldersId || entriesId)
}

export async function restoreFromGoogleDrive(): Promise<{
  folders: any[]
  entries: any[]
  texts: Record<string, string>
}> {
  const folders = await readJSONFromGoogleDrive("folders.json") || []
  const entries = await readJSONFromGoogleDrive("entries.json") || []

  // Download text files for completed entries
  const texts: Record<string, string> = {}
  for (const entry of entries) {
    if (entry.status !== "done") continue
    try {
      const content = await readFileFromGoogleDrive(`texts/journal_${entry.id}.txt`)
      if (content) texts[entry.id] = content
    } catch {}
    // Mark entries for lazy audio download
    if (entry.audio_file) entry.audio_on_google_drive = true
  }

  return { folders, entries, texts }
}

// ── Initial Upload (all existing data) ────────────────

export async function uploadAllExistingData(
  folders: any[],
  entries: any[],
  audioDir: InstanceType<typeof File>[],
  textsDir: InstanceType<typeof File>[]
): Promise<{ uploaded: number }> {
  let uploaded = 0

  // Upload metadata
  await syncJSONToGoogleDrive("folders.json", folders)
  await syncJSONToGoogleDrive("entries.json", entries)
  uploaded += 2

  // Upload audio files
  for (const audioFile of audioDir) {
    await uploadFileToGoogleDrive(audioFile.uri, `audio/${audioFile.name}`)
    uploaded++
  }

  // Upload text files
  for (const textFile of textsDir) {
    await uploadFileToGoogleDrive(textFile.uri, `texts/${textFile.name}`)
    uploaded++
  }

  return { uploaded }
}

// ── Sync Status ───────────────────────────────────────

export async function getSyncStatus(): Promise<{
  enabled: boolean
  available: boolean
  email: string
  platform: string
}> {
  const settings = await getSettings()
  const available = await isGoogleDriveAvailable()
  return {
    enabled: settings.googleDriveSyncEnabled,
    available,
    email: settings.googleDriveEmail,
    platform: Platform.OS,
  }
}
