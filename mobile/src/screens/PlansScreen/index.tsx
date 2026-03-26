import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
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
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRecorder } from "../../../hooks/useRecorder";
import { extractPlan } from "../../../services/planExtractionService";
import { isPremium } from "../../../services/subscriptionService";
import { hasDevKey } from "../../../services/cloudTranscriptionService";
import RecordingView from "../../../components/RecordingView";
import ScreenHeader from "../../components/ScreenHeader";
import DeleteConfirmDialog from "../../../components/DeleteConfirmDialog";
import * as Haptics from "expo-haptics";
import { safeErrorMessage } from "../../../utils/errorHelpers";
import { colors, spacing, elevation, typography } from "../../../theme";
import { t } from "../../i18n";

import { useSnackbar } from "../../hooks/useSnackbar";
import { usePlansData } from "./usePlansData";
import PlanCard from "./PlanCard";
import DatePickerDialog from "./DatePickerDialog";

type PipelineState = "idle" | "recording" | "transcribing" | "extracting";

export default function PlansScreen({ navigation }: any) {
  const { snackbar, setSnackbar, dismissSnackbar } = useSnackbar();
  const { plans, loading, load, addPlan, editPlan, removePlan } = usePlansData(setSnackbar);

  const [pipelineState, setPipelineState] = useState<PipelineState>("idle");
  const [pendingItems, setPendingItems] = useState<string[] | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    const unsub = navigation.addListener("focus", load);
    return unsub;
  }, [navigation, load]);

  const { isRecording, isPaused, elapsed, meteringHistory, startRecording, pauseRecording, resumeRecording, stopRecording } = useRecorder({
    onRecordingComplete: async (uri: string) => {
      try {
        const result = await extractPlan(uri, (state: string) => setPipelineState(state as PipelineState));
        setPipelineState("idle");

        if (result.date) {
          await addPlan(result.date, result.items);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          setPendingItems(result.items);
          setDatePickerVisible(true);
        }
      } catch (e: any) {
        setPipelineState("idle");
        setSnackbar(safeErrorMessage(e, t("plans.extractionFailed")));
      }
    },
  });

  const handleRecordPress = useCallback(async () => {
    try {
      const premium = await isPremium() || hasDevKey();
      if (!premium) {
        setSnackbar(t("plans.premiumRequired"));
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await startRecording();
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    }
  }, [startRecording, setSnackbar]);

  const handleDateConfirm = useCallback(async (date: string) => {
    setDatePickerVisible(false);
    if (pendingItems && pendingItems.length > 0) {
      await addPlan(date, pendingItems);
    }
    setPendingItems(null);
  }, [pendingItems, addPlan]);

  const handleDateDismiss = useCallback(() => {
    setDatePickerVisible(false);
    setPendingItems(null);
  }, []);

  const handleDelete = useCallback((planId: string) => {
    setDeleteTarget(planId);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteTarget) {
      await removePlan(deleteTarget);
      setDeleteTarget(null);
    }
  }, [deleteTarget, removePlan]);

  const isProcessing = pipelineState === "transcribing" || pipelineState === "extracting";
  const isActiveSession = isRecording || isPaused || isProcessing;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {(isRecording || isPaused) ? (
        <RecordingView
          saveLabel={t("tabs.plans")}
          title={t("recording.newPlan")}
          elapsed={elapsed}
          isPaused={isPaused}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onStop={stopRecording}
          onCancel={stopRecording}
          onSettings={() => navigation.navigate("Settings")}
        />
      ) : (
        <>
          <FlatList
            data={plans}
            keyExtractor={(item: any) => item.id}
            renderItem={({ item }) => (
              <PlanCard plan={item} onEdit={editPlan} onDelete={handleDelete} />
            )}
            ListHeaderComponent={<ScreenHeader title={t("tabs.plans")} />}
            contentContainerStyle={[styles.list, plans.length === 0 && { flexGrow: 1 }]}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={colors.muted} />
                <Text style={[typography.heading, { marginTop: spacing.lg, color: colors.muted }]}>
                  {t("plans.emptyTitle")}
                </Text>
                <Text style={[typography.body, styles.emptyText]}>
                  {t("plans.emptyMessage")}
                </Text>
              </View>
            }
          />

          {!isActiveSession && (
            <TouchableOpacity
              style={[styles.fab, elevation.md]}
              onPress={handleRecordPress}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="microphone" size={24} color={colors.surface} />
            </TouchableOpacity>
          )}
        </>
      )}

      {isProcessing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.processingText}>
            {pipelineState === "transcribing" ? t("plans.transcribing") : t("plans.extracting")}
          </Text>
        </View>
      )}

      <Portal>
        <DatePickerDialog
          visible={datePickerVisible}
          onConfirm={handleDateConfirm}
          onDismiss={handleDateDismiss}
        />
        <DeleteConfirmDialog
          visible={!!deleteTarget}
          onDismiss={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
          title={t("plans.deletePlanTitle")}
          message={t("plans.deletePlanMessage")}
          confirmLabel={undefined}
          loading={false}
        />
      </Portal>

      <Snackbar visible={!!snackbar} onDismiss={dismissSnackbar} duration={3000}>
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xxl,
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    marginTop: spacing.sm,
    lineHeight: 22,
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
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.9)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  processingText: {
    ...typography.body as any,
    color: colors.muted,
    marginTop: spacing.md,
  },
});
