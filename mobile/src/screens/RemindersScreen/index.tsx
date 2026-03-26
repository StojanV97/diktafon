import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  RefreshControl,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Portal,
  Snackbar,
  Text,
} from "react-native-paper";
import { useRecorder } from "../../../hooks/useRecorder";
import { processReminderRecording } from "../../../services/reminderPipelineService";
import {
  requestPermissions,
  scheduleReminderNotification,
  cancelNotification,
} from "../../../services/notificationService";
import {
  createReminder,
  updateReminder,
  deleteReminder,
  markReminderDone,
} from "../../services/storage";
import RecordingOverlay from "../../../components/RecordingOverlay";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import DeleteConfirmDialog from "../../../components/DeleteConfirmDialog";
import { safeErrorMessage } from "../../../utils/errorHelpers";
import { colors, spacing, elevation, typography } from "../../../theme";
import { t } from "../../i18n";
import * as FileSystem from "expo-file-system/legacy";

import { useSnackbar } from "../../hooks/useSnackbar";
import { useRemindersData } from "./useRemindersData";
import ReminderCard from "./ReminderCard";
import ReminderConfirmSheet from "./ReminderConfirmSheet";
import type { Reminder, Recurrence, ParsedReminderResult } from "../../types/reminder";

type PipelineState = "idle" | "recording" | "transcribing" | "parsing" | "confirming";

const OFFSET_MINUTES = 0;

export default function RemindersScreen({ navigation, route }: any) {
  const { snackbar, setSnackbar, dismissSnackbar } = useSnackbar();
  const {
    loading,
    refreshing,
    onRefresh,
    load,
    pendingReminders,
    doneReminders,
    setReminders,
  } = useRemindersData(setSnackbar);

  // --- Pipeline state ---
  const [pipelineState, setPipelineState] = useState<PipelineState>("idle");
  const [pipelineResult, setPipelineResult] = useState<{
    transcript: string;
    parsed: ParsedReminderResult;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // --- Accept pending result from Home screen ---
  useEffect(() => {
    const pending = route.params?.pendingResult;
    if (pending) {
      setPipelineResult(pending);
      setPipelineState("confirming");
      // Clear param so it doesn't re-trigger on back navigation
      navigation.setParams({ pendingResult: undefined });
    }
  }, [route.params?.pendingResult, navigation]);

  // --- Recording ---
  const {
    isRecording,
    isPaused,
    elapsed,
    meteringHistory,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
  } = useRecorder({
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
        setSnackbar(safeErrorMessage(e, t("reminders.parseFailed")));
      } finally {
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch {}
      }
    },
  });

  const isActiveSession = isRecording || isPaused;
  const isProcessing = pipelineState === "transcribing" || pipelineState === "parsing";

  // --- Navigation focus ---
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

  // --- Recording handlers ---
  const handleStartRecording = useCallback(async () => {
    try {
      setPipelineState("recording");
      await startRecording();
    } catch (e) {
      setPipelineState("idle");
      setSnackbar(safeErrorMessage(e));
    }
  }, [startRecording, setSnackbar]);

  const handleStop = useCallback(async () => {
    try {
      await stopRecording();
      // pipelineState transitions handled in onRecordingComplete
    } catch (e) {
      setPipelineState("idle");
      setSnackbar(safeErrorMessage(e, t("recording.stopFailed")));
    }
  }, [stopRecording, setSnackbar]);

  const handleCancel = useCallback(async () => {
    try {
      await cancelRecording();
      setPipelineState("idle");
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    }
  }, [cancelRecording, setSnackbar]);

  // --- Confirm reminder ---
  const handleConfirm = useCallback(
    async (action: string, datetime: string, recurrence: Recurrence | null) => {
      setSaving(true);
      try {
        const hasPermission = await requestPermissions();
        if (!hasPermission) {
          setSnackbar(t("reminders.permissionRequired"));
          setSaving(false);
          return;
        }

        const reminderTime = new Date(datetime);
        const notificationTime = new Date(
          reminderTime.getTime() - OFFSET_MINUTES * 60 * 1000
        );
        const finalNotificationTime =
          notificationTime.getTime() > Date.now()
            ? notificationTime.toISOString()
            : new Date(Date.now() + 5000).toISOString();

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
        setSnackbar(t("reminders.saved"));
        load();
      } catch (e: any) {
        setSnackbar(safeErrorMessage(e, t("errors.generic")));
      } finally {
        setSaving(false);
      }
    },
    [pipelineResult, load, setSnackbar]
  );

  const handleCancelConfirm = useCallback(() => {
    setPipelineState("idle");
    setPipelineResult(null);
  }, []);

  // --- Menu ---
  const [menuVisible, setMenuVisible] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenuVisible(null), []);

  // --- Mark done ---
  const handleMarkDone = useCallback(
    async (id: string) => {
      setMenuVisible(null);
      try {
        const reminder = pendingReminders.find((r) => r.id === id);
        if (reminder?.notification_id) {
          await cancelNotification(reminder.notification_id);
        }
        await markReminderDone(id);
        setSnackbar(t("reminders.markedDone"));
        load();
      } catch (e) {
        setSnackbar(safeErrorMessage(e));
      }
    },
    [pendingReminders, load, setSnackbar]
  );

  // --- Delete ---
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const onDeletePress = useCallback((id: string) => {
    setMenuVisible(null);
    setDeleteTargetId(id);
    setDeleteDialogVisible(true);
  }, []);

  const onDeleteConfirm = useCallback(async () => {
    if (!deleteTargetId || deleteLoading) return;
    setDeleteLoading(true);
    try {
      const allReminders = [...pendingReminders, ...doneReminders];
      const reminder = allReminders.find((r) => r.id === deleteTargetId);
      if (reminder?.notification_id) {
        await cancelNotification(reminder.notification_id);
      }
      await deleteReminder(deleteTargetId);
      setSnackbar(t("reminders.deleted"));
      load();
    } catch (e) {
      setSnackbar(safeErrorMessage(e, t("errors.deleteFailed")));
    } finally {
      setDeleteLoading(false);
      setDeleteDialogVisible(false);
      setDeleteTargetId(null);
    }
  }, [deleteTargetId, deleteLoading, pendingReminders, doneReminders, load, setSnackbar]);

  // --- Sections ---
  const sections = [];
  if (pendingReminders.length > 0) {
    sections.push({ title: t("reminders.active"), data: pendingReminders });
  }
  if (doneReminders.length > 0) {
    sections.push({ title: t("reminders.completed"), data: doneReminders });
  }

  const renderItem = useCallback(
    ({ item }: { item: Reminder }) => (
      <ReminderCard
        item={item}
        isMenuOpen={menuVisible === item.id}
        onMenuOpen={setMenuVisible}
        onMenuClose={closeMenu}
        onMarkDone={handleMarkDone}
        onDelete={onDeletePress}
      />
    ),
    [menuVisible, closeMenu, handleMarkDone, onDeletePress]
  );

  const renderSectionHeader = useCallback(
    ({ section }: any) => (
      <Text style={styles.sectionHeader}>{section.title}</Text>
    ),
    []
  );

  const processingLabel =
    pipelineState === "transcribing"
      ? t("reminders.transcribing")
      : pipelineState === "parsing"
      ? t("reminders.parsing")
      : t("reminders.processing");

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Processing overlay */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.processingText}>{processingLabel}</Text>
        </View>
      )}

      {/* Main list */}
      {sections.length === 0 && !isActiveSession && !isProcessing ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>{t("reminders.noReminders")}</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Recording overlay */}
      {isActiveSession && (
        <RecordingOverlay
          meteringHistory={meteringHistory}
          elapsed={elapsed}
          isPaused={isPaused}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onStop={handleStop}
          onCancel={handleCancel}
        />
      )}

      {/* Record reminder FAB */}
      {!isActiveSession && !isProcessing && pipelineState !== "confirming" && (
        <TouchableOpacity
          style={[styles.fab, elevation.md]}
          onPress={handleStartRecording}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="microphone" size={24} color={colors.surface} />
        </TouchableOpacity>
      )}

      {/* Confirmation sheet */}
      {pipelineState === "confirming" && pipelineResult && (
        <ReminderConfirmSheet
          visible
          parsed={pipelineResult.parsed}
          onConfirm={handleConfirm}
          onCancel={handleCancelConfirm}
          saving={saving}
        />
      )}

      {/* Delete dialog */}
      <Portal>
        <DeleteConfirmDialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
          onConfirm={onDeleteConfirm}
          title={t("reminders.deleteConfirmTitle")}
          message={t("reminders.deleteConfirmMessage")}
          confirmLabel={undefined}
          loading={deleteLoading}
        />
      </Portal>

      {/* Snackbar */}
      <Snackbar
        visible={!!snackbar}
        onDismiss={dismissSnackbar}
        duration={3000}
        style={styles.snackbar}
      >
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.muted,
    textAlign: "center",
  },
  list: {
    padding: spacing.md,
    paddingBottom: 100,
  },
  sectionHeader: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 11,
    color: colors.muted,
    textTransform: "uppercase",
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  processingText: {
    ...typography.body,
    color: colors.muted,
    marginTop: spacing.md,
  },
  snackbar: {
    marginBottom: 80,
  },
  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
