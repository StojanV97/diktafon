// Barrel re-export — preserves exact public API of the old journalStorage.js

// storageCore
export { getCorruptionStatus, getLastWriteError } from "./storageCore";

// folderRepository
export {
  createFolder,
  fetchFolders,
  getFolder,
  updateFolder,
  getAllTags,
  deleteFolder,
  tombstoneFolder,
  deleteFolderWithICloud,
  getTombstonedFolders,
} from "./folderRepository";

// entryRepository
export {
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
} from "./entryRepository";

// audioHelpers
export {
  getDecryptedAudioUri,
  cleanupDecryptedAudio,
  cleanupDecryptedFile,
  entryAudioUri,
  entryAudioExists,
  deleteEntryAudio,
  downloadAudioFromICloud,
} from "./audioHelpers";

// dailyLogRepository
export {
  getOrCreateDailyLogFolder,
  createDailyLogEntry,
  fetchDailyLogEntries,
  fetchDailyLogStats,
  getDailyCombinedTranscript,
  getDailyCombinedTranscripts,
  consolidateDailyLogEntries,
} from "./dailyLogRepository";

// importExport
export {
  exportAllData,
  importAllData,
  importFromICloudRestore,
  getRawFolders,
  getRawEntries,
  overwriteFolders,
  overwriteEntries,
} from "./importExport";

// migration
export { migrateData } from "./migration";

// reminderRepository
export {
  fetchReminders,
  fetchReminder,
  createReminder,
  updateReminder,
  deleteReminder,
  markReminderDone,
  snoozeReminder,
  getPendingReminders,
  getNextOccurrence,
} from "./reminderRepository";

// planRepository
export {
  fetchPlans,
  createPlan,
  updatePlan,
  deletePlan,
} from "./planRepository";
