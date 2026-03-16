import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Dialog,
  IconButton,
  Menu,
  Portal,
  Snackbar,
  Text,
  TextInput,
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
} from "../services/journalStorage";
import { useRecorder } from "../hooks/useRecorder";
import RecordingOverlay from "../components/RecordingOverlay";
import BottomActionBar from "../components/BottomActionBar";
import { colors, spacing, radii, elevation, typography, FOLDER_COLORS } from "../theme";

function formatDate(iso) {
  return new Date(iso).toLocaleString("sr-Latn-RS");
}

function formatDuration(seconds) {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function DirectoryHomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Daily log stats
  const [dailyStats, setDailyStats] = useState({ clipCount: 0, totalDuration: 0, latestTimestamp: null });

  // Dialog state
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogMode, setDialogMode] = useState("create");
  const [dialogName, setDialogName] = useState("");
  const [dialogColor, setDialogColor] = useState(FOLDER_COLORS[0]);
  const [dialogTags, setDialogTags] = useState([]);
  const [dialogTagInput, setDialogTagInput] = useState("");
  const [dialogTargetId, setDialogTargetId] = useState(null);
  const [allTags, setAllTags] = useState([]);

  // Delete dialog
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Menu state
  const [menuVisible, setMenuVisible] = useState(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState("");

  // Recording
  const { isRecording, isPaused, elapsed, meteringHistory, startRecording, pauseRecording, resumeRecording, stopRecording } = useRecorder({
    onRecordingComplete: async (uri, durationSeconds) => {
      try {
        await createDailyLogEntry(uri, durationSeconds);
        const stats = await fetchDailyLogStats();
        setDailyStats(stats);
      } catch (e) {
        setSnackbar("Cuvanje snimka nije uspelo: " + e.message);
      }
    },
  });

  const handleRecordPress = async () => {
    try {
      if (isRecording) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } catch (e) {
      setSnackbar(e.message);
    }
  };

  const load = useCallback(async () => {
    try {
      const [data, stats] = await Promise.all([fetchFolders(), fetchDailyLogStats()]);
      setFolders(data);
      setDailyStats(stats);
    } catch (e) {
      setSnackbar(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

  const openDialog = async (mode, folder) => {
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
  };

  const addTag = () => {
    const tag = dialogTagInput.trim();
    if (!tag || dialogTags.includes(tag)) return;
    setDialogTags((prev) => [...prev, tag]);
    setDialogTagInput("");
  };

  const removeTag = (tag) => {
    setDialogTags((prev) => prev.filter((t) => t !== tag));
  };

  const tagSuggestions = dialogTagInput.trim()
    ? allTags.filter(
        (t) =>
          t.toLowerCase().includes(dialogTagInput.trim().toLowerCase()) &&
          !dialogTags.includes(t)
      )
    : [];

  const onDialogConfirm = async () => {
    const name = dialogName.trim();
    if (!name) return;
    if (name.length > 100) {
      setSnackbar("Naziv ne moze biti duzi od 100 karaktera.");
      return;
    }

    try {
      if (dialogMode === "create") {
        const folder = await createFolder(name, dialogColor, dialogTags);
        setFolders((prev) => [folder, ...prev]);
      } else {
        const updated = await updateFolder(dialogTargetId, {
          name,
          color: dialogColor,
          tags: dialogTags,
        });
        setFolders((prev) => prev.map((f) => (f.id === dialogTargetId ? updated : f)));
      }
      setDialogVisible(false);
    } catch (e) {
      setSnackbar(e.message);
    }
  };

  const onDeletePress = (id, name) => {
    setMenuVisible(null);
    setDeleteTarget({ id, name });
    setDeleteDialogVisible(true);
  };

  const onDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFolder(deleteTarget.id);
      setFolders((prev) => prev.filter((f) => f.id !== deleteTarget.id));
    } catch (e) {
      setSnackbar(e.message);
    }
    setDeleteDialogVisible(false);
    setDeleteTarget(null);
  };

  const regularFolders = folders.filter((f) => !f.is_daily_log);

  const listHeader = useMemo(() => (
    <View style={[styles.headerArea, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.headerTitleRow}>
        <View>
          <Text style={typography.monoLabel}>APP</Text>
          <Text style={[typography.title, { marginTop: spacing.xs }]}>Diktafon</Text>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate("Settings")}
          style={styles.settingsBtn}
        >
          <MaterialCommunityIcons name="cog-outline" size={22} color={colors.muted} />
        </TouchableOpacity>
      </View>

      {/* Danas card */}
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate("DailyLog")}
        style={[styles.danasCard, elevation.sm]}
      >
        <View style={styles.danasIconWrap}>
          <MaterialCommunityIcons name="calendar-today" size={24} color={colors.primary} />
        </View>
        <View style={styles.danasBody}>
          <Text style={styles.danasTitle}>Brzi Zapis</Text>
          {dailyStats.clipCount > 0 ? (
            <Text style={[typography.caption, { marginTop: 2 }]}>
              {dailyStats.clipCount} {dailyStats.clipCount === 1 ? "snimak" : "snimaka"} · {formatDuration(dailyStats.totalDuration)}
            </Text>
          ) : (
            <Text style={[typography.caption, { marginTop: 2, color: colors.muted }]}>Nema snimaka</Text>
          )}
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={colors.muted} />
      </TouchableOpacity>
    </View>
  ), [insets.top, dailyStats]);

  const renderItem = ({ item }) => {
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
        {/* Left accent bar */}
        <View style={[styles.accentBar, { backgroundColor: color }]} />

        {/* Folder icon */}
        <View style={[styles.folderIconWrap, { backgroundColor: color + "26" }]}>
          <MaterialCommunityIcons name="folder-outline" size={22} color={color} />
        </View>

        {/* Body */}
        <View style={styles.cardBody}>
          <Text style={typography.heading} numberOfLines={1}>{item.name}</Text>
          <Text style={[typography.caption, { marginTop: 2 }]}>{formatDate(item.created_at)}</Text>
          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {visibleTags.map((t) => (
                <View key={t} style={styles.tagChip}>
                  <Text style={styles.tagChipText}>{t.toLowerCase()}</Text>
                </View>
              ))}
              {extraCount > 0 && (
                <Text style={[typography.caption, { marginLeft: spacing.xs }]}>+{extraCount}</Text>
              )}
            </View>
          )}
        </View>

        {/* Three-dot menu */}
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
            title="Izmeni"
          />
          <Menu.Item
            leadingIcon="delete-outline"
            onPress={() => onDeletePress(item.id, item.name)}
            title="Obrisi"
          />
        </Menu>
      </TouchableOpacity>
    );
  };

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
        keyExtractor={(item) => item.id}
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
            <Text style={[typography.body, styles.emptyText]}>
              Nema direktorijuma.{"\n"}Tapni + da kreiras direktorijum.
            </Text>
          </View>
        }
      />

      <BottomActionBar
        leftIcon="folder-plus-outline"
        leftLabel="Direktorijum"
        onLeftPress={() => openDialog("create")}
        onRightPress={handleRecordPress}
        isRecording={isRecording}
      />

      <Portal>
        {/* Create / Edit Dialog */}
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title style={typography.heading}>
            {dialogMode === "create" ? "Novi direktorijum" : "Izmeni direktorijum"}
          </Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView>
              <TextInput
                label="Naziv"
                value={dialogName}
                onChangeText={setDialogName}
                mode="outlined"
                autoFocus
                maxLength={100}
                style={styles.dialogInput}
                outlineColor={colors.borderGhost}
                activeOutlineColor={colors.primary}
              />

              {/* Color picker */}
              <Text style={[typography.monoLabel, { marginBottom: spacing.sm, marginTop: spacing.xs }]}>BOJA</Text>
              <View style={styles.colorRow}>
                {FOLDER_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setDialogColor(c)}
                    style={[
                      styles.colorCircle,
                      { backgroundColor: c },
                      dialogColor === c && styles.colorCircleSelected,
                    ]}
                  />
                ))}
              </View>

              {/* Tag input */}
              <Text style={[typography.monoLabel, { marginBottom: spacing.sm, marginTop: spacing.xs }]}>TAGOVI</Text>
              <View style={styles.tagInputRow}>
                <TextInput
                  label="Novi tag"
                  value={dialogTagInput}
                  onChangeText={setDialogTagInput}
                  onSubmitEditing={addTag}
                  mode="outlined"
                  dense
                  style={styles.tagTextInput}
                  outlineColor={colors.borderGhost}
                  activeOutlineColor={colors.primary}
                />
                <Button
                  mode="contained"
                  compact
                  onPress={addTag}
                  style={styles.addTagBtn}
                  buttonColor={colors.primary}
                >
                  Dodaj
                </Button>
              </View>

              {/* Autocomplete suggestions */}
              {tagSuggestions.length > 0 && (
                <View style={styles.suggestions}>
                  {tagSuggestions.map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => {
                        setDialogTags((prev) => [...prev, t]);
                        setDialogTagInput("");
                      }}
                      style={styles.suggestionChip}
                    >
                      <Text style={styles.suggestionText}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Current tags */}
              {dialogTags.length > 0 && (
                <View style={styles.currentTags}>
                  {dialogTags.map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => removeTag(t)}
                      style={styles.dialogTagChip}
                    >
                      <Text style={styles.dialogTagChipText}>{t.toLowerCase()}</Text>
                      <MaterialCommunityIcons name="close" size={14} color={colors.muted} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)} textColor={colors.muted}>Otkazi</Button>
            <Button onPress={onDialogConfirm} textColor={colors.primary}>
              {dialogMode === "create" ? "Kreiraj" : "Sacuvaj"}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title style={typography.heading}>Obrisi direktorijum</Dialog.Title>
          <Dialog.Content>
            <Text style={typography.body}>
              Obrisati "{deleteTarget?.name}" i sve zapise u njemu?
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)} textColor={colors.muted}>Otkazi</Button>
            <Button onPress={onDeleteConfirm} textColor={colors.danger}>Obrisi</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {isRecording && (
        <RecordingOverlay
          meteringHistory={meteringHistory}
          elapsed={elapsed}
          isPaused={isPaused}
          onPause={pauseRecording}
          onResume={resumeRecording}
          onStop={stopRecording}
        />
      )}

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={3000}
      >
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

  // Danas card
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

  // Card
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

  // Dialog
  dialog: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  dialogScrollArea: { paddingHorizontal: 24, maxHeight: 400 },
  dialogInput: { marginBottom: spacing.md, backgroundColor: colors.surface },
  colorRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: spacing.lg,
    flexWrap: "wrap",
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  colorCircleSelected: {
    borderWidth: 3,
    borderColor: colors.foreground,
  },
  tagInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tagTextInput: { flex: 1, backgroundColor: colors.surface },
  addTagBtn: { marginTop: 6, borderRadius: radii.sm },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  suggestionChip: {
    backgroundColor: colors.primaryLight,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  suggestionText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    color: colors.primary,
  },
  currentTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dialogTagChip: {
    backgroundColor: colors.background,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  dialogTagChipText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    color: colors.foreground,
  },
});
