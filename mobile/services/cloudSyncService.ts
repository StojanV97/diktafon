import { Platform } from "react-native"
import {
  isSyncEnabled as isICloudSyncEnabled,
  uploadFileToICloud,
  deleteFileFromICloud,
  deleteEntryFilesFromICloud,
  syncJSONToICloud,
  pullAndMerge as iCloudPullAndMerge,
  checkICloudDataExists,
  restoreFromICloud,
} from "./icloudSyncService"
import {
  isSyncEnabled as isGoogleDriveSyncEnabled,
  uploadFileToGoogleDrive,
  deleteFileFromGoogleDrive,
  deleteEntryFilesFromGoogleDrive,
  syncJSONToGoogleDrive,
  pullAndMerge as googleDrivePullAndMerge,
  checkGoogleDriveDataExists,
  restoreFromGoogleDrive,
} from "./googleDriveSyncService"

export async function isCloudSyncEnabled(): Promise<boolean> {
  if (Platform.OS === "ios") return await isICloudSyncEnabled()
  if (Platform.OS === "android") return await isGoogleDriveSyncEnabled()
  return false
}

export async function uploadFileToCloud(localUri: string, relativePath: string): Promise<void> {
  if (Platform.OS === "ios") {
    return uploadFileToICloud(localUri, relativePath)
  } else if (Platform.OS === "android") {
    return uploadFileToGoogleDrive(localUri, relativePath)
  }
}

export async function deleteFileFromCloud(relativePath: string): Promise<void> {
  if (Platform.OS === "ios") {
    return deleteFileFromICloud(relativePath)
  } else if (Platform.OS === "android") {
    return deleteFileFromGoogleDrive(relativePath)
  }
}

export async function deleteEntryFilesFromCloud(entryId: string): Promise<void> {
  if (Platform.OS === "ios") {
    return deleteEntryFilesFromICloud(entryId)
  } else if (Platform.OS === "android") {
    return deleteEntryFilesFromGoogleDrive(entryId)
  }
}

export async function syncJSONToCloud(relativePath: string, data: any[]): Promise<void> {
  if (Platform.OS === "ios") {
    return syncJSONToICloud(relativePath, data)
  } else if (Platform.OS === "android") {
    return syncJSONToGoogleDrive(relativePath, data)
  }
}

export async function pullAndMergeCloud(
  localFolders: any[],
  localEntries: any[]
): Promise<{ folders: any[]; entries: any[]; changed: boolean }> {
  if (Platform.OS === "ios") {
    return iCloudPullAndMerge(localFolders, localEntries)
  } else if (Platform.OS === "android") {
    return googleDrivePullAndMerge(localFolders, localEntries)
  }
  return { folders: localFolders, entries: localEntries, changed: false }
}

export async function checkCloudDataExists(): Promise<boolean> {
  if (Platform.OS === "ios") return await checkICloudDataExists()
  if (Platform.OS === "android") return await checkGoogleDriveDataExists()
  return false
}

export async function restoreFromCloud(): Promise<{
  folders: any[]
  entries: any[]
  texts: Record<string, string>
}> {
  if (Platform.OS === "ios") return await restoreFromICloud()
  if (Platform.OS === "android") return await restoreFromGoogleDrive()
  return { folders: [], entries: [], texts: {} }
}
