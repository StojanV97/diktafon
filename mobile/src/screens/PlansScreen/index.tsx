import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
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
import { colors, spacing, typography } from "../../../theme";
import { t } from "../../i18n";

import { useSnackbar } from "../../hooks/useSnackbar";
import { usePlansData } from "./usePlansData";
import PlanCard from "./PlanCard";
import DatePickerDialog from "./DatePickerDialog";
import { recordingTrigger } from "../../utils/recordingTrigger";

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

  const { isRecording, isPaused, isSessionActive, elapsed, meteringHistory, startRecording, pauseRecording, resumeRecording, stopRecording, cancelRecording } = useRecorder({
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

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      recordingTrigger.current = isActiveSession ? null : handleRecordPress;
    });
    return unsub;
  }, [navigation, handleRecordPress, isActiveSession]);

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

  const keyExtractor = useCallback((item: any) => item.id, []);
  const renderPlanItem = useCallback(
    ({ item }: any) => <PlanCard plan={item} onEdit={editPlan} onDelete={handleDelete} />,
    [editPlan, handleDelete]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteTarget) {
      await removePlan(deleteTarget);
      setDeleteTarget(null);
    }
  }, [deleteTarget, removePlan]);

  const isProcessing = pipelineState === "transcribing" || pipelineState === "extracting";
  const isActiveSession = isSessionActive || isProcessing;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isSessionActive ? (
        <RecordingView
          saveLabel={t("tabs.plans")}
          title={t("recording.newPlan")}
          elapsed={elapsed}
          isPaused={isPaused}
          meteringHistory={meteringHistory}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onStop={stopRecording}
          onCancel={cancelRecording}
          onSettings={() => navigation.navigate("Settings")}
        />
      ) : (
        <>
          <FlatList
            data={plans}
            keyExtractor={keyExtractor}
            renderItem={renderPlanItem}
            ListHeaderComponent={<ScreenHeader title={t("tabs.plans")} />}
            contentContainerStyle={plans.length === 0 ? styles.listGrow : styles.list}
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
  listGrow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
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
