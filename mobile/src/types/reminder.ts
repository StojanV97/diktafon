export type ReminderStatus = "pending" | "done" | "snoozed";

export type RecurrenceType = "daily" | "weekly" | "monthly";

export interface Recurrence {
  type: RecurrenceType;
  days_of_week?: number[]; // 0=Sunday..6=Saturday, for weekly
}

export interface Reminder {
  id: string;
  action: string;
  raw_transcript: string;
  reminder_time: string; // ISO datetime
  notification_time: string; // 10min before reminder_time
  recurrence: Recurrence | null;
  status: ReminderStatus;
  notification_id: string | null;
  snooze_count: number;
  created_at: string;
  updated_at: string;
}

export interface ParsedReminderResult {
  action: string;
  datetime: string | null;
  recurrence: Recurrence | null;
}
