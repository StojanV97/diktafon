import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SectionList,
  RefreshControl,
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
  ProgressBar,
  RadioButton,
  Snackbar,
  Text,
} from "react-native-paper";
import { getSettings } from "../services/settingsService";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as DocumentPicker from "expo-document-picker";
import {
  createEntry,
  fetchEntries,
  fetchEntry,
  deleteEntry,
  updateEntryToProcessing,
  completeEntry,
  failEntry,
  entryAudioUri,
} from "../services/journalStorage";
import { transcribeLocal, submitAssemblyAI, checkAssemblyAI } from "../services/journalApi";
import * as whisperService from "../services/whisperService";
import * as assemblyAIService from "../services/assemblyAIService";
import { useRecorder } from "../hooks/useRecorder";
import RecordingOverlay from "../components/RecordingOverlay";
import BottomActionBar from "../components/BottomActionBar";
import CalendarStrip from "../components/CalendarStrip";
import { AppHeaderLeft, AppHeaderRight } from "../components/AppHeader";
import AIInsightsDialog from "../components/AIInsightsDialog";
import { colors, spacing, radii, elevation, typography } from "../theme";

const SECTION_DAYS = ["NED", "PON", "UTO", "SRI", "ČET", "PET", "SUB"];

function formatMonthSectionHeader(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  return `${SECTION_DAYS[date.getDay()]} ${date.getDate()}.`;
}

function groupByDateForMonth(entries) {
  const map = {};
  for (const e of entries) {
    const date = e.recorded_date || e.created_at.slice(0, 10);
    if (!map[date]) map[date] = [];
    map[date].push(e);
  }
  return Object.keys(map)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({ title: formatMonthSectionHeader(date), date, data: map[date] }));
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

  // Model download dialog
  const [modelDownloadVisible, setModelDownloadVisible] = useState(false);
  const [modelDownloadProgress, setModelDownloadProgress] = useState(0);

  // Snackbar
  const [snackbar, setSnackbar] = useState("");

  const entriesRef = useRef(entries);
  entriesRef.current = entries;

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

  // Poll processing entries every 5 seconds
  const hasProcessing = useMemo(() => entries.some((e) => e.status === "processing"), [entries]);

  useEffect(() => {
    if (!hasProcessing) return;

    const intervalId = setInterval(async () => {
      const processing = entriesRef.current.filter(
        (e) => e.status === "processing" && e.assemblyai_id
      );
      if (processing.length === 0) return;

      await Promise.all(
        processing.map(async (e) => {
          try {
            const result = await checkAssemblyAI(e.assemblyai_id);
            if (result.status === "done") {
              const updated = await completeEntry(e.id, result.text, result.duration_seconds);
              if (updated) setEntries((prev) => prev.map((p) => (p.id === e.id ? updated : p)));
            } else if (result.status === "error") {
              const updated = await failEntry(e.id, result.error);
              if (updated) setEntries((prev) => prev.map((p) => (p.id === e.id ? updated : p)));
            }
          } catch {
            // Retry next interval
          }
        })
      );
    }, 5000);

    return () => clearInterval(intervalId);
  }, [hasProcessing]);

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
    return groupByDateForMonth(monthEntries);
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
    const entryId = engineTargetId;
    if (!entryId) return;

    // Pre-flight checks
    if (engineChoice === "local") {
      const status = whisperService.getModelStatus();
      if (!status.downloaded) {
        setModelDownloadProgress(0);
        setModelDownloadVisible(true);
        try {
          await whisperService.downloadModel((p) => setModelDownloadProgress(p));
        } catch (e) {
          setModelDownloadVisible(false);
          setSnackbar("Preuzimanje modela nije uspelo: " + e.message);
          return;
        }
        setModelDownloadVisible(false);
      }
    } else if (engineChoice === "assemblyai") {
      const hasKey = await assemblyAIService.hasApiKey();
      if (!hasKey) {
        setSnackbar("Potreban je API kljuc. Podesi ga u Podesavanjima.");
        return;
      }
    }

    const entry = await fetchEntry(entryId);
    const audioUri = entryAudioUri(entryId);

    try {
      if (engineChoice === "assemblyai") {
        const { assemblyai_id } = await submitAssemblyAI(audioUri, entry.filename);
        const updated = await updateEntryToProcessing(entryId, assemblyai_id);
        setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
      } else {
        setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, status: "processing" } : e)));
        const { text, duration_seconds } = await transcribeLocal(audioUri, entry.filename);
        const updated = await completeEntry(entryId, text, duration_seconds);
        setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
      }
    } catch (e) {
      const updated = await failEntry(entryId, e.message);
      if (updated) setEntries((prev) => prev.map((en) => (en.id === entryId ? updated : en)));
      setSnackbar(e.message);
    }
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

  const statusConfig = (status) => {
    switch (status) {
      case "recorded":
        return { label: "Snimljeno", icon: "check", bg: colors.primaryLight, fg: colors.primary };
      case "processing":
        return { label: "Transkribuje...", icon: "progress-clock", bg: colors.warningLight, fg: colors.warning };
      case "error":
        return { label: "Greska", icon: "alert-circle-outline", bg: colors.dangerLight, fg: colors.danger };
      default:
        return { label: "Gotovo", icon: "check-circle-outline", bg: colors.successLight, fg: colors.success };
    }
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
        {/* Delete dialog */}
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title style={typography.heading}>Obrisi zapis</Dialog.Title>
          <Dialog.Content>
            <Text style={typography.body}>
              Obrisati "{deleteTarget?.filename}"?
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)} textColor={colors.muted}>Otkazi</Button>
            <Button onPress={onDeleteConfirm} textColor={colors.danger}>Obrisi</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Engine choice dialog */}
        <Dialog visible={engineDialogVisible} onDismiss={() => setEngineDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title style={typography.heading}>Izaberi tip transkripcije</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group onValueChange={setEngineChoice} value={engineChoice}>
              <TouchableOpacity
                style={styles.engineRow}
                onPress={() => setEngineChoice("local")}
              >
                <RadioButton value="local" color={colors.primary} />
                <View style={styles.engineInfo}>
                  <Text style={[typography.heading, { fontSize: 15 }]}>Na uredjaju — Besplatno</Text>
                  <Text style={[typography.body, { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }]}>
                    Transkripcija na uredjaju (Whisper AI). Potpuno privatno, bez interneta. Model ~140MB (preuzima se jednom).
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.engineRow}
                onPress={() => setEngineChoice("assemblyai")}
              >
                <RadioButton value="assemblyai" color={colors.primary} />
                <View style={styles.engineInfo}>
                  <Text style={[typography.heading, { fontSize: 15 }]}>AssemblyAI — Premium</Text>
                  <Text style={[typography.body, { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }]}>
                    Prepoznavanje govornika (ko je govorio sta), visa tacnost, podrska za akcentovane govore, automatske interpunkcije i detekcija tema.
                    {"\n"}Potreban API kljuc (podesi u Podesavanjima).
                  </Text>
                </View>
              </TouchableOpacity>
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEngineDialogVisible(false)} textColor={colors.muted}>Otkazi</Button>
            <Button onPress={onTranscribeConfirm} textColor={colors.primary}>Pokreni</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Model download dialog */}
        <Dialog visible={modelDownloadVisible} dismissable={false} style={styles.dialog}>
          <Dialog.Title style={typography.heading}>Preuzimanje modela</Dialog.Title>
          <Dialog.Content>
            <Text style={[typography.body, { marginBottom: spacing.md }]}>
              Preuzimanje Whisper modela (~140 MB)...
            </Text>
            <ProgressBar progress={modelDownloadProgress} color={colors.primary} style={{ height: 6, borderRadius: 3 }} />
            <Text style={[typography.caption, { marginTop: spacing.xs, textAlign: "center" }]}>
              {Math.round(modelDownloadProgress * 100)}%
            </Text>
          </Dialog.Content>
        </Dialog>

        {/* AI Insights dialog */}
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

  // Dialog
  dialog: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  engineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
  },
  engineInfo: { flex: 1, paddingLeft: spacing.xs },
});
