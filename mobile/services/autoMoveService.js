import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchDailyLogEntries, getFolder, moveEntryToFolder, deleteEntryAudio } from "./journalStorage";
import { syncWidgetData } from "./widgetDataService";

export async function runAutoMove() {
  try {
    const targetFolderId = await AsyncStorage.getItem("daily_log_auto_move_folder_id");
    if (!targetFolderId) return null;

    const folder = await getFolder(targetFolderId);
    if (!folder) {
      await AsyncStorage.removeItem("daily_log_auto_move_folder_id");
      await AsyncStorage.removeItem("daily_log_auto_move_folder_name");
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);
    const entries = await fetchDailyLogEntries();
    const toMove = entries.filter(
      (e) => e.status === "done" && (e.recorded_date || e.created_at.slice(0, 10)) < today
    );
    if (toMove.length === 0) return null;

    const keepAudio = (await AsyncStorage.getItem("daily_log_auto_move_keep_audio")) === "true";

    for (const entry of toMove) {
      await moveEntryToFolder(entry.id, targetFolderId);
      if (!keepAudio) {
        deleteEntryAudio(entry.id);
      }
    }

    syncWidgetData();
    return { moved: toMove.length, folderName: folder.name };
  } catch (e) {
    console.warn("Auto-move failed:", e.message);
    return null;
  }
}
