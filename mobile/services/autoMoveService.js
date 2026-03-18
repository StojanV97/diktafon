import { fetchDailyLogEntries, getFolder, moveEntryToFolder, deleteEntryAudio } from "./journalStorage";
import { getSettings, updateSettings } from "./settingsService";
import { syncWidgetData } from "./widgetDataService";

export async function runAutoMove() {
  try {
    const settings = await getSettings();
    if (!settings.autoMoveFolderId) return null;

    const folder = await getFolder(settings.autoMoveFolderId);
    if (!folder) {
      await updateSettings({ autoMoveFolderId: null, autoMoveFolderName: null });
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);
    const entries = await fetchDailyLogEntries();
    const toMove = entries.filter(
      (e) => e.status === "done" && (e.recorded_date || e.created_at.slice(0, 10)) < today
    );
    if (toMove.length === 0) return null;

    for (const entry of toMove) {
      await moveEntryToFolder(entry.id, settings.autoMoveFolderId);
      if (!settings.autoMoveKeepAudio) {
        deleteEntryAudio(entry.id);
      }
    }

    syncWidgetData();
    return { moved: toMove.length, folderName: folder.name };
  } catch (e) {
    if (__DEV__) console.warn("Auto-move failed:", e.message);
    return null;
  }
}
