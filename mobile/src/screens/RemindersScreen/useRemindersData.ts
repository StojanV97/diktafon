import { useCallback, useMemo, useState } from "react";
import { fetchReminders } from "../../services/storage";
import type { Reminder } from "../../types/reminder";

export function useRemindersData(setSnackbar: (msg: string) => void) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchReminders();
      setReminders(data);
    } catch (e: any) {
      setSnackbar(e?.message || "Error loading reminders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setSnackbar]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const pendingReminders = useMemo(
    () =>
      reminders
        .filter((r) => r.status === "pending" || r.status === "snoozed")
        .sort((a, b) => a.reminder_time.localeCompare(b.reminder_time)),
    [reminders]
  );

  const doneReminders = useMemo(
    () =>
      reminders
        .filter((r) => r.status === "done")
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [reminders]
  );

  return {
    reminders,
    setReminders,
    loading,
    refreshing,
    onRefresh,
    load,
    pendingReminders,
    doneReminders,
  };
}
