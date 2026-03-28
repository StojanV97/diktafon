import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  SectionList,
  RefreshControl,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Menu,
  Portal,
  Snackbar,
  Text,
} from "react-native-paper";
import {
  fetchFolders,
  moveEntryToFolder,
  createDailyLogEntry,
  deleteEntry,
  tombstoneEntry,
  deleteEntryWithICloud,
} from "../../../services/journalStorage";
import { isSyncEnabled } from "../../../services/icloudSyncService";
import { useRecorder } from "../../../hooks/useRecorder";
import { useTranscription } from "../../../hooks/useTranscription";
import RecordingView from "../../../components/RecordingView";
import ScreenHeader from "../../components/ScreenHeader";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import AIInsightsDialog from "../../../components/AIInsightsDialog";
import EngineChoiceDialog from "../../../components/EngineChoiceDialog";
import ModelDownloadDialog from "../../../components/ModelDownloadDialog";
import DeleteConfirmDialog from "../../../components/DeleteConfirmDialog";
import * as Haptics from "expo-haptics";
import { safeErrorMessage } from "../../../utils/errorHelpers";
import { syncWidgetData } from "../../../services/widgetDataService";
import { formatSectionDate } from "../../utils/formatters";
import { colors, spacing, typography } from "../../../theme";
import { t } from "../../i18n";

import { useSnackbar } from "../../hooks/useSnackbar";
import { useEngineDialog } from "../../hooks/useEngineDialog";
import { usePreventBackDuringRecording } from "../../hooks/usePreventBackDuringRecording";
import MicFAB from "../../components/MicFAB";
import { useClipboardWithTimer } from "../../hooks/useClipboardWithTimer";
import { useDailyLogData } from "./useDailyLogData";
import DailyLogEntryCard from "./DailyLogEntryCard";
import DailySectionHeader from "./DailySectionHeader";
import DailySectionFooter from "./DailySectionFooter";
import MoveToFolderDialog from "./MoveToFolderDialog";

export default function DailyLogScreen({ navigation, route }: any) {
  const { snackbar, setSnackbar, dismissSnackbar } = useSnackbar();

  const {
    entries,
    setEntries,
    loading,
    refreshing,
    onRefresh,
    grouped,
    combinedTexts,
    setBatchEntryIds,
    load,
    consolidateAndReload,
  } = useDailyLogData(setSnackbar);

  const {
    engineDialogVisible,
    engineChoice,
    setEngineChoice,
    engineTargetId,
    batchDate,
    openForEntry,
    openForBatch,
    closeDialog: closeEngineDialog,
  } = useEngineDialog();

  const copyWithTimer = useClipboardWithTimer(setSnackbar);

  // --- Recording ---
  const { isRecording, isPaused, isSessionActive, elapsed, meteringHistory, startRecording, pauseRecording, resumeRecording, stopRecording, cancelRecording } = useRecorder({
    onRecordingComplete: async (uri: string, durationSeconds: number) => {
      try {
        const entry = await createDailyLogEntry(uri, durationSeconds);
        setEntries((prev: any[]) => [entry, ...prev]);
        syncWidgetData();
      } catch (e) {
        setSnackbar(safeErrorMessage(e, t("errors.saveFailed")));
      }
    },
  });

  usePreventBackDuringRecording(navigation, isRecording, isPaused, cancelRecording);

  const { startTranscription, startBatchTranscription, modelDownload } = useTranscription({
    entries,
    setEntries,
    onComplete: syncWidgetData,
  });

  // --- Navigation focus ---
  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

  // --- Header ---
  const [aiDialogVisible, setAiDialogVisible] = useState(false);

  const [headerMenuVisible, setHeaderMenuVisible] = useState(false);
  const hasRecordedEntries = entries.some((e: any) => e.status === "recorded" || e.status === "error");

  const headerRightElement = useMemo(
    () => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Menu
          visible={headerMenuVisible}
          onDismiss={() => setHeaderMenuVisible(false)}
          anchor={
            <TouchableOpacity onPress={() => setHeaderMenuVisible(true)} style={{ padding: 8 }}>
              <MaterialCommunityIcons name="dots-vertical" size={20} color={colors.foreground} />
            </TouchableOpacity>
          }
        >
          <Menu.Item
            leadingIcon="text-recognition"
            onPress={() => { setHeaderMenuVisible(false); openForBatch(null); }}
            title={t("dailyLog.allToText")}
            disabled={!hasRecordedEntries}
          />
          <Menu.Item
            leadingIcon="delete-sweep-outline"
            onPress={() => { setHeaderMenuVisible(false); if (entries.length > 0) setDeleteAllDialogVisible(true); }}
            title={t("dailyLog.deleteAll")}
            disabled={entries.length === 0}
          />
        </Menu>
      </View>
    ),
    [headerMenuVisible, hasRecordedEntries, entries.length, openForBatch]
  );

  // --- Auto-record via deep link ---
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);
  isRecordingRef.current = isRecording;
  isPausedRef.current = isPaused;

  const autoRecordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (route.params?.action === "record") {
      autoRecordTimerRef.current = setTimeout(() => {
        navigation.setParams({ action: undefined });
        if (isRecordingRef.current || isPausedRef.current) {
          handleStop();
        } else {
          handleStartRecording();
        }
      }, 500);
    }
    return () => {
      if (autoRecordTimerRef.current) clearTimeout(autoRecordTimerRef.current);
    };
  }, [route.params?.action]);

  // --- Section collapse ---
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const toggleSection = useCallback((date: string) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  // --- Expanded transcripts ---
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set());
  const toggleTranscriptExpanded = useCallback((date: string) => {
    setExpandedTranscripts((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  // --- Menu ---
  const [menuVisible, setMenuVisible] = useState<string | null>(null);
  const closeMenu = useCallback(() => setMenuVisible(null), []);

  // --- Delete (single) ---
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filename: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const onDeletePress = useCallback((entryId: string, filename: string) => {
    setMenuVisible(null);
    setDeleteTarget({ id: entryId, filename });
    setDeleteDialogVisible(true);
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev: any[]) => prev.filter((e: any) => e.id !== id));
    syncWidgetData();
  }, [setEntries]);

  const onDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    try {
      const syncOn = await isSyncEnabled();
      if (syncOn) {
        setDeleteDialogVisible(false);
        Alert.alert(
          t("deleteDialog.icloudTitle"),
          t("deleteDialog.message"),
          [
            {
              text: t("deleteDialog.localOnly"),
              onPress: async () => {
                try {
                  await tombstoneEntry(deleteTarget.id);
                  removeEntry(deleteTarget.id);
                } catch (e) {
                  setSnackbar(safeErrorMessage(e, t("errors.deleteFailed")));
                }
                setDeleteLoading(false);
                setDeleteTarget(null);
              },
            },
            {
              text: t("deleteDialog.everywhere"),
              style: "destructive",
              onPress: async () => {
                try {
                  await deleteEntryWithICloud(deleteTarget.id);
                  removeEntry(deleteTarget.id);
                } catch (e) {
                  setSnackbar(safeErrorMessage(e, t("errors.deleteFailed")));
                }
                setDeleteLoading(false);
                setDeleteTarget(null);
              },
            },
          ]
        );
        return;
      }
      await deleteEntry(deleteTarget.id);
      removeEntry(deleteTarget.id);
    } catch (e) {
      setSnackbar(safeErrorMessage(e, t("errors.deleteFailed")));
    } finally {
      setDeleteLoading(false);
    }
    setDeleteDialogVisible(false);
    setDeleteTarget(null);
  }, [deleteTarget, deleteLoading, setSnackbar, removeEntry]);

  // --- Delete all ---
  const [deleteAllDialogVisible, setDeleteAllDialogVisible] = useState(false);

  const onDeleteAllConfirm = useCallback(async () => {
    setDeleteAllDialogVisible(false);
    const total = entries.length;
    const syncOn = await isSyncEnabled();
    if (syncOn) {
      Alert.alert(
        t("deleteDialog.icloudTitle"),
        t("deleteDialog.icloudAllMessage", { total }),
        [
          {
            text: t("deleteDialog.localOnly"),
            onPress: async () => {
              const results = await Promise.allSettled(
                entries.map((entry: any) => tombstoneEntry(entry.id))
              );
              const failures = results.filter((r) => r.status === "rejected").length;
              await load();
              syncWidgetData();
              if (failures > 0) setSnackbar(t("dailyLog.partialDeleteFailed", { failures, total }));
              else setSnackbar(t("dailyLog.deletedCount", { total }));
            },
          },
          {
            text: t("deleteDialog.everywhere"),
            style: "destructive",
            onPress: async () => {
              const results = await Promise.allSettled(
                entries.map((entry: any) => deleteEntryWithICloud(entry.id))
              );
              const failures = results.filter((r) => r.status === "rejected").length;
              await load();
              syncWidgetData();
              if (failures > 0) setSnackbar(t("dailyLog.partialDeleteFailed", { failures, total }));
              else setSnackbar(t("dailyLog.deletedCount", { total }));
            },
          },
        ]
      );
      return;
    }
    const results = await Promise.allSettled(
      entries.map((entry: any) => deleteEntry(entry.id))
    );
    const failures = results.filter((r) => r.status === "rejected").length;
    await load();
    syncWidgetData();
    if (failures > 0) setSnackbar(t("dailyLog.partialDeleteFailed", { failures, total }));
    else setSnackbar(t("dailyLog.deletedCount", { total }));
  }, [entries, load, setSnackbar]);

  // --- Move to folder ---
  const [moveDialogVisible, setMoveDialogVisible] = useState(false);
  const [moveTargetEntryId, setMoveTargetEntryId] = useState<string | null>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [regularFolders, setRegularFolders] = useState<any[]>([]);

  const onMovePress = useCallback(async (entryId: string) => {
    setMenuVisible(null);
    try {
      const allFolders = await fetchFolders();
      setRegularFolders(allFolders.filter((f: any) => !f.is_daily_log));
      setMoveTargetEntryId(entryId);
      setMoveDialogVisible(true);
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    }
  }, [setSnackbar]);

  const onMoveConfirm = useCallback(async (folderId: string, folderName: string) => {
    if (moveLoading) return;
    setMoveLoading(true);
    try {
      await moveEntryToFolder(moveTargetEntryId!, folderId);
      setEntries((prev: any[]) => prev.filter((e: any) => e.id !== moveTargetEntryId));
      setSnackbar(t("dailyLog.movedToFolder", { folderName }));
      setMoveDialogVisible(false);
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    } finally {
      setMoveLoading(false);
      setMoveTargetEntryId(null);
    }
  }, [moveLoading, moveTargetEntryId, setEntries, setSnackbar]);

  // --- Transcription confirm ---
  const onTranscribeConfirm = useCallback(async () => {
    closeEngineDialog();
    let result: any;
    let batchTotal = 0;
    if (!engineTargetId) {
      const toTranscribe = batchDate
        ? entries.filter(
            (e: any) => (e.recorded_date || e.created_at.slice(0, 10)) === batchDate && (e.status === "recorded" || e.status === "error")
          )
        : entries.filter((e: any) => e.status === "recorded" || e.status === "error");
      const ids = toTranscribe.map((e: any) => e.id);
      batchTotal = ids.length;
      const dates = [...new Set(toTranscribe.map((e: any) => e.recorded_date || e.created_at.slice(0, 10)))];

      if (engineChoice === "cloud") {
        setBatchEntryIds(new Set(ids));
      }

      result = await startBatchTranscription(ids, engineChoice);

      if (result.started && engineChoice === "local") {
        await consolidateAndReload(dates);
      }
    } else {
      result = await startTranscription(engineTargetId, engineChoice);
    }
    if (!result.started) setSnackbar(result.message);
    else if (result.errors?.length > 0) setSnackbar(t("dailyLog.batchPartialFailed", { errors: result.errors.length, total: batchTotal }));
    else if (result.error) setSnackbar(result.error);
  }, [engineTargetId, batchDate, engineChoice, entries, startTranscription, startBatchTranscription, setBatchEntryIds, consolidateAndReload, closeEngineDialog, setSnackbar]);

  // --- Recording handlers ---
  const handleStartRecording = useCallback(async () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); await startRecording(); } catch (e) { setSnackbar(safeErrorMessage(e)); }
  }, [startRecording, setSnackbar]);

  const handlePause = useCallback(async () => {
    try { await pauseRecording(); } catch (e) { setSnackbar(safeErrorMessage(e, t("recording.pauseFailed"))); }
  }, [pauseRecording, setSnackbar]);

  const handleResume = useCallback(async () => {
    try { await resumeRecording(); } catch (e) { setSnackbar(safeErrorMessage(e, t("recording.resumeFailed"))); }
  }, [resumeRecording, setSnackbar]);

  const handleStop = useCallback(async () => {
    try { await stopRecording(); } catch (e) { setSnackbar(safeErrorMessage(e, t("recording.stopFailed"))); }
  }, [stopRecording, setSnackbar]);

  const handleCancel = useCallback(async () => {
    try { await cancelRecording(); } catch (e) { setSnackbar(safeErrorMessage(e, t("recording.cancelFailed"))); }
  }, [cancelRecording, setSnackbar]);

  // --- Engine dialog triggers ---
  const openSingleEngineDialog = useCallback((entryId: string) => {
    setMenuVisible(null);
    openForEntry(entryId);
  }, [openForEntry]);

  // --- Combined transcript actions ---
  const copyCombinedText = useCallback((date: string) => {
    const text = combinedTexts[date];
    if (text) copyWithTimer(text);
  }, [combinedTexts, copyWithTimer]);

  const shareCombinedText = useCallback(async (date: string) => {
    const text = combinedTexts[date];
    if (!text) return;
    try {
      await Share.share({ message: text, title: t("dailyLog.shareTitle", { date: formatSectionDate(date) }) });
    } catch {
      // user dismissed
    }
  }, [combinedTexts]);

  // --- Sections ---
  const sections = useMemo(() =>
    grouped.map(({ date, data }: any) => ({
      date,
      allData: data,
      data: collapsedDates.has(date) ? [] : data,
    })),
    [grouped, collapsedDates]
  );

  // --- Render callbacks ---
  const renderSectionHeader = useCallback(({ section }: any) => (
    <DailySectionHeader
      date={section.date}
      allData={section.allData}
      isCollapsed={collapsedDates.has(section.date)}
      onToggle={toggleSection}
    />
  ), [collapsedDates, toggleSection]);

  const renderSectionFooter = useCallback(({ section }: any) => (
    <DailySectionFooter
      date={section.date}
      text={combinedTexts[section.date]}
      isCollapsed={collapsedDates.has(section.date)}
      isExpanded={expandedTranscripts.has(section.date)}
      onCopy={copyCombinedText}
      onShare={shareCombinedText}
      onToggleExpand={toggleTranscriptExpanded}
    />
  ), [combinedTexts, collapsedDates, expandedTranscripts, copyCombinedText, shareCombinedText, toggleTranscriptExpanded]);

  const onEntryPress = useCallback((id: string) => {
    navigation.navigate("Entry", { id });
  }, [navigation]);

  const renderItem = useCallback(({ item }: any) => (
    <DailyLogEntryCard
      item={item}
      isMenuOpen={menuVisible === item.id}
      onMenuOpen={setMenuVisible}
      onMenuClose={closeMenu}
      onPress={onEntryPress}
      onTranscribe={openSingleEngineDialog}
      onMove={onMovePress}
      onDelete={onDeletePress}
    />
  ), [menuVisible, closeMenu, onEntryPress, openSingleEngineDialog, onMovePress, onDeletePress]);

  // --- Loading state ---
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isActiveSession = isSessionActive;

  return (
    <View style={styles.container}>
      {isActiveSession ? (
        <RecordingView
          saveLabel={t("tabs.dailyLogs")}
          title={t("recording.newRecording")}
          elapsed={elapsed}
          isPaused={isPaused}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onCancel={handleCancel}
          onSettings={() => navigation.navigate("Settings")}
        />
      ) : (
        <>
          <SectionList
            sections={sections}
            keyExtractor={(item: any) => item.id}
            renderItem={renderItem}
            renderSectionHeader={renderSectionHeader}
            renderSectionFooter={renderSectionFooter}
            ListHeaderComponent={<ScreenHeader title={t("tabs.dailyLogs")} rightElement={headerRightElement} />}
            contentContainerStyle={entries.length === 0 ? [styles.list, { flexGrow: 1 }] : styles.list}
            stickySectionHeadersEnabled={true}
            maxToRenderPerBatch={10}
            windowSize={5}
            initialNumToRender={10}
            removeClippedSubviews={true}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={[typography.body, styles.emptyText]}>
                  {t("dailyLog.noEntries")}
                </Text>
              </View>
            }
          />

          <MicFAB onPress={handleStartRecording} />
        </>
      )}

      <Portal>
        <DeleteConfirmDialog
          visible={deleteAllDialogVisible}
          onDismiss={() => setDeleteAllDialogVisible(false)}
          onConfirm={onDeleteAllConfirm}
          title={t("dailyLog.deleteAllTitle")}
          message={t("dailyLog.deleteAllMessage", { total: entries.length })}
          confirmLabel={t("dailyLog.deleteAllButton")}
          loading={false}
        />
        <DeleteConfirmDialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
          onConfirm={onDeleteConfirm}
          title={t("deleteDialog.title")}
          message={t("deleteDialog.message")}
          confirmLabel={undefined}
          loading={deleteLoading}
        />
        <EngineChoiceDialog
          visible={engineDialogVisible}
          onDismiss={closeEngineDialog}
          onConfirm={onTranscribeConfirm}
          engineChoice={engineChoice}
          onEngineChange={setEngineChoice}
          title={batchDate ? t("dailyLog.batchTranscription") : undefined}
          navigation={navigation}
        />
        <ModelDownloadDialog
          visible={modelDownload.visible}
          progress={modelDownload.progress}
        />
        <AIInsightsDialog
          visible={aiDialogVisible}
          onDismiss={() => setAiDialogVisible(false)}
        />
        <MoveToFolderDialog
          visible={moveDialogVisible}
          folders={regularFolders}
          loading={moveLoading}
          onSelect={onMoveConfirm}
          onDismiss={() => setMoveDialogVisible(false)}
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
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: colors.muted, textAlign: "center", lineHeight: 26 },
});
