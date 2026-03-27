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
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  fetchFolders,
  createFolder,
  deleteFolder,
  updateFolder,
  getAllTags,
  tombstoneFolder,
  deleteFolderWithICloud,
  createDailyLogEntry,
} from "../../../services/journalStorage";
import { isSyncEnabled } from "../../../services/icloudSyncService";
import { useRecorder } from "../../../hooks/useRecorder";
import RecordingView from "../../../components/RecordingView";
import * as Haptics from "expo-haptics";
import DeleteConfirmDialog from "../../../components/DeleteConfirmDialog";
import { safeErrorMessage } from "../../../utils/errorHelpers";
import { colors, spacing, radii, elevation, iconSize, typography, FOLDER_COLORS } from "../../../theme";
import { formatDate } from "../../utils/formatters";
import { t } from "../../i18n";

import { useSnackbar } from "../../hooks/useSnackbar";
import ScreenHeader from "../../components/ScreenHeader";
import FolderDialog from "./FolderDialog";

export default function DirectoryHomeScreen({ navigation }: any) {
  const { snackbar, setSnackbar, dismissSnackbar } = useSnackbar();

  const [folders, setFolders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  // Quick recording
  const { isRecording, isPaused, isSessionActive, elapsed, meteringHistory, startRecording, pauseRecording, resumeRecording, stopRecording, cancelRecording } = useRecorder({
    onRecordingComplete: async (uri: string, durationSeconds: number) => {
      try {
        await createDailyLogEntry(uri, durationSeconds);
        setSnackbar(t("home.recordingSaved"));
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

  const load = useCallback(async () => {
    try {
      const data = await fetchFolders();
      setFolders(data);
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

  const tagSuggestions = useMemo(() =>
    dialogTagInput.trim()
      ? allTags.filter(
          (tag) =>
            tag.toLowerCase().includes(dialogTagInput.trim().toLowerCase()) &&
            !dialogTags.includes(tag)
        )
      : [],
    [dialogTagInput, allTags, dialogTags]
  );

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
    <ScreenHeader title="Diktaphone" />
  ), []);

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
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <MaterialCommunityIcons name="folder-outline" size={iconSize.sm} color={color} style={{ marginRight: spacing.sm }} />
            <Text style={[typography.heading, { flex: 1 }]} numberOfLines={1}>{item.name}</Text>
            <Menu
              visible={menuVisible === item.id}
              onDismiss={() => setMenuVisible(null)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  iconColor={colors.muted}
                  size={iconSize.md}
                  onPress={() => setMenuVisible(item.id)}
                  style={styles.menuBtn}
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
          </View>
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
          <FlatList
            data={regularFolders}
            keyExtractor={(item: any) => item.id}
            renderItem={renderItem}
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.listGrow}
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

          <TouchableOpacity
            style={[styles.fab, styles.fabSecondary, elevation.md]}
            onPress={() => openDialog("create")}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="folder-plus-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fab, elevation.md]}
            onPress={handleRecordPress}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="microphone" size={24} color={colors.surface} />
          </TouchableOpacity>
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

      <Snackbar visible={!!snackbar} onDismiss={dismissSnackbar} duration={3000}>
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  listGrow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, flexGrow: 1 },
  emptyWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: spacing.xxxl },
  emptyText: { color: colors.muted, textAlign: "center", lineHeight: 24 },
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
  fabSecondary: {
    bottom: spacing.lg + 56 + spacing.md,
    width: 48,
    height: 48,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    right: spacing.lg + 4,
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
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  folderIconWrap: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },
  menuBtn: {
    margin: -spacing.sm,
  },
  cardBody: {
    flex: 1,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
  },
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
    paddingVertical: spacing.xs,
  },
  tagChipText: {
    ...typography.mono,
    fontSize: 11,
    color: colors.primary,
  },
});
