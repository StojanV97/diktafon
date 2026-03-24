import { File } from "expo-file-system";
import {
  journalDir,
  readJSON,
  writeJSON,
  withWriteLock,
  ensureDirs,
  generateUUID,
} from "./storageCore";
import type { Reminder, Recurrence } from "../../types/reminder";

export const remindersFile = new File(journalDir, "reminders.json");

// Local cache (storageCore only caches folders/entries)
let _remindersCache: Reminder[] | null = null;

async function readReminders(): Promise<Reminder[]> {
  if (_remindersCache !== null) return _remindersCache;
  const data = await readJSON(remindersFile);
  _remindersCache = data as Reminder[];
  return _remindersCache;
}

async function writeReminders(data: Reminder[]): Promise<void> {
  await writeJSON(remindersFile, data);
  _remindersCache = data;
}

export async function fetchReminders(): Promise<Reminder[]> {
  return readReminders();
}

export async function fetchReminder(id: string): Promise<Reminder | null> {
  const reminders = await readReminders();
  return reminders.find((r) => r.id === id) || null;
}

export function createReminder(
  data: Omit<Reminder, "id" | "created_at" | "updated_at">
): Promise<Reminder> {
  return withWriteLock(async () => {
    ensureDirs();
    const now = new Date().toISOString();
    const reminder: Reminder = {
      ...data,
      id: generateUUID(),
      created_at: now,
      updated_at: now,
    };
    const reminders = await readReminders();
    reminders.unshift(reminder);
    await writeReminders(reminders);
    return reminder;
  });
}

export function updateReminder(
  id: string,
  patch: Partial<Reminder>
): Promise<Reminder | null> {
  return withWriteLock(async () => {
    const reminders = await readReminders();
    const idx = reminders.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    reminders[idx] = {
      ...reminders[idx],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    await writeReminders(reminders);
    return reminders[idx];
  });
}

export function deleteReminder(id: string): Promise<boolean> {
  return withWriteLock(async () => {
    const reminders = await readReminders();
    const filtered = reminders.filter((r) => r.id !== id);
    if (filtered.length === reminders.length) return false;
    await writeReminders(filtered);
    return true;
  });
}

export function markReminderDone(id: string): Promise<Reminder | null> {
  return updateReminder(id, { status: "done" });
}

export function snoozeReminder(id: string): Promise<Reminder | null> {
  return withWriteLock(async () => {
    const reminders = await readReminders();
    const idx = reminders.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    reminders[idx] = {
      ...reminders[idx],
      status: "snoozed",
      snooze_count: reminders[idx].snooze_count + 1,
      updated_at: new Date().toISOString(),
    };
    await writeReminders(reminders);
    return reminders[idx];
  });
}

export async function getPendingReminders(): Promise<Reminder[]> {
  const reminders = await readReminders();
  return reminders
    .filter((r) => r.status === "pending" || r.status === "snoozed")
    .sort((a, b) => a.reminder_time.localeCompare(b.reminder_time));
}

/**
 * Compute the next occurrence datetime for a recurring reminder.
 * Returns ISO string for the next reminder_time, or null if not recurring.
 */
export function getNextOccurrence(reminder: Reminder): string | null {
  if (!reminder.recurrence) return null;

  const current = new Date(reminder.reminder_time);
  const { type, days_of_week } = reminder.recurrence;

  if (type === "daily") {
    const next = new Date(current);
    next.setDate(next.getDate() + 1);
    return next.toISOString();
  }

  if (type === "weekly" && days_of_week && days_of_week.length > 0) {
    const sorted = [...days_of_week].sort((a, b) => a - b);
    const currentDay = current.getDay();
    // Find next matching day after current
    const nextDay = sorted.find((d) => d > currentDay);
    const next = new Date(current);
    if (nextDay !== undefined) {
      next.setDate(next.getDate() + (nextDay - currentDay));
    } else {
      // Wrap to first day of next week
      next.setDate(next.getDate() + (7 - currentDay + sorted[0]));
    }
    return next.toISOString();
  }

  if (type === "weekly") {
    // No specific days — repeat same day next week
    const next = new Date(current);
    next.setDate(next.getDate() + 7);
    return next.toISOString();
  }

  if (type === "monthly") {
    const next = new Date(current);
    next.setMonth(next.getMonth() + 1);
    // Handle month overflow (e.g., Jan 31 -> Feb 28)
    if (next.getDate() !== current.getDate()) {
      next.setDate(0); // Last day of previous month
    }
    return next.toISOString();
  }

  return null;
}
