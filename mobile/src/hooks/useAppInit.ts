import { useEffect, useState } from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Sentry from "@sentry/react-native";
import { t } from "../i18n";
import {
  migrateData,
  getCorruptionStatus,
  getRawFolders,
  getRawEntries,
  overwriteFolders,
  overwriteEntries,
  cleanupDecryptedAudio,
  importFromICloudRestore,
} from "../../services/journalStorage";
import { initEncryption } from "../../services/cryptoService";
import { syncWidgetData } from "../../services/widgetDataService";
import { runAutoMove } from "../../services/autoMoveService";
import { initPurchases } from "../../services/subscriptionService";
import {
  pullAndMerge,
  isSyncEnabled,
  checkICloudDataExists,
  restoreFromICloud,
  enableSync,
} from "../../services/icloudSyncService";
import { setupSslPinning } from "../../services/sslPinningService";
import { initRuntimeProtection } from "../../services/runtimeProtectionService";

export function useAppInit() {
  const [ready, setReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState("Home");

  useEffect(() => {
    async function init() {
      try {
        cleanupDecryptedAudio();
        await setupSslPinning().catch(() => {});
        await initEncryption();
        await migrateData();

        const hasSeenAuth = await AsyncStorage.getItem("hasSeenAuth");
        if (!hasSeenAuth) {
          setInitialRoute("Auth");
        }

        try {
          await initPurchases("ios");
        } catch (e: any) {
          if (__DEV__) console.warn("RevenueCat init failed:", e.message);
        }

        try {
          await initRuntimeProtection();
        } catch (e: any) {
          if (__DEV__) console.warn("freeRASP init failed:", e.message);
        }
      } catch (e: any) {
        Sentry.captureException(e);
        if (__DEV__) console.warn("App init failed:", e.message);
        Alert.alert(t("app.initErrorTitle"), t("app.initErrorMessage"), [
          { text: t("common.ok") },
        ]);
      }

      const corrupted = getCorruptionStatus();
      if (corrupted) {
        Alert.alert(t("app.corruptionTitle"), t("app.corruptionMessage"), [
          { text: t("common.ok") },
        ]);
      }

      // iCloud sync BEFORE setReady — prevents races with user operations
      try {
        const syncEnabled = await isSyncEnabled();
        if (syncEnabled) {
          const localFolders = await getRawFolders();
          const localEntries = await getRawEntries();
          const result = await pullAndMerge(localFolders, localEntries);
          if (result.changed) {
            await overwriteFolders(result.folders);
            await overwriteEntries(result.entries);
          }
        }
      } catch (e: any) {
        if (__DEV__) console.warn("iCloud sync on launch failed:", e.message);
      }

      // Fresh install restore: detect empty local + iCloud data exists
      try {
        const localFolders = await getRawFolders();
        const localEntries = await getRawEntries();
        if (localFolders.length === 0 && localEntries.length === 0) {
          const hasICloudData = await checkICloudDataExists();
          if (hasICloudData) {
            await new Promise<void>((resolve) => {
              Alert.alert(
                t("app.icloudRestoreTitle"),
                t("app.icloudRestoreMessage"),
                [
                  { text: t("common.no"), onPress: () => resolve() },
                  {
                    text: t("app.icloudRestoreButton"),
                    onPress: async () => {
                      try {
                        const data = await restoreFromICloud();
                        await importFromICloudRestore(data);
                        await enableSync();
                      } catch (e: any) {
                        if (__DEV__)
                          console.warn("iCloud restore failed:", e.message);
                      }
                      resolve();
                    },
                  },
                ]
              );
            });
          }
        }
      } catch (e: any) {
        if (__DEV__)
          console.warn("iCloud restore check failed:", e.message);
      }

      setReady(true);
      syncWidgetData().catch(() => {});
      runAutoMove().catch(() => {});
    }
    init();
  }, []);

  return { ready, initialRoute };
}
