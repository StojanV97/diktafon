import { useState } from "react";
import { useRecorder } from "../../hooks/useRecorder";
import { processReminderRecording } from "../../services/reminderPipelineService";
import {
  requestPermissions,
  scheduleReminderNotification,
  cancelNotification,
} from "../../services/notificationService";
import {
  createReminder,
  updateReminder,
} from "../services/storage";
import { t } from "../i18n";
import type { Recurrence, ParsedReminderResult, Reminder } from "../types/reminder";
import { File } from "expo-file-system";

export type PipelineState =
  | "idle"
  | "recording"
  | "transcribing"
  | "parsing"
  | "confirming";

const OFFSET_MINUTES = 10;

export function useReminderRecorder({
  onReminderSaved,
  onError,
}: {
  onReminderSaved?: (reminder: Reminder) => void;
  onError?: (e: Error) => void;
}) {
  const [pipelineState, setPipelineState] = useState<PipelineState>("idle");
  const [pipelineResult, setPipelineResult] = useState<{
    transcript: string;
    parsed: ParsedReminderResult;
  } | null>(null);

  const recorder = useRecorder({
    onRecordingComplete: async (uri: string, _durationSeconds: number) => {
      try {
        const result = await processReminderRecording(
          uri,
          (state: string) => setPipelineState(state as PipelineState)
        );
        setPipelineResult(result);
        setPipelineState("confirming");
      } catch (e: any) {
        setPipelineState("idle");
        onError?.(e);
      } finally {
        // Delete audio file — not saved for reminders
        try {
          const audioFile = new File(uri);
          if (audioFile.exists) audioFile.delete();
        } catch {
          // ignore cleanup errors
        }
      }
    },
  });

  const confirmReminder = async (
    action: string,
    datetime: string,
    recurrence: Recurrence | null
  ): Promise<Reminder> => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) {
      throw new Error(t("reminders.permissionRequired"));
    }

    const reminderTime = new Date(datetime);
    const notificationTime = new Date(
      reminderTime.getTime() - OFFSET_MINUTES * 60 * 1000
    );

    // If notification time is in the past, fire immediately
    const finalNotificationTime =
      notificationTime.getTime() > Date.now()
        ? notificationTime.toISOString()
        : new Date(Date.now() + 5000).toISOString(); // 5s from now

    const reminder = await createReminder({
      action,
      raw_transcript: pipelineResult?.transcript || "",
      reminder_time: reminderTime.toISOString(),
      notification_time: finalNotificationTime,
      recurrence,
      status: "pending",
      notification_id: null,
      snooze_count: 0,
    });

    const notificationId = await scheduleReminderNotification({
      ...reminder,
      notification_time: finalNotificationTime,
    });
    await updateReminder(reminder.id, { notification_id: notificationId });

    setPipelineState("idle");
    setPipelineResult(null);
    onReminderSaved?.({ ...reminder, notification_id: notificationId });

    return reminder;
  };

  const cancelPipeline = () => {
    setPipelineState("idle");
    setPipelineResult(null);
  };

  return {
    ...recorder,
    pipelineState,
    setPipelineState,
    pipelineResult,
    confirmReminder,
    cancelPipeline,
  };
}
