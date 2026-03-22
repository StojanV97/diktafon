import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { releaseContext } from "../../services/whisperService";
import { clearCachedKey } from "../../services/cryptoService";
import { cleanupDecryptedAudio } from "../../services/journalStorage";
import {
  isBiometricLockEnabled,
  authenticateWithBiometrics,
} from "../../services/biometricService";
import { runAutoMove } from "../../services/autoMoveService";
import { getPendingAction } from "../../services/widgetDataService";

export function useBiometricLock(navigationRef: any) {
  const [locked, setLocked] = useState(false);

  const checkPendingControlAction = useCallback(async () => {
    try {
      const action = await getPendingAction();
      if (action === "record" && navigationRef.current) {
        navigationRef.current.navigate("DailyLog", { action: "record" });
      }
    } catch {}
  }, [navigationRef]);

  const unlock = useCallback(async () => {
    const success = await authenticateWithBiometrics();
    if (success) setLocked(false);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (state) => {
      if (state === "background") {
        releaseContext();
        clearCachedKey();
        cleanupDecryptedAudio();
        const bioEnabled = await isBiometricLockEnabled();
        if (bioEnabled) setLocked(true);
      } else if (state === "active") {
        runAutoMove();
        if (locked) {
          const success = await authenticateWithBiometrics();
          if (success) setLocked(false);
        } else {
          checkPendingControlAction();
        }
      }
    });
    return () => subscription.remove();
  }, [locked, checkPendingControlAction]);

  return { locked, unlock, checkPendingControlAction };
}
