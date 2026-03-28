import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  RefreshControl,
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
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  fetchFolders,
  createFolder,
  deleteFolder,
  updateFolder,
  tombstoneFolder,
  deleteFolderWithICloud,
  createDailyLogEntry,
  getRawEntries,
} from "../../../services/journalStorage";
import { isSyncEnabled } from "../../../services/icloudSyncService";
import { useRecorder } from "../../../hooks/useRecorder";
import RecordingView from "../../../components/RecordingView";
import * as Haptics from "expo-haptics";
import DeleteConfirmDialog from "../../../components/DeleteConfirmDialog";
import { safeErrorMessage } from "../../../utils/errorHelpers";
import { colors, spacing, radii, elevation, typography, FOLDER_COLORS } from "../../../theme";
import { t } from "../../i18n";

import { useSnackbar } from "../../hooks/useSnackbar";
import ScreenHeader from "../../components/ScreenHeader";
import { recordingTrigger } from "../../utils/recordingTrigger";
import FolderDialog from "./FolderDialog";

const GRID_COLUMNS = 3;
const GRID_GAP = spacing.sm;
const GRID_PADDING = spacing.lg;
const CARD_WIDTH = (Dimensions.get("window").width - 2 * GRID_PADDING - (GRID_COLUMNS - 1) * GRID_GAP) / GRID_COLUMNS;

export default function DirectoryHomeScreen({ navigation }: any) {
  const { snackbar, setSnackbar, dismissSnackbar } = useSnackbar();

  const [folders, setFolders] = useState<any[]>([]);
  const [stats, setStats] = useState({ recordings: 0, transcripts: 0, durationLabel: "0m" });
  const [folderCounts, setFolderCounts] = useState<Map<string, { recordings: number; transcripts: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Folder dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogName, setDialogName] = useState("");
  const [dialogColor, setDialogColor] = useState(FOLDER_COLORS[0]);
  const [dialogTargetId, setDialogTargetId] = useState<string | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);

  // Delete dialog
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Menu state
  const [menuVisible, setMenuVisible] = useState<string | null>(null);

  // Quick recording
  const { isRecording, isPaused, isSessionActive, elapsed, meteringHistory, startRecording, pauseRecording, resumeRecording, stopRecording, cancelRecording } = useRecorder({
    onRecordingComplete: async (uri: string, durationSeconds: number) => {
      try {
        await createDailyLogEntry(uri, durationSeconds);
        setSnackbar(t("home.recordingSaved"));
        load();
      } catch (e) {
        setSnackbar(safeErrorMessage(e, t("errors.saveFailed")));
      }
    },
  });

  const handleRecordPress = useCallback(async () => {
    try {
      if (isRecording) {
        await stopRecording();
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await startRecording();
      }
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    }
  }, [isRecording, stopRecording, startRecording, setSnackbar]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      recordingTrigger.current = handleRecordPress;
    });
    return unsub;
  }, [navigation, handleRecordPress]);

  const load = useCallback(async () => {
    try {
      const [data, allEntries] = await Promise.all([fetchFolders(), getRawEntries()]);
      setFolders(data);

      const active = allEntries.filter((e: any) => !e.deleted_locally);
      const recordings = active.length;
      const transcripts = active.filter((e: any) => e.status === "done").length;
      const totalSeconds = active.reduce((sum: number, e: any) => sum + (e.duration_seconds || 0), 0);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const durationLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      setStats({ recordings, transcripts, durationLabel });

      const counts = new Map<string, { recordings: number; transcripts: number }>();
      for (const e of active) {
        const c = counts.get(e.folder_id) || { recordings: 0, transcripts: 0 };
        c.recordings++;
        if (e.status === "done") c.transcripts++;
        counts.set(e.folder_id, c);
      }
      setFolderCounts(counts);
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setSnackbar]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

  // --- Folder dialog ---
  const openDialog = useCallback(async (mode: "create" | "edit", folder?: any) => {
    setDialogMode(mode);
    if (mode === "edit" && folder) {
      setDialogName(folder.name);
      setDialogColor(folder.color || FOLDER_COLORS[0]);
      setDialogTargetId(folder.id);
    } else {
      setDialogName("");
      setDialogColor(FOLDER_COLORS[0]);
      setDialogTargetId(null);
    }
    setDialogVisible(true);
  }, []);


  const onDialogConfirm = useCallback(async () => {
    const name = dialogName.trim();
    if (!name || dialogLoading) return;
    if (name.length > 100) {
      setSnackbar(t("home.nameTooLong"));
      return;
    }
    setDialogLoading(true);
    try {
      if (dialogMode === "create") {
        const folder = await createFolder(name, dialogColor, []);
        setFolders((prev) => [folder, ...prev]);
      } else {
        const updated = await updateFolder(dialogTargetId!, {
          name,
          color: dialogColor,
          tags: [],
        });
        setFolders((prev) => prev.map((f) => (f.id === dialogTargetId ? updated : f)));
      }
      setDialogVisible(false);
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    } finally {
      setDialogLoading(false);
    }
  }, [dialogName, dialogLoading, dialogMode, dialogColor, dialogTargetId, setSnackbar]);

  // --- Delete ---
  const onDeletePress = useCallback((id: string, name: string) => {
    setMenuVisible(null);
    setDeleteTarget({ id, name });
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
          t("deleteDialog.folderIcloudMessage", { name: deleteTarget.name }),
          [
            {
              text: t("deleteDialog.localOnly"),
              onPress: async () => {
                try {
                  await tombstoneFolder(deleteTarget.id);
                  setFolders((prev) => prev.filter((f) => f.id !== deleteTarget.id));
                } catch (e) {
                  setSnackbar(safeErrorMessage(e));
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
                  await deleteFolderWithICloud(deleteTarget.id);
                  setFolders((prev) => prev.filter((f) => f.id !== deleteTarget.id));
                } catch (e) {
                  setSnackbar(safeErrorMessage(e));
                }
                setDeleteLoading(false);
                setDeleteTarget(null);
              },
            },
          ]
        );
        return;
      }
      await deleteFolder(deleteTarget.id);
      setFolders((prev) => prev.filter((f) => f.id !== deleteTarget.id));
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    } finally {
      setDeleteLoading(false);
    }
    setDeleteDialogVisible(false);
    setDeleteTarget(null);
  }, [deleteTarget, deleteLoading, setSnackbar]);

  const regularFolders = useMemo(() => folders.filter((f) => !f.is_daily_log), [folders]);


  const renderItem = useCallback(({ item }: any) => {
    const color = item.color || FOLDER_COLORS[0];
    const counts = folderCounts.get(item.id) || { recordings: 0, transcripts: 0 };

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate("Directory", { id: item.id, name: item.name, color: item.color })}
        style={[styles.gridCard, elevation.sm]}
      >
        <View style={styles.gridCardTopRow}>
          <MaterialCommunityIcons name="folder-outline" size={26} color={color} />
          <Menu
            visible={menuVisible === item.id}
            onDismiss={() => setMenuVisible(null)}
            anchor={
              <TouchableOpacity
                onPress={() => setMenuVisible(item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="dots-vertical" size={18} color={colors.muted} />
              </TouchableOpacity>
            }
          >
            <Menu.Item
              leadingIcon="pencil-outline"
              onPress={() => { setMenuVisible(null); openDialog("edit", item); }}
              title={t("common.edit")}
            />
            <Menu.Item
              leadingIcon="delete-outline"
              onPress={() => onDeletePress(item.id, item.name)}
              title={t("common.delete")}
            />
          </Menu>
        </View>

        <Text style={styles.gridCardName} numberOfLines={1}>{item.name}</Text>

        <View style={styles.gridCardCounts}>
          <MaterialCommunityIcons name="microphone-outline" size={12} color={colors.muted} />
          <Text style={styles.gridCardCountText}>{counts.recordings}</Text>
          <Text style={styles.gridCardDot}>{" \u00B7 "}</Text>
          <MaterialCommunityIcons name="text-box-check-outline" size={12} color={colors.muted} />
          <Text style={styles.gridCardCountText}>{counts.transcripts}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [menuVisible, navigation, openDialog, onDeletePress, folderCounts]);

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
          onPause={pauseRecording}
          onResume={resumeRecording}
          onStop={stopRecording}
          onCancel={cancelRecording}
          onSettings={() => navigation.navigate("Settings")}
        />
      ) : (
        <>
          <View style={styles.fixedHeader}>
            <ScreenHeader title={t("tabs.home")} />
          </View>

          <View style={styles.statsStrip}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.danger }]}>{stats.recordings}</Text>
              <Text style={styles.statLabel}> {t("home.statsRecordings")}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.primary }]}>{stats.transcripts}</Text>
              <Text style={styles.statLabel}> {t("home.statsTranscripts")}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.success }]}>{stats.durationLabel}</Text>
              <Text style={styles.statLabel}> {t("home.statsTotal")}</Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("home.directories")}</Text>
            <TouchableOpacity
              onPress={() => openDialog("create")}
              style={styles.addBtn}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="folder-plus-outline" size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={regularFolders}
            keyExtractor={(item: any) => item.id}
            renderItem={renderItem}
            numColumns={GRID_COLUMNS}
            columnWrapperStyle={styles.columnWrapper}
            contentContainerStyle={styles.gridContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); load(); }}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={[typography.body, styles.emptyText]}>{t("home.noFolders")}</Text>
              </View>
            }
          />
        </>
      )}

      <Portal>
        <FolderDialog
          visible={dialogVisible}
          mode={dialogMode}
          name={dialogName}
          onNameChange={setDialogName}
          color={dialogColor}
          onColorChange={setDialogColor}
          loading={dialogLoading}
          onConfirm={onDialogConfirm}
          onDismiss={() => setDialogVisible(false)}
        />
        <DeleteConfirmDialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
          onConfirm={onDeleteConfirm}
          title={t("home.deleteFolderTitle")}
          message={t("home.deleteFolderMessage", { name: deleteTarget?.name })}
          confirmLabel={undefined}
          loading={deleteLoading}
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
  fixedHeader: { paddingHorizontal: spacing.lg },
  statsStrip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 0.5,
    borderColor: colors.borderGhost,
  },
  statItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  statNumber: {
    fontSize: 15,
    fontWeight: "700" as const,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "400" as const,
    color: colors.muted,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.divider,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600" as const,
    color: colors.foreground,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  columnWrapper: {
    gap: GRID_GAP,
    paddingHorizontal: GRID_PADDING,
  },
  gridContent: {
    paddingBottom: spacing.xxxl,
    flexGrow: 1,
    gap: GRID_GAP,
  },
  gridCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingTop: 8,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    justifyContent: "space-between",
  },
  gridCardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  gridCardName: {
    fontSize: 12,
    fontWeight: "400" as const,
    color: colors.muted,
  },
  gridCardCounts: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.xs,
  },
  gridCardCountText: {
    fontSize: 11,
    color: colors.muted,
    marginLeft: 2,
  },
  gridCardDot: {
    fontSize: 11,
    color: colors.muted,
  },
  emptyWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: spacing.xxxl },
  emptyText: { color: colors.muted, textAlign: "center", lineHeight: 24 },
});
