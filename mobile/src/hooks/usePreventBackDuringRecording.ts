import { useEffect } from "react";
import { Alert } from "react-native";
import { t } from "../i18n";

export function usePreventBackDuringRecording(
  navigation: any,
  isRecording: boolean,
  isPaused: boolean,
  cancelRecording: () => Promise<void>
) {
  useEffect(() => {
    if (!isRecording && !isPaused) return;
    const unsub = navigation.addListener("beforeRemove", (e: any) => {
      e.preventDefault();
      Alert.alert(
        t("recording.activeAlertTitle"),
        t("recording.activeAlertMessage"),
        [
          { text: t("recording.continueRecording"), style: "cancel" },
          {
            text: t("recording.cancelAndLeave"),
            style: "destructive",
            onPress: () => {
              cancelRecording().catch(() => {});
              navigation.dispatch(e.data.action);
            },
          },
        ]
      );
    });
    return unsub;
  }, [navigation, isRecording, isPaused, cancelRecording]);
}
