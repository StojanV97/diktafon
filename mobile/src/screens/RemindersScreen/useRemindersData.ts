import { useCallback, useMemo, useState } from "react";
import { fetchReminders, markExpiredAsNotified } from "../../services/storage";
import type { Reminder } from "../../types/reminder";

export function useRemindersData(setSnackbar: (msg: string) => void) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      await markExpiredAsNotified();
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

  const notDone = (r: Reminder) => r.status !== "done";
  const byTime = (a: Reminder, b: Reminder) => a.reminder_time.localeCompare(b.reminder_time);

  const onceReminders = useMemo(
    () => reminders.filter((r) => notDone(r) && !r.recurrence).sort(byTime),
    [reminders]
  );

  const dailyReminders = useMemo(
    () => reminders.filter((r) => notDone(r) && r.recurrence?.type === "daily").sort(byTime),
    [reminders]
  );

  const weeklyReminders = useMemo(
    () => reminders.filter((r) => notDone(r) && r.recurrence?.type === "weekly").sort(byTime),
    [reminders]
  );

  const monthlyReminders = useMemo(
    () => reminders.filter((r) => notDone(r) && r.recurrence?.type === "monthly").sort(byTime),
    [reminders]
  );

  const historyReminders = useMemo(
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
    onceReminders,
    dailyReminders,
    weeklyReminders,
    monthlyReminders,
    historyReminders,
  };
}
