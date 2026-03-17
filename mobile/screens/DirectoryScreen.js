import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
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
import { getSettings } from "../services/settingsService";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as DocumentPicker from "expo-document-picker";
import {
  createEntry,
  fetchEntries,
  deleteEntry,
} from "../services/journalStorage";
import { useRecorder } from "../hooks/useRecorder";
import { useTranscription } from "../hooks/useTranscription";
import RecordingOverlay from "../components/RecordingOverlay";
import BottomActionBar from "../components/BottomActionBar";
import CalendarStrip from "../components/CalendarStrip";
import { AppHeaderLeft, AppHeaderRight } from "../components/AppHeader";
import AIInsightsDialog from "../components/AIInsightsDialog";
import EngineChoiceDialog from "../components/EngineChoiceDialog";
import ModelDownloadDialog from "../components/ModelDownloadDialog";
import DeleteConfirmDialog from "../components/DeleteConfirmDialog";
import { statusConfig, groupByDate } from "../utils/entryUtils";
import { colors, spacing, radii, elevation, typography } from "../theme";

const SECTION_DAYS = ["NED", "PON", "UTO", "SRI", "ČET", "PET", "SUB"];

function formatMonthSectionHeader(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  return `${SECTION_DAYS[date.getDay()]} ${date.getDate()}.`;
}

const AUDIO_TYPES = [
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg",
  "audio/flac", "audio/aac", "audio/x-m4a", "audio/webm", "audio/*",
];

function formatDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function DirectoryScreen({ route, navigation }) {
  const { id: folderId } = route.params;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Calendar state
  const [viewedYear, setViewedYear] = useState(() => new Date().getFullYear());
  const [viewedMonth, setViewedMonth] = useState(() => new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

  // Menu state
  const [menuVisible, setMenuVisible] = useState(null);

  // Delete dialog
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Engine choice dialog
  const [engineDialogVisible, setEngineDialogVisible] = useState(false);
  const [engineChoice, setEngineChoice] = useState("local");
  const [engineTargetId, setEngineTargetId] = useState(null);

  // AI dialog
  const [aiDialogVisible, setAiDialogVisible] = useState(false);

  // Snackbar
  const [snackbar, setSnackbar] = useState("");

  const { isRecording, isPaused, elapsed, meteringHistory, startRecording, pauseRecording, resumeRecording, stopRecording, cancelRecording } = useRecorder({
    onRecordingComplete: async (uri, durationSeconds, filename) => {
      try {
        const entry = await createEntry(folderId, filename, uri, durationSeconds);
        setEntries((prev) => [entry, ...prev]);
      } catch (e) {
        setSnackbar("Cuvanje snimka nije uspelo: " + e.message);
      }
    },
  });

  const { startTranscription, modelDownload } = useTranscription({
    entries,
    setEntries,
  });

  // Header: app logo on left, AI button on right
  const headerLeft = useCallback(
    () => <AppHeaderLeft onPress={() => navigation.navigate("Home")} />,
    [navigation]
  );
  const headerRight = useCallback(
    () => <AppHeaderRight onPress={() => setAiDialogVisible(true)} />,
    []
  );

  useEffect(() => {
    navigation.setOptions({ headerBackVisible: false, headerLeft, headerRight });
  }, [navigation, headerLeft, headerRight]);

  const load = useCallback(async () => {
    try {
      const data = await fetchEntries(folderId);
      setEntries(data);
    } catch (e) {
      setSnackbar(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [folderId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

  const handleMonthChange = useCallback((year, month) => {
    if (month < 0) { year -= 1; month = 11; }
    if (month > 11) { year += 1; month = 0; }
    setViewedYear(year);
    setViewedMonth(month);
    setSelectedDay(null);
  }, []);

  // Stage 1: Filter to viewed month
  const monthEntries = useMemo(() => {
    const prefix = `${viewedYear}-${String(viewedMonth + 1).padStart(2, "0")}`;
    return entries.filter((e) => {
      const date = e.recorded_date || e.created_at.slice(0, 10);
      return date.startsWith(prefix);
    });
  }, [entries, viewedYear, viewedMonth]);

  // Entry counts per day (for CalendarStrip dots)
  const entryCounts = useMemo(() => {
    const map = new Map();
    for (const e of monthEntries) {
      const date = e.recorded_date || e.created_at.slice(0, 10);
      map.set(date, (map.get(date) || 0) + 1);
    }
    return map;
  }, [monthEntries]);

  // Stage 2: Build sections
  const sections = useMemo(() => {
    if (selectedDay) {
      const dayEntries = monthEntries.filter((e) =>
        (e.recorded_date || e.created_at.slice(0, 10)) === selectedDay
      );
      return [{ title: "", date: selectedDay, data: dayEntries }];
    }
    return groupByDate(monthEntries).map((s) => ({
      ...s,
      title: formatMonthSectionHeader(s.date),
    }));
  }, [monthEntries, selectedDay]);

  const renderSectionHeader = useCallback(({ section }) => {
    if (selectedDay) return null;
    const count = section.data.length;
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
    );
  }, [selectedDay]);

  const handleStartRecording = async () => {
    try {
      await startRecording();
    } catch (e) {
      setSnackbar(e.message);
    }
  };

  const handlePause = async () => {
    try {
      await pauseRecording();
    } catch (e) {
      setSnackbar("Pauza nije uspela: " + e.message);
    }
  };

  const handleResume = async () => {
    try {
      await resumeRecording();
    } catch (e) {
      setSnackbar("Nastavak nije uspeo: " + e.message);
    }
  };

  const handleStop = async () => {
    try {
      await stopRecording();
    } catch (e) {
      setSnackbar("Zaustavljanje nije uspelo: " + e.message);
    }
  };

  const handleCancel = async () => {
    try {
      await cancelRecording();
    } catch (e) {
      setSnackbar("Otkazivanje nije uspelo: " + e.message);
    }
  };

  const importFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: AUDIO_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const entry = await createEntry(folderId, asset.name, asset.uri, 0);
      setEntries((prev) => [entry, ...prev]);
    } catch (e) {
      setSnackbar("Uvoz nije uspeo: " + e.message);
    }
  };

  const openEngineDialog = async (entryId) => {
    setMenuVisible(null);
    setEngineTargetId(entryId);
    const { defaultEngine } = await getSettings();
    setEngineChoice(defaultEngine);
    setEngineDialogVisible(true);
  };

  const onTranscribeConfirm = async () => {
    setEngineDialogVisible(false);
    if (!engineTargetId) return;
    const result = await startTranscription(engineTargetId, engineChoice);
    if (!result.started) setSnackbar(result.message);
    else if (result.error) setSnackbar(result.error);
  };

  const onDeletePress = (entryId, filename) => {
    setMenuVisible(null);
    setDeleteTarget({ id: entryId, filename });
    setDeleteDialogVisible(true);
  };

  const onDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteEntry(deleteTarget.id);
    setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id));
    setDeleteDialogVisible(false);
    setDeleteTarget(null);
  };

  const renderItem = useCallback(({ item }) => {
    const status = item.status ?? "done";
    const isRecorded = status === "recorded";
    const isProcessing = status === "processing";
    const isError = status === "error";
    const isDone = !isRecorded && !isProcessing;
    const sc = statusConfig(status);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate("Entry", { id: item.id })}
        style={[styles.card, elevation.sm]}
      >
        <View style={styles.cardHeader}>
          <Text style={[typography.heading, { flex: 1, marginRight: spacing.sm }]} numberOfLines={1}>
            {item.filename}
          </Text>
          <View style={styles.cardMeta}>
            {item.duration_seconds > 0 && (
              <Text style={[typography.caption, { color: colors.primary }]}>
                {formatDuration(item.duration_seconds)}
              </Text>
            )}
            <Menu
              visible={menuVisible === item.id}
              onDismiss={() => setMenuVisible(null)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  iconColor={colors.muted}
                  size={18}
                  onPress={() => setMenuVisible(item.id)}
                />
              }
            >
              {isRecorded && (
                <Menu.Item
                  leadingIcon="text-recognition"
                  onPress={() => openEngineDialog(item.id)}
                  title="U tekst"
                />
              )}
              {(isDone || isRecorded) && (
                <Menu.Item
                  leadingIcon="delete-outline"
                  onPress={() => onDeletePress(item.id, item.filename)}
                  title="Obrisi"
                />
              )}
            </Menu>
          </View>
        </View>

        {/* Status badge row */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            {isProcessing ? (
              <ActivityIndicator size={12} color={sc.fg} style={{ marginRight: 6 }} />
            ) : (
              <MaterialCommunityIcons name={sc.icon} size={14} color={sc.fg} style={{ marginRight: 6 }} />
            )}
            <Text style={[styles.statusText, { color: sc.fg }]}>{sc.label}</Text>
          </View>

          {isRecorded && (
            <TouchableOpacity
              style={styles.transcribeLink}
              onPress={() => openEngineDialog(item.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.transcribeLinkText}>U tekst</Text>
              <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {isDone && item.text && (
          <Text style={[typography.body, styles.preview, isError && { color: colors.danger }]} numberOfLines={2}>
            {item.text}
          </Text>
        )}
      </TouchableOpacity>
    );
  }, [menuVisible, navigation]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const isActiveSession = isRecording || isPaused;

  return (
    <View style={styles.container}>
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
          <Text style={styles.filterCount}>{entryCounts.get(selectedDay) || 0} snimaka</Text>
          <TouchableOpacity onPress={() => setSelectedDay(null)}>
            <Text style={styles.filterLink}>Prikaži sve</Text>
          </TouchableOpacity>
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
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
            <Text style={[typography.body, styles.emptyText]}>Nema snimaka</Text>
          </View>
        }
      />

      {isActiveSession && (
        <RecordingOverlay
          meteringHistory={meteringHistory}
          elapsed={elapsed}
          isPaused={isPaused}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onCancel={handleCancel}
        />
      )}

      {!isActiveSession && (
        <BottomActionBar
          leftIcon="home-outline"
          leftLabel="Home"
          onLeftPress={() => navigation.navigate("Home")}
          centerIcon="file-upload-outline"
          centerLabel="Uvezi"
          onCenterPress={importFile}
          onRightPress={handleStartRecording}
          isRecording={false}
        />
      )}

      <Portal>
        <DeleteConfirmDialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
          onConfirm={onDeleteConfirm}
          title="Obrisi zapis"
          message={`Obrisati "${deleteTarget?.filename}"?`}
        />
        <EngineChoiceDialog
          visible={engineDialogVisible}
          onDismiss={() => setEngineDialogVisible(false)}
          onConfirm={onTranscribeConfirm}
          engineChoice={engineChoice}
          onEngineChange={setEngineChoice}
        />
        <ModelDownloadDialog
          visible={modelDownload.visible}
          progress={modelDownload.progress}
        />
        <AIInsightsDialog visible={aiDialogVisible} onDismiss={() => setAiDialogVisible(false)} />
      </Portal>

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
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: colors.muted, textAlign: "center", lineHeight: 26 },

  // Section header
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

  // Filter bar
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

  // Empty state
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: spacing.xs },

  // Status row
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 100,
  },
  statusText: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 11,
  },

  preview: {
    color: colors.muted,
    lineHeight: 20,
  },

  transcribeLink: {
    flexDirection: "row",
    alignItems: "center",
  },
  transcribeLinkText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: colors.primary,
  },

});
