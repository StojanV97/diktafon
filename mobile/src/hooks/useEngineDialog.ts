import { useState, useCallback } from "react";
import { getSettings } from "../../services/settingsService";

export function useEngineDialog() {
  const [engineDialogVisible, setEngineDialogVisible] = useState(false);
  const [engineChoice, setEngineChoice] = useState("local");
  const [engineTargetId, setEngineTargetId] = useState<string | null>(null);
  const [batchDate, setBatchDate] = useState<string | null>(null);

  const openForEntry = useCallback(async (entryId: string) => {
    setEngineTargetId(entryId);
    setBatchDate(null);
    try {
      const { defaultEngine } = (await getSettings()) as any;
      setEngineChoice(defaultEngine);
    } catch {
      setEngineChoice("local");
    }
    setEngineDialogVisible(true);
  }, []);

  const openForBatch = useCallback(async (date: string | null = null) => {
    setBatchDate(date);
    setEngineTargetId(null);
    try {
      const { defaultEngine } = (await getSettings()) as any;
      setEngineChoice(defaultEngine);
    } catch {
      setEngineChoice("local");
    }
    setEngineDialogVisible(true);
  }, []);

  const closeDialog = useCallback(() => {
    setEngineDialogVisible(false);
  }, []);

  return {
    engineDialogVisible,
    engineChoice,
    setEngineChoice,
    engineTargetId,
    batchDate,
    openForEntry,
    openForBatch,
    closeDialog,
  };
}
