import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  SectionList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  IconButton,
  Menu,
  Portal,
  Snackbar,
  Text,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  createEntry,
  fetchEntries,
  deleteEntry,
  tombstoneEntry,
  deleteEntryWithICloud,
} from "../../../services/journalStorage";
import { isSyncEnabled } from "../../../services/icloudSyncService";
import { useRecorder } from "../../../hooks/useRecorder";
import { useTranscription } from "../../../hooks/useTranscription";
import RecordingView from "../../../components/RecordingView";
import CalendarStrip from "../../../components/CalendarStrip";
import EngineChoiceDialog from "../../../components/EngineChoiceDialog";
import RecordingTypeDialog from "../../../components/RecordingTypeDialog";
import ModelDownloadDialog from "../../../components/ModelDownloadDialog";
import DeleteConfirmDialog from "../../../components/DeleteConfirmDialog";
import { statusConfig, groupByDate, displayName } from "../../../utils/entryUtils";
import { safeErrorMessage } from "../../../utils/errorHelpers";
import { colors, spacing, radii, elevation, typography, FOLDER_COLORS } from "../../../theme";
import { formatDate } from "../../utils/formatters";
import { t } from "../../i18n";

import { useSnackbar } from "../../hooks/useSnackbar";
import { useEngineDialog } from "../../hooks/useEngineDialog";
import { usePreventBackDuringRecording } from "../../hooks/usePreventBackDuringRecording";

const SECTION_DAYS = ["NED", "PON", "UTO", "SRI", "\u010cET", "PET", "SUB"];

function formatMonthSectionHeader(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  return `${SECTION_DAYS[date.getDay()]} ${date.getDate()}.`;
}

export default function DirectoryScreen({ route, navigation }: any) {
  const { id: folderId, name: folderName, color: folderColor } = route.params;
  const accentColor = folderColor || FOLDER_COLORS[0];
  const { snackbar, setSnackbar, dismissSnackbar } = useSnackbar();

  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Calendar state
  const [viewedYear, setViewedYear] = useState(() => new Date().getFullYear());
  const [viewedMonth, setViewedMonth] = useState(() => new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Menu state
  const [menuVisible, setMenuVisible] = useState<string | null>(null);

  // Delete dialog
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filename: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Engine dialog
  const {
    engineDialogVisible,
    engineChoice,
    setEngineChoice,
    engineTargetId,
    openForEntry,
    closeDialog: closeEngineDialog,
  } = useEngineDialog();

  // Recording type dialog
  const [recordingTypeDialogVisible, setRecordingTypeDialogVisible] = useState(false);
  const pendingRecordingTypeRef = useRef("beleshka");

  const { isRecording, isPaused, isSessionActive, elapsed, meteringHistory, startRecording, pauseRecording, resumeRecording, stopRecording, cancelRecording } = useRecorder({
    onRecordingComplete: async (uri: string, durationSeconds: number, filename: string) => {
      try {
        const entry = await createEntry(folderId, filename, uri, durationSeconds, pendingRecordingTypeRef.current);
        setEntries((prev) => [entry, ...prev]);
      } catch (e) {
        setSnackbar(safeErrorMessage(e, t("errors.saveFailed")));
      }
    },
  });

  usePreventBackDuringRecording(navigation, isRecording, isPaused, cancelRecording);

  useEffect(() => {
    navigation.setOptions({ headerShown: !isSessionActive });
  }, [navigation, isSessionActive]);

  const { startTranscription, modelDownload } = useTranscription({
    entries,
    setEntries,
    onComplete: undefined,
  });

  const load = useCallback(async () => {
    try {
      const data = await fetchEntries(folderId);
      setEntries(data);
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [folderId, setSnackbar]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

  const handleMonthChange = useCallback((year: number, month: number) => {
    if (month < 0) { year -= 1; month = 11; }
    if (month > 11) { year += 1; month = 0; }
    setViewedYear(year);
    setViewedMonth(month);
    setSelectedDay(null);
  }, []);

  const monthEntries = useMemo(() => {
    const prefix = `${viewedYear}-${String(viewedMonth + 1).padStart(2, "0")}`;
    return entries.filter((e) => {
      const date = e.recorded_date || e.created_at.slice(0, 10);
      return date.startsWith(prefix);
    });
  }, [entries, viewedYear, viewedMonth]);

  const entryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of monthEntries) {
      const date = e.recorded_date || e.created_at.slice(0, 10);
      map.set(date, (map.get(date) || 0) + 1);
    }
    return map;
  }, [monthEntries]);

  const sections = useMemo(() => {
    if (selectedDay) {
      const dayEntries = monthEntries.filter((e: any) =>
        (e.recorded_date || e.created_at.slice(0, 10)) === selectedDay
      );
      return [{ title: "", date: selectedDay, data: dayEntries }];
    }
    return groupByDate(monthEntries).map((s) => ({
      ...s,
      title: formatMonthSectionHeader(s.date),
    }));
  }, [monthEntries, selectedDay]);

  const renderSectionHeader = useCallback(({ section }: any) => {
    if (selectedDay) return null;
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionCount}>{section.data.length}</Text>
      </View>
    );
  }, [selectedDay]);

  // --- Recording ---
  const handleStartRecording = useCallback(() => {
    setRecordingTypeDialogVisible(true);
  }, []);

  const onRecordingTypeConfirm = useCallback(async (type: string) => {
    pendingRecordingTypeRef.current = type;
    setRecordingTypeDialogVisible(false);
    try {
      await startRecording();
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    }
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

  // --- Engine dialog ---
  const openEngineDialog = useCallback((entryId: string) => {
    setMenuVisible(null);
    openForEntry(entryId);
  }, [openForEntry]);

  const onTranscribeConfirm = useCallback(async () => {
    closeEngineDialog();
    if (!engineTargetId) return;
    const result: any = await startTranscription(engineTargetId, engineChoice);
    if (!result.started) setSnackbar(result.message);
    else if (result.error) setSnackbar(result.error);
  }, [engineTargetId, engineChoice, startTranscription, closeEngineDialog, setSnackbar]);

  // --- Delete ---
  const onDeletePress = useCallback((entryId: string, filename: string) => {
    setMenuVisible(null);
    setDeleteTarget({ id: entryId, filename });
    setDeleteDialogVisible(true);
  }, []);

  const onDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || deleteLoading) return;
    setDeleteLoading(true);
    try {
      const syncOn = await isSyncEnabled();
      if (syncOn) {
        setDeleteDialogVisible(false);
        Alert.alert(
          t("deleteDialog.icloudTitle"),
          t("deleteDialog.icloudEntryMessage", { filename: displayName(deleteTarget.filename) }),
          [
            {
              text: t("deleteDialog.localOnly"),
              onPress: async () => {
                try {
                  await tombstoneEntry(deleteTarget.id);
                  setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id));
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
                  setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id));
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
      setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id));
    } catch (e) {
      setSnackbar(safeErrorMessage(e, t("errors.deleteFailed")));
    } finally {
      setDeleteLoading(false);
    }
    setDeleteDialogVisible(false);
    setDeleteTarget(null);
  }, [deleteTarget, deleteLoading, setSnackbar]);

  // --- Render ---
  const renderItem = useCallback(({ item }: any) => {
    const status = item.status ?? "done";
    const isRecorded = status === "recorded" || status === "error";
    const isProcessing = status === "processing";
    const isDone = !isRecorded && !isProcessing;
    const sc = statusConfig(status);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate("Entry", { id: item.id })}
        style={[styles.card, elevation.sm]}
      >
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={[typography.heading, { flex: 1 }]} numberOfLines={1}>
              {displayName(item.filename)}
            </Text>
            <Menu
              visible={menuVisible === item.id}
              onDismiss={() => setMenuVisible(null)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  iconColor={colors.muted}
                  size={18}
                  style={styles.menuBtn}
                  onPress={() => setMenuVisible(item.id)}
                />
              }
            >
              {isRecorded && (
                <Menu.Item
                  leadingIcon="text-recognition"
                  onPress={() => openEngineDialog(item.id)}
                  title={t("dailyLog.toText")}
                />
              )}
              {(isDone || isRecorded) && (
                <Menu.Item
                  leadingIcon="delete-outline"
                  onPress={() => onDeletePress(item.id, item.filename)}
                  title={t("common.delete")}
                />
              )}
            </Menu>
          </View>
          <View style={styles.metaRow}>
            {isProcessing ? (
              <ActivityIndicator size={12} color={sc.fg} style={{ marginRight: spacing.xs }} />
            ) : (
              <MaterialCommunityIcons name={sc.icon as any} size={14} color={sc.fg} style={{ marginRight: spacing.xs }} />
            )}
            <Text style={[styles.statusLabel, { color: sc.fg }]}>{sc.label}</Text>
            <Text style={styles.metaSeparator}> · </Text>
            <Text style={typography.caption}>{formatDate(item.created_at)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [menuVisible, navigation, openEngineDialog, onDeletePress, accentColor]);

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
          saveLabel={folderName || t("nav.directory")}
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
      <CalendarStrip
        viewedYear={viewedYear}
        viewedMonth={viewedMonth}
        onMonthChange={handleMonthChange}
        selectedDay={selectedDay}
        onDaySelect={setSelectedDay}
        entryCounts={entryCounts}
      />
      {selectedDay && (
        <View style={styles.filterBar}>
          <Text style={styles.filterCount}>{entryCounts.get(selectedDay) || 0} {t("directory.entries")}</Text>
          <TouchableOpacity onPress={() => setSelectedDay(null)}>
            <Text style={styles.filterLink}>{t("directory.showAll")}</Text>
          </TouchableOpacity>
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(item: any) => item.id}
        renderItem={renderItem}
        renderSectionHeader={selectedDay ? () => null : renderSectionHeader}
        contentContainerStyle={sections.length === 0 || (sections.length === 1 && sections[0].data.length === 0) ? styles.empty : styles.list}
        stickySectionHeadersEnabled={!selectedDay}
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={10}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <MaterialCommunityIcons name="microphone-outline" size={48} color={colors.muted} style={{ marginBottom: spacing.md, opacity: 0.4 }} />
            <Text style={[typography.body, styles.emptyText]}>{t("directory.noEntries")}</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={[styles.fab, elevation.md]}
        onPress={handleStartRecording}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="microphone" size={24} color={colors.surface} />
      </TouchableOpacity>
        </>
      )}

      <Portal>
        <DeleteConfirmDialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
          onConfirm={onDeleteConfirm}
          title={t("deleteDialog.title")}
          message={t("deleteDialog.entryMessage", { filename: deleteTarget?.filename ? displayName(deleteTarget.filename) : "" })}
          confirmLabel={undefined}
          loading={deleteLoading}
        />
        <EngineChoiceDialog
          visible={engineDialogVisible}
          onDismiss={closeEngineDialog}
          onConfirm={onTranscribeConfirm}
          engineChoice={engineChoice}
          onEngineChange={setEngineChoice}
          title={undefined}
          navigation={navigation}
        />
        <ModelDownloadDialog
          visible={modelDownload.visible}
          progress={modelDownload.progress}
        />
        <RecordingTypeDialog
          visible={recordingTypeDialogVisible}
          onDismiss={() => setRecordingTypeDialogVisible(false)}
          onConfirm={onRecordingTypeConfirm}
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
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: colors.muted, textAlign: "center", lineHeight: 26 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: colors.muted,
    textTransform: "uppercase",
  },
  sectionCount: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: colors.muted,
  },
  filterBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  filterCount: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: colors.foreground,
  },
  filterLink: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: colors.primary,
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    flexDirection: "row",
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  accentBar: {
    width: 4,
    alignSelf: "stretch",
    borderRadius: 2,
    marginLeft: spacing.md,
  },
  cardBody: {
    flex: 1,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  menuBtn: {
    margin: -spacing.sm,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  statusLabel: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  metaSeparator: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    color: colors.muted,
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
