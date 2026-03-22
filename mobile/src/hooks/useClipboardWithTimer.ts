import { useRef, useEffect, useCallback } from "react";
import * as ExpoClipboard from "expo-clipboard";
import { t } from "../i18n";

const CLEAR_DELAY = 20000;

export function useClipboardWithTimer(setSnackbar: (msg: string) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const copyWithTimer = useCallback((text: string) => {
    if (!text) return;
    ExpoClipboard.setStringAsync(text);
    setSnackbar(t("dailyLog.copiedClipboard"));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => ExpoClipboard.setStringAsync(""), CLEAR_DELAY);
  }, [setSnackbar]);

  return copyWithTimer;
}
