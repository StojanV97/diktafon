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
  pullAndMerge as iCloudPullAndMerge,
  isSyncEnabled as isICloudSyncEnabled,
  checkICloudDataExists,
  restoreFromICloud,
  enableSync as enableICloudSync,
} from "../../services/icloudSyncService";
import {
  pullAndMerge as googleDrivePullAndMerge,
  isSyncEnabled as isGoogleDriveSyncEnabled,
  checkGoogleDriveDataExists,
  restoreFromGoogleDrive,
  enableSync as enableGoogleDriveSync,
} from "../../services/googleDriveSyncService";
import { Platform } from "react-native";
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

      // Cloud sync BEFORE setReady — prevents races with user operations
      try {
        const isIOS = Platform.OS === "ios";
        const syncEnabled = isIOS
          ? await isICloudSyncEnabled()
          : await isGoogleDriveSyncEnabled();
        if (syncEnabled) {
          const localFolders = await getRawFolders();
          const localEntries = await getRawEntries();
          const pullAndMerge = isIOS ? iCloudPullAndMerge : googleDrivePullAndMerge;
          const result = await pullAndMerge(localFolders, localEntries);
          if (result.changed) {
            await overwriteFolders(result.folders);
            await overwriteEntries(result.entries);
          }
        }
      } catch (e: any) {
        if (__DEV__) console.warn("Cloud sync on launch failed:", e.message);
      }

      // Fresh install restore: detect empty local + cloud data exists
      try {
        const localFolders = await getRawFolders();
        const localEntries = await getRawEntries();
        if (localFolders.length === 0 && localEntries.length === 0) {
          const isIOS = Platform.OS === "ios";
          const hasCloudData = isIOS
            ? await checkICloudDataExists()
            : await checkGoogleDriveDataExists();
          if (hasCloudData) {
            const titleKey = isIOS ? "app.icloudRestoreTitle" : "app.googleDriveRestoreTitle";
            const messageKey = isIOS ? "app.icloudRestoreMessage" : "app.googleDriveRestoreMessage";
            const buttonKey = isIOS ? "app.icloudRestoreButton" : "app.googleDriveRestoreButton";
            await new Promise<void>((resolve) => {
              Alert.alert(
                t(titleKey),
                t(messageKey),
                [
                  { text: t("common.no"), onPress: () => resolve() },
                  {
                    text: t(buttonKey),
                    onPress: async () => {
                      try {
                        const data = isIOS
                          ? await restoreFromICloud()
                          : await restoreFromGoogleDrive();
                        await importFromICloudRestore(data);
                        if (isIOS) {
                          await enableICloudSync();
                        } else {
                          await enableGoogleDriveSync();
                        }
                      } catch (e: any) {
                        if (__DEV__)
                          console.warn("Cloud restore failed:", e.message);
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
          console.warn("Cloud restore check failed:", e.message);
      }

      setReady(true);
      syncWidgetData().catch(() => {});
      runAutoMove().catch(() => {});
    }
    init();
  }, []);

  return { ready, initialRoute };
}
