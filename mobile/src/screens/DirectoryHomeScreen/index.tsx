import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  fetchFolders,
  createFolder,
  deleteFolder,
  updateFolder,
  getAllTags,
  fetchDailyLogStats,
  createDailyLogEntry,
  tombstoneFolder,
  deleteFolderWithICloud,
} from "../../../services/journalStorage";
import { getPendingReminders } from "../../services/storage";
import { isSyncEnabled } from "../../../services/icloudSyncService";
import { useRecorder } from "../../../hooks/useRecorder";
import RecordingOverlay from "../../../components/RecordingOverlay";
import BottomActionBar from "../../../components/BottomActionBar";
import DeleteConfirmDialog from "../../../components/DeleteConfirmDialog";
import { safeErrorMessage } from "../../../utils/errorHelpers";
import { colors, spacing, radii, elevation, typography, FOLDER_COLORS } from "../../../theme";
import { formatDate, formatDuration } from "../../utils/formatters";
import { t } from "../../i18n";

import { useSnackbar } from "../../hooks/useSnackbar";
import FolderDialog from "./FolderDialog";

export default function DirectoryHomeScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { snackbar, setSnackbar, dismissSnackbar } = useSnackbar();

  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dailyStats, setDailyStats] = useState({ clipCount: 0, totalDuration: 0, latestTimestamp: null });
  const [pendingReminderCount, setPendingReminderCount] = useState(0);

  // Folder dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogName, setDialogName] = useState("");
  const [dialogColor, setDialogColor] = useState(FOLDER_COLORS[0]);
  const [dialogTags, setDialogTags] = useState<string[]>([]);
  const [dialogTagInput, setDialogTagInput] = useState("");
  const [dialogTargetId, setDialogTargetId] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [dialogLoading, setDialogLoading] = useState(false);

  // Delete dialog
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Menu state
  const [menuVisible, setMenuVisible] = useState<string | null>(null);

  // Recording
  const { isRecording, isPaused, elapsed, meteringHistory, startRecording, pauseRecording, resumeRecording, stopRecording } = useRecorder({
    onRecordingComplete: async (uri: string, durationSeconds: number) => {
      try {
        await createDailyLogEntry(uri, durationSeconds);
        const stats = await fetchDailyLogStats();
        setDailyStats(stats);
      } catch (e) {
        setSnackbar(safeErrorMessage(e, t("errors.saveFailed")));
      }
    },
  });

  const handleRecordPress = useCallback(async () => {
    try {
      if (isRecording) await stopRecording();
      else await startRecording();
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    }
  }, [isRecording, stopRecording, startRecording, setSnackbar]);

  const load = useCallback(async () => {
    try {
      const [data, stats, pending] = await Promise.all([
        fetchFolders(),
        fetchDailyLogStats(),
        getPendingReminders(),
      ]);
      setFolders(data);
      setDailyStats(stats);
      setPendingReminderCount(pending.length);
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
      setDialogTags(folder.tags || []);
      setDialogTargetId(folder.id);
    } else {
      setDialogName("");
      setDialogColor(FOLDER_COLORS[0]);
      setDialogTags([]);
      setDialogTargetId(null);
    }
    setDialogTagInput("");
    const tags = await getAllTags();
    setAllTags(tags);
    setDialogVisible(true);
  }, []);

  const tagSuggestions = dialogTagInput.trim()
    ? allTags.filter(
        (tag) =>
          tag.toLowerCase().includes(dialogTagInput.trim().toLowerCase()) &&
          !dialogTags.includes(tag)
      )
    : [];

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
        const folder = await createFolder(name, dialogColor, dialogTags);
        setFolders((prev) => [folder, ...prev]);
      } else {
        const updated = await updateFolder(dialogTargetId!, {
          name,
          color: dialogColor,
          tags: dialogTags,
        });
        setFolders((prev) => prev.map((f) => (f.id === dialogTargetId ? updated : f)));
      }
      setDialogVisible(false);
    } catch (e) {
      setSnackbar(safeErrorMessage(e));
    } finally {
      setDialogLoading(false);
    }
  }, [dialogName, dialogLoading, dialogMode, dialogColor, dialogTags, dialogTargetId, setSnackbar]);

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

  const listHeader = useMemo(() => (
    <View style={[styles.headerArea, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.headerTitleRow}>
        <View>
          <Text style={typography.monoLabel as any}>APP</Text>
          <Text style={[typography.title, { marginTop: spacing.xs }]}>Diktafon</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate("Settings")}
          style={styles.settingsBtn}
        >
          <MaterialCommunityIcons name="cog-outline" size={22} color={colors.muted} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate("DailyLog")}
        style={[styles.danasCard, elevation.sm]}
      >
        <View style={styles.danasIconWrap}>
          <MaterialCommunityIcons name="calendar-today" size={24} color={colors.primary} />
        </View>
        <View style={styles.danasBody}>
          <Text style={styles.danasTitle}>{t("home.quickRecord")}</Text>
          {dailyStats.clipCount > 0 ? (
            <Text style={[typography.caption, { marginTop: 2 }]}>
              {dailyStats.clipCount} {dailyStats.clipCount === 1 ? t("home.entry") : t("home.entries")} · {formatDuration(dailyStats.totalDuration)}
            </Text>
          ) : (
            <Text style={[typography.caption, { marginTop: 2, color: colors.muted }]}>{t("home.noEntries")}</Text>
          )}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate("Reminders")}
        style={[styles.danasCard, elevation.sm]}
      >
        <View style={styles.danasIconWrap}>
          <MaterialCommunityIcons name="bell-outline" size={24} color={colors.primary} />
        </View>
        <View style={styles.danasBody}>
          <Text style={styles.danasTitle}>{t("nav.reminders")}</Text>
          {pendingReminderCount > 0 ? (
            <Text style={[typography.caption, { marginTop: 2 }]}>
              {pendingReminderCount} {pendingReminderCount === 1 ? t("reminders.pending").toLowerCase() : t("reminders.active").toLowerCase()}
            </Text>
          ) : (
            <Text style={[typography.caption, { marginTop: 2, color: colors.muted }]}>{t("reminders.noReminders").split(".")[0]}</Text>
          )}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
      </TouchableOpacity>
    </View>
  ), [insets.top, dailyStats, pendingReminderCount, navigation]);

  const renderItem = useCallback(({ item }: any) => {
    const color = item.color || FOLDER_COLORS[0];
    const tags = item.tags || [];
    const visibleTags = tags.slice(0, 3);
    const extraCount = tags.length - visibleTags.length;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate("Directory", { id: item.id, name: item.name })}
        style={[styles.card, elevation.sm]}
      >
        <View style={[styles.accentBar, { backgroundColor: color }]} />
        <View style={[styles.folderIconWrap, { backgroundColor: color + "26" }]}>
          <MaterialCommunityIcons name="folder-outline" size={22} color={color} />
        </View>
        <View style={styles.cardBody}>
          <Text style={typography.heading} numberOfLines={1}>{item.name}</Text>
          <Text style={[typography.caption, { marginTop: 2 }]}>{formatDate(item.created_at)}</Text>
          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {visibleTags.map((tag: string) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagChipText}>{tag.toLowerCase()}</Text>
                </View>
              ))}
              {extraCount > 0 && (
                <Text style={[typography.caption, { marginLeft: spacing.xs }]}>+{extraCount}</Text>
              )}
            </View>
          )}
        </View>
        <Menu
          visible={menuVisible === item.id}
          onDismiss={() => setMenuVisible(null)}
          anchor={
            <IconButton
              icon="dots-vertical"
              iconColor={colors.muted}
              size={20}
              onPress={() => setMenuVisible(item.id)}
            />
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
      </TouchableOpacity>
    );
  }, [menuVisible, navigation, openDialog, onDeletePress]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={regularFolders}
        keyExtractor={(item: any) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        contentContainerStyle={[styles.list, { flexGrow: 1 }]}
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

      <BottomActionBar
        extraLeftIcon={undefined}
        extraLeftLabel={undefined}
        onExtraLeftPress={undefined}
        leftIcon="folder-plus-outline"
        leftLabel={t("home.newFolder")}
        onLeftPress={() => openDialog("create")}
        centerIcon={undefined}
        centerLabel={undefined}
        onCenterPress={undefined}
        centerDisabled={undefined}
        onRightPress={handleRecordPress}
        isRecording={isRecording}
      />

      <Portal>
        <FolderDialog
          visible={dialogVisible}
          mode={dialogMode}
          name={dialogName}
          onNameChange={setDialogName}
          color={dialogColor}
          onColorChange={setDialogColor}
          tags={dialogTags}
          onAddTag={(tag) => setDialogTags((prev) => [...prev, tag])}
          onRemoveTag={(tag) => setDialogTags((prev) => prev.filter((t) => t !== tag))}
          tagInput={dialogTagInput}
          onTagInputChange={setDialogTagInput}
          tagSuggestions={tagSuggestions}
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

      {isRecording && (
        <RecordingOverlay
          meteringHistory={meteringHistory}
          elapsed={elapsed}
          isPaused={isPaused}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onStop={stopRecording}
          onCancel={undefined}
        />
      )}

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
  emptyWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 40 },
  emptyText: { color: colors.muted, textAlign: "center", lineHeight: 26 },
  headerArea: {
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xl,
  },
  headerTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
  },
  danasCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  danasIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primaryLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
  },
  danasBody: { flex: 1 },
  danasTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.foreground,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: spacing.xs,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: radii.lg,
    borderBottomLeftRadius: radii.lg,
  },
  folderIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.lg,
    marginRight: spacing.md,
  },
  cardBody: { flex: 1 },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  tagChip: {
    backgroundColor: colors.primaryLight,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagChipText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    color: colors.primary,
  },
});
