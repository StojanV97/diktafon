import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppState,
  SectionList,
  RefreshControl,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import * as ExpoClipboard from "expo-clipboard";
import {
  ActivityIndicator,
  Button,
  Dialog,
  IconButton,
  Menu,
  Portal,
  Snackbar,
  Text,
} from "react-native-paper";
import { getSettings } from "../services/settingsService";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  fetchDailyLogEntries,
  fetchFolders,
  deleteEntry,
  moveEntryToFolder,
  createDailyLogEntry,
  getDailyCombinedTranscripts,
  consolidateDailyLogEntries,
} from "../services/journalStorage";
import { useRecorder } from "../hooks/useRecorder";
import { useTranscription } from "../hooks/useTranscription";
import RecordingOverlay from "../components/RecordingOverlay";
import BottomActionBar from "../components/BottomActionBar";
import { AppHeaderLeft, AppHeaderRight } from "../components/AppHeader";
import AIInsightsDialog from "../components/AIInsightsDialog";
import EngineChoiceDialog from "../components/EngineChoiceDialog";
import ModelDownloadDialog from "../components/ModelDownloadDialog";
import DeleteConfirmDialog from "../components/DeleteConfirmDialog";
import { statusConfig, groupByDate } from "../utils/entryUtils";
import { syncWidgetData } from "../services/widgetDataService";
import { colors, spacing, radii, elevation, typography } from "../theme";

function formatDuration(seconds) {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTime(iso) {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function formatSectionDate(dateStr) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const date = new Date(dateStr + "T00:00:00");
  const month = date.toLocaleString("sr-Latn-RS", { month: "long" });
  const day = date.getDate();
  if (dateStr === today) return `Danas — ${day}. ${month}`;
  if (dateStr === yesterday) return `Juce — ${day}. ${month}`;
  return `${day}. ${month}`;
}

const sectionCountStyle = [typography.caption, { marginLeft: spacing.sm }];

export default function DailyLogScreen({ navigation, route }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [collapsedDates, setCollapsedDates] = useState(new Set());

  const [menuVisible, setMenuVisible] = useState(null);

  // AI dialog
  const [aiDialogVisible, setAiDialogVisible] = useState(false);

  // Delete dialog (single + all)
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteAllDialogVisible, setDeleteAllDialogVisible] = useState(false);

  // Engine dialog (single or batch)
  const [engineDialogVisible, setEngineDialogVisible] = useState(false);
  const [engineChoice, setEngineChoice] = useState("local");
  const [engineTargetId, setEngineTargetId] = useState(null);
  const [batchDate, setBatchDate] = useState(null);

  // Move dialog
  const [moveDialogVisible, setMoveDialogVisible] = useState(false);
  const [moveTargetEntryId, setMoveTargetEntryId] = useState(null);
  const [regularFolders, setRegularFolders] = useState([]);

  // Combined transcript per date
  const [combinedTexts, setCombinedTexts] = useState({});
  const [expandedTranscripts, setExpandedTranscripts] = useState(new Set());

  // Track batch transcription entry IDs for post-transcription consolidation
  const [batchEntryIds, setBatchEntryIds] = useState(new Set());

  const [snackbar, setSnackbar] = useState("");

  const { isRecording, isPaused, elapsed, meteringHistory, startRecording, pauseRecording, resumeRecording, stopRecording, cancelRecording } = useRecorder({
    onRecordingComplete: async (uri, durationSeconds) => {
      try {
        const entry = await createDailyLogEntry(uri, durationSeconds);
        setEntries((prev) => [entry, ...prev]);
        syncWidgetData();
      } catch (e) {
        setSnackbar("Cuvanje snimka nije uspelo: " + e.message);
      }
    },
  });

  const { startTranscription, startBatchTranscription, modelDownload } = useTranscription({
    entries,
    setEntries,
    onComplete: syncWidgetData,
  });

  const load = useCallback(async () => {
    try {
      const data = await fetchDailyLogEntries();
      setEntries(data);
    } catch (e) {
      setSnackbar(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

  // Prevent back navigation during active recording
  useEffect(() => {
    if (!isRecording && !isPaused) return;
    const unsub = navigation.addListener("beforeRemove", (e) => {
      e.preventDefault();
      Alert.alert(
        "Snimanje u toku",
        "Snimanje je aktivno. Zelite li da otkazete snimanje i napustite ekran?",
        [
          { text: "Nastavi snimanje", style: "cancel" },
          {
            text: "Otkazi i napusti",
            style: "destructive",
            onPress: () => {
              cancelRecording().catch(() => {});
              navigation.dispatch(e.data.action);
            },
          },
        ]
      );
    });
    return unsub;
  }, [navigation, isRecording, isPaused, cancelRecording]);

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

  // Auto-start recording when opened via widget deep link
  useEffect(() => {
    if (route.params?.action === "record") {
      navigation.setParams({ action: undefined });
      setTimeout(() => handleStartRecording(), 500);
    }
  }, [route.params?.action]);

  // After AssemblyAI polling resolves all batch entries, consolidate
  useEffect(() => {
    if (batchEntryIds.size === 0) return;
    const batchEntries = entries.filter((e) => batchEntryIds.has(e.id));
    const allResolved = batchEntries.every(
      (e) => e.status === "done" || e.status === "error"
    );
    if (!allResolved) return;

    const dates = [...new Set(
      batchEntries
        .filter((e) => e.status === "done")
        .map((e) => e.recorded_date || e.created_at.slice(0, 10))
    )];
    setBatchEntryIds(new Set());
    if (dates.length > 0) consolidateAndReload(dates);
  }, [entries, batchEntryIds]);

  const grouped = useMemo(() => groupByDate(entries), [entries]);

  // Load combined transcripts for dates where at least one entry is done
  useEffect(() => {
    const datesWithDone = grouped
      .filter(({ data }) => data.some((e) => e.status === "done"))
      .map(({ date }) => date);

    if (datesWithDone.length === 0) {
      setCombinedTexts({});
      return;
    }

    getDailyCombinedTranscripts(datesWithDone).then((results) => {
      setCombinedTexts(results);
    });
  }, [grouped]);

  const toggleSection = (date) => {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const openSingleEngineDialog = async (entryId) => {
    setMenuVisible(null);
    setEngineTargetId(entryId);
    setBatchDate(null);
    const { defaultEngine } = await getSettings();
    setEngineChoice(defaultEngine);
    setEngineDialogVisible(true);
  };

  const openBatchEngineDialog = async (date = null) => {
    setBatchDate(date);
    setEngineTargetId(null);
    const { defaultEngine } = await getSettings();
    setEngineChoice(defaultEngine);
    setEngineDialogVisible(true);
  };

  const consolidateAndReload = async (dates) => {
    for (const date of dates) {
      await consolidateDailyLogEntries(date);
    }
    const data = await fetchDailyLogEntries();
    setEntries(data);
    syncWidgetData();
  };

  const onTranscribeConfirm = async () => {
    setEngineDialogVisible(false);
    let result;
    let batchTotal = 0;
    if (!engineTargetId) {
      const toTranscribe = batchDate
        ? entries.filter(
            (e) => (e.recorded_date || e.created_at.slice(0, 10)) === batchDate && (e.status === "recorded" || e.status === "error")
          )
        : entries.filter((e) => e.status === "recorded" || e.status === "error");
      const ids = toTranscribe.map((e) => e.id);
      batchTotal = ids.length;
      const dates = [...new Set(toTranscribe.map((e) => e.recorded_date || e.created_at.slice(0, 10)))];

      if (engineChoice === "assemblyai") {
        // AssemblyAI: track IDs for consolidation after polling completes
        setBatchEntryIds(new Set(ids));
      }

      result = await startBatchTranscription(ids, engineChoice);

      if (result.started && engineChoice === "local") {
        // Local engine: all done synchronously, consolidate now
        await consolidateAndReload(dates);
      }
    } else {
      result = await startTranscription(engineTargetId, engineChoice);
    }
    if (!result.started) setSnackbar(result.message);
    else if (result.errors?.length > 0) setSnackbar(`${result.errors.length} od ${batchTotal} snimaka nisu transkribovana`);
    else if (result.error) setSnackbar(result.error);
  };

  const onDeletePress = (entryId, filename) => {
    setMenuVisible(null);
    setDeleteTarget({ id: entryId, filename });
    setDeleteDialogVisible(true);
  };

  const onDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEntry(deleteTarget.id);
      setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      syncWidgetData();
    } catch (e) {
      setSnackbar("Brisanje nije uspelo: " + e.message);
    }
    setDeleteDialogVisible(false);
    setDeleteTarget(null);
  };

  const onDeleteAllConfirm = async () => {
    setDeleteAllDialogVisible(false);
    const total = entries.length;
    let failures = 0;
    for (const entry of entries) {
      try {
        await deleteEntry(entry.id);
      } catch {
        failures++;
      }
    }
    await load();
    syncWidgetData();
    if (failures > 0) {
      setSnackbar(`Brisanje nije uspelo za ${failures} od ${total} zapisa.`);
    } else {
      setSnackbar(`Obrisano ${total} zapisa.`);
    }
  };

  const onMovePress = async (entryId) => {
    setMenuVisible(null);
    try {
      const allFolders = await fetchFolders();
      setRegularFolders(allFolders.filter((f) => !f.is_daily_log));
      setMoveTargetEntryId(entryId);
      setMoveDialogVisible(true);
    } catch (e) {
      setSnackbar(e.message);
    }
  };

  const onMoveConfirm = async (folderId, folderName) => {
    setMoveDialogVisible(false);
    try {
      await moveEntryToFolder(moveTargetEntryId, folderId);
      setEntries((prev) => prev.filter((e) => e.id !== moveTargetEntryId));
      setSnackbar(`Premesteno u "${folderName}"`);
    } catch (e) {
      setSnackbar(e.message);
    }
  };

  // Re-fetch entries when app comes to foreground (reflects auto-move from App.js)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });
    return () => subscription.remove();
  }, [load]);

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

  const sections = grouped.map(({ date, data }) => ({
    date,
    allData: data,
    data: collapsedDates.has(date) ? [] : data,
  }));

  const renderSectionHeader = useCallback(({ section }) => {
    const { date, allData } = section;
    const isCollapsed = collapsedDates.has(date);
    const totalDur = allData.reduce((s, e) => s + (e.duration_seconds || 0), 0);
    return (
      <View style={styles.sectionHeader}>
        <TouchableOpacity
          style={styles.sectionHeaderLeft}
          onPress={() => toggleSection(date)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name={isCollapsed ? "chevron-right" : "chevron-down"}
            size={18}
            color={colors.muted}
          />
          <Text style={styles.sectionTitle}>{formatSectionDate(date)}</Text>
          <Text style={sectionCountStyle}>
            {allData.length} kl · {formatDuration(totalDur)}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }, [collapsedDates]);

  const copyCombinedText = useCallback((date) => {
    const text = combinedTexts[date];
    if (!text) return;
    ExpoClipboard.setStringAsync(text);
    setSnackbar("Tekst je kopiran.");
  }, [combinedTexts]);

  const shareCombinedText = async (date) => {
    const text = combinedTexts[date];
    if (!text) return;
    try {
      await Share.share({ message: text, title: `Brzi Zapis — ${formatSectionDate(date)}` });
    } catch {
      // user dismissed
    }
  };

  const toggleTranscriptExpanded = (date) => {
    setExpandedTranscripts((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const renderSectionFooter = useCallback(({ section }) => {
    const { date } = section;
    const text = combinedTexts[date];
    if (!text || collapsedDates.has(date)) return null;

    const isExpanded = expandedTranscripts.has(date);
    const isLong = text.length > 300;

    return (
      <View style={[styles.combinedCard, elevation.sm]}>
        <View style={styles.combinedHeader}>
          <View style={styles.combinedTitleRow}>
            <MaterialCommunityIcons name="text-box-outline" size={18} color={colors.primary} />
            <Text style={styles.combinedTitle}>Kombinovani transkript</Text>
          </View>
          <View style={styles.combinedActions}>
            <TouchableOpacity onPress={() => copyCombinedText(date)} style={styles.combinedActionBtn}>
              <MaterialCommunityIcons name="content-copy" size={18} color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => shareCombinedText(date)} style={styles.combinedActionBtn}>
              <MaterialCommunityIcons name="share-variant" size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>
        <Text
          style={styles.combinedText}
          numberOfLines={isExpanded ? undefined : 8}
          selectable={isExpanded}
        >
          {text}
        </Text>
        {isLong && (
          <TouchableOpacity onPress={() => toggleTranscriptExpanded(date)}>
            <Text style={styles.expandBtn}>
              {isExpanded ? "Sakrij" : "Prikazi ceo tekst"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [combinedTexts, collapsedDates, expandedTranscripts]);

  const renderItem = useCallback(({ item }) => {
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
        <View style={styles.cardRow}>
          <View style={styles.cardLeft}>
            <Text style={styles.timeLabel}>{formatTime(item.created_at)}</Text>
            {item.duration_seconds > 0 && (
              <View style={styles.durationBadge}>
                <Text style={styles.durationText}>{formatDuration(item.duration_seconds)}</Text>
              </View>
            )}
          </View>

          <View style={styles.cardBody}>
            <View style={styles.statusRow}>
              <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                {isProcessing ? (
                  <ActivityIndicator size={10} color={sc.fg} style={{ marginRight: 4 }} />
                ) : (
                  <MaterialCommunityIcons name={sc.icon} size={12} color={sc.fg} style={{ marginRight: 4 }} />
                )}
                <Text style={[styles.statusText, { color: sc.fg }]}>{sc.label}</Text>
              </View>
              {isRecorded && (
                <TouchableOpacity
                  style={styles.transcribeLink}
                  onPress={() => openSingleEngineDialog(item.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.transcribeLinkText}>U tekst</Text>
                  <MaterialCommunityIcons name="chevron-right" size={14} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>
            {isDone && item.text ? (
              <Text style={[typography.body, styles.preview]} numberOfLines={2}>
                {item.text}
              </Text>
            ) : null}
          </View>

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
                onPress={() => openSingleEngineDialog(item.id)}
                title="U tekst"
              />
            )}
            <Menu.Item
              leadingIcon="folder-move-outline"
              onPress={() => onMovePress(item.id)}
              title="Premesti u folder"
            />
            <Menu.Item
              leadingIcon="delete-outline"
              onPress={() => onDeletePress(item.id, item.filename)}
              title="Obrisi"
            />
          </Menu>
        </View>
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
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        renderSectionFooter={renderSectionFooter}
        contentContainerStyle={entries.length === 0 ? styles.empty : styles.list}
        stickySectionHeadersEnabled={true}
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
          <Text style={[typography.body, styles.emptyText]}>
            Nema snimaka.{"\n"}Tapni mikrofon da zapocnes.
          </Text>
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
          extraLeftIcon="home-outline"
          extraLeftLabel="Pocetna"
          onExtraLeftPress={() => navigation.navigate("Home")}
          leftIcon="delete-sweep-outline"
          leftLabel="Obriši sve"
          onLeftPress={() => entries.length > 0 ? setDeleteAllDialogVisible(true) : undefined}
          centerIcon="text-recognition"
          centerLabel="Sve u tekst"
          onCenterPress={() => openBatchEngineDialog(null)}
          centerDisabled={!entries.some((e) => e.status === "recorded" || e.status === "error")}
          onRightPress={handleStartRecording}
          isRecording={false}
        />
      )}

      <Portal>
        <DeleteConfirmDialog
          visible={deleteAllDialogVisible}
          onDismiss={() => setDeleteAllDialogVisible(false)}
          onConfirm={onDeleteAllConfirm}
          title="Obrisi sve zapise"
          message={`Obrisati svih ${entries.length} zapisa iz Brzog Zapisa? Ovo ukljucuje sve snimke i transkripte.`}
          confirmLabel="Obrisi sve"
        />
        <DeleteConfirmDialog
          visible={deleteDialogVisible}
          onDismiss={() => setDeleteDialogVisible(false)}
          onConfirm={onDeleteConfirm}
          title="Obrisi zapis"
          message="Obrisati ovaj snimak?"
        />
        <EngineChoiceDialog
          visible={engineDialogVisible}
          onDismiss={() => setEngineDialogVisible(false)}
          onConfirm={onTranscribeConfirm}
          engineChoice={engineChoice}
          onEngineChange={setEngineChoice}
          title={batchDate ? "Batch transkripcija" : undefined}
          navigation={navigation}
        />
        <ModelDownloadDialog
          visible={modelDownload.visible}
          progress={modelDownload.progress}
        />
        <AIInsightsDialog visible={aiDialogVisible} onDismiss={() => setAiDialogVisible(false)} />

        {/* Move to folder dialog */}
        <Dialog visible={moveDialogVisible} onDismiss={() => setMoveDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title style={typography.heading}>Premesti u folder</Dialog.Title>
          <Dialog.Content>
            {regularFolders.length === 0 ? (
              <Text style={typography.body}>Nema dostupnih foldera.</Text>
            ) : (
              regularFolders.map((folder) => (
                <TouchableOpacity
                  key={folder.id}
                  style={styles.folderRow}
                  onPress={() => onMoveConfirm(folder.id, folder.name)}
                >
                  <View style={[styles.folderDot, { backgroundColor: folder.color || colors.primary }]} />
                  <Text style={[typography.body, { flex: 1 }]}>{folder.name}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
                </TouchableOpacity>
              ))
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setMoveDialogVisible(false)} textColor={colors.muted}>Otkazi</Button>
          </Dialog.Actions>
        </Dialog>
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
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.foreground,
    marginLeft: spacing.xs,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  cardLeft: {
    alignItems: "center",
    marginRight: spacing.md,
    minWidth: 44,
  },
  timeLabel: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 13,
    color: colors.foreground,
  },
  durationBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    marginTop: spacing.xs,
  },
  durationText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    color: colors.primary,
  },
  cardBody: { flex: 1 },

  // Status row
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 100,
  },
  statusText: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 10,
  },

  preview: {
    color: colors.muted,
    lineHeight: 20,
    fontSize: 13,
  },

  transcribeLink: {
    flexDirection: "row",
    alignItems: "center",
  },
  transcribeLinkText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: colors.primary,
  },

  dialog: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  folderDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.md,
  },

  // Combined transcript
  combinedCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  combinedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  combinedTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  combinedTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.primary,
  },
  combinedActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  combinedActionBtn: {
    padding: spacing.xs,
  },
  combinedText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: colors.foreground,
    lineHeight: 22,
  },
  expandBtn: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: colors.primary,
    marginTop: spacing.sm,
  },
});
