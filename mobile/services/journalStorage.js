// Re-export from decomposed storage modules.
// All consumers import from this file — the barrel preserves the exact public API.
export {
  // storageCore
  getCorruptionStatus,
  getLastWriteError,

  // folderRepository
  createFolder,
  fetchFolders,
  getFolder,
  updateFolder,
  getAllTags,
  deleteFolder,
  tombstoneFolder,
  deleteFolderWithICloud,
  getTombstonedFolders,

  // entryRepository
  createEntry,
  fetchEntries,
  fetchEntry,
  deleteEntry,
  tombstoneEntry,
  deleteEntryWithICloud,
  getTombstonedEntries,
  reviveTombstonedRecords,
  completeEntry,
  updateEntryText,
  failEntry,
  moveEntryToFolder,

  // audioHelpers
  getDecryptedAudioUri,
  cleanupDecryptedAudio,
  cleanupDecryptedFile,
  entryAudioUri,
  entryAudioExists,
  deleteEntryAudio,
  downloadAudioFromICloud,

  // dailyLogRepository
  getOrCreateDailyLogFolder,
  createDailyLogEntry,
  fetchDailyLogEntries,
  fetchDailyLogStats,
  getDailyCombinedTranscript,
  getDailyCombinedTranscripts,
  consolidateDailyLogEntries,

  // importExport
  exportAllData,
  importAllData,
  importFromICloudRestore,
  getRawFolders,
  getRawEntries,
  overwriteFolders,
  overwriteEntries,

  // migration
  migrateData,
} from "../src/services/storage";
