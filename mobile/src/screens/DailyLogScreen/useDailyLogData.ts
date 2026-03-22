import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";
import {
  fetchDailyLogEntries,
  getDailyCombinedTranscripts,
  consolidateDailyLogEntries,
} from "../../../services/journalStorage";
import { syncWidgetData } from "../../../services/widgetDataService";
import { groupByDate } from "../../../utils/entryUtils";
import { safeErrorMessage } from "../../../utils/errorHelpers";
import { t } from "../../i18n";

export function useDailyLogData(setSnackbar: (msg: string) => void) {
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [combinedTexts, setCombinedTexts] = useState<Record<string, string>>({});
  const [batchEntryIds, setBatchEntryIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await fetchDailyLogEntries();
      setEntries(data);
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setSnackbar]);

  const grouped = useMemo(() => groupByDate(entries), [entries]);

  // Load combined transcripts for dates where at least one entry is done
  useEffect(() => {
    let ignore = false;
    const datesWithDone = grouped
      .filter(({ data }) => data.some((e: any) => e.status === "done"))
      .map(({ date }) => date);

    if (datesWithDone.length === 0) {
      setCombinedTexts({});
      return;
    }

    getDailyCombinedTranscripts(datesWithDone)
      .then((results: any) => { if (!ignore) setCombinedTexts(results); })
      .catch((e: any) => { if (!ignore) setSnackbar(safeErrorMessage(e, t("dailyLog.transcriptLoadFailed"))); });
    return () => { ignore = true; };
  }, [grouped, setSnackbar]);

  const consolidateAndReload = useCallback(async (dates: string[]) => {
    for (const date of dates) {
      await consolidateDailyLogEntries(date);
    }
    const data = await fetchDailyLogEntries();
    if (mountedRef.current) setEntries(data);
    syncWidgetData().catch(() => {});
  }, [setEntries]);

  // After AssemblyAI polling resolves all batch entries, consolidate
  useEffect(() => {
    if (batchEntryIds.size === 0) return;
    const batchEntries = entries.filter((e) => batchEntryIds.has(e.id));
    const allResolved = batchEntries.every(
      (e) => e.status === "done" || e.status === "error"
    );
    if (!allResolved) return;

    const dates = [...new Set(
      batchEntries
        .filter((e) => e.status === "done")
        .map((e) => e.recorded_date || e.created_at.slice(0, 10))
    )];
    setBatchEntryIds(new Set());
    if (dates.length > 0) consolidateAndReload(dates);
  }, [entries, batchEntryIds, consolidateAndReload]);

  // Re-fetch entries when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => subscription.remove();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  return {
    entries,
    setEntries,
    loading,
    refreshing,
    onRefresh,
    grouped,
    combinedTexts,
    batchEntryIds,
    setBatchEntryIds,
    load,
    consolidateAndReload,
  };
}
