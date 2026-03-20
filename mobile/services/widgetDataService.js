import { Platform } from "react-native";
import { requireNativeModule } from "expo-modules-core";
import { fetchDailyLogStats } from "./journalStorage";

let WidgetModule;
try {
  if (Platform.OS === "ios") {
    WidgetModule = requireNativeModule("ReactNativeWidgetExtension");
  }
} catch {
  // Widget module not available (Android or missing native build)
}

export async function getPendingAction() {
  if (Platform.OS !== "ios" || !WidgetModule) return null
  try {
    return await WidgetModule.getPendingAction()
  } catch {
    return null
  }
}

export async function syncWidgetData() {
  if (!WidgetModule) return;

  try {
    const stats = await fetchDailyLogStats();
    const data = JSON.stringify({
      clipCount: stats.clipCount,
      totalDurationSeconds: stats.totalDuration,
      lastUpdated: new Date().toISOString(),
    });
    WidgetModule.setWidgetData(data);
  } catch (e) {
    if (__DEV__) console.warn("Widget data sync failed:", e);
  }
}
