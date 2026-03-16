import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Clipboard,
  SectionList,
  RefreshControl,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Dialog,
  FAB,
  IconButton,
  Menu,
  Portal,
  ProgressBar,
  RadioButton,
  Snackbar,
  Text,
} from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  fetchDailyLogEntries,
  fetchFolders,
  fetchEntry,
  deleteEntry,
  updateEntryToProcessing,
  completeEntry,
  failEntry,
  entryAudioUri,
  moveEntryToFolder,
  createDailyLogEntry,
  getDailyCombinedTranscript,
} from "../services/journalStorage";
import { transcribeLocal, submitAssemblyAI, checkAssemblyAI } from "../services/journalApi";
import * as whisperService from "../services/whisperService";
import * as assemblyAIService from "../services/assemblyAIService";
import { useRecorder } from "../hooks/useRecorder";
import RecordingOverlay from "../components/RecordingOverlay";
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

function groupByDate(entries) {
  const map = {};
  for (const e of entries) {
    const date = e.recorded_date || e.created_at.slice(0, 10);
    if (!map[date]) map[date] = [];
    map[date].push(e);
  }
  return Object.keys(map)
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({ date, data: map[date] }));
}

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

export default function DailyLogScreen({ navigation }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [collapsedDates, setCollapsedDates] = useState(new Set());

  const [menuVisible, setMenuVisible] = useState(null);

  // Delete dialog
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Engine dialog (single or batch)
  const [engineDialogVisible, setEngineDialogVisible] = useState(false);
  const [engineChoice, setEngineChoice] = useState("local");
  const [engineTargetId, setEngineTargetId] = useState(null);
  const [batchDate, setBatchDate] = useState(null);

  // Move dialog
  const [moveDialogVisible, setMoveDialogVisible] = useState(false);
  const [moveTargetEntryId, setMoveTargetEntryId] = useState(null);
  const [regularFolders, setRegularFolders] = useState([]);

  // Model download dialog
  const [modelDownloadVisible, setModelDownloadVisible] = useState(false);
  const [modelDownloadProgress, setModelDownloadProgress] = useState(0);

  // Combined transcript per date
  const [combinedTexts, setCombinedTexts] = useState({});
  const [expandedTranscripts, setExpandedTranscripts] = useState(new Set());

  const [snackbar, setSnackbar] = useState("");

  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const { isRecording, isPaused, elapsed, meteringHistory, startRecording, pauseRecording, resumeRecording, stopRecording } = useRecorder({
    onRecordingComplete: async (uri, durationSeconds) => {
      try {
        const entry = await createDailyLogEntry(uri, durationSeconds);
        setEntries((prev) => [entry, ...prev]);
      } catch (e) {
        setSnackbar("Cuvanje snimka nije uspelo: " + e.message);
      }
    },
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

  const grouped = useMemo(() => groupByDate(entries), [entries]);

  // Load combined transcripts for dates where all entries are done
  useEffect(() => {
    for (const { date, data } of grouped) {
      const allDone = data.length > 0 && data.every((e) => e.status === "done");
      if (allDone && !combinedTexts[date]) {
        getDailyCombinedTranscript(date).then((text) => {
          setCombinedTexts((prev) => ({ ...prev, [date]: text }));
        });
      } else if (!allDone && combinedTexts[date]) {
        // Clear stale combined text if entries changed (e.g., new recording added)
        setCombinedTexts((prev) => {
          const next = { ...prev };
          delete next[date];
          return next;
        });
      }
    }
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
    const defaultEngine = (await AsyncStorage.getItem("default_transcription_engine")) || "local";
    setEngineChoice(defaultEngine);
    setEngineDialogVisible(true);
  };

  const openBatchEngineDialog = async (date) => {
    setBatchDate(date);
    setEngineTargetId(null);
    const defaultEngine = (await AsyncStorage.getItem("default_transcription_engine")) || "local";
    setEngineChoice(defaultEngine);
    setEngineDialogVisible(true);
  };

  const onTranscribeConfirm = async () => {
    setEngineDialogVisible(false);

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

    if (batchDate) {
      // Batch transcription
      const toTranscribe = entries.filter(
        (e) => (e.recorded_date || e.created_at.slice(0, 10)) === batchDate && e.status === "recorded"
      );
      if (engineChoice === "local") {
        for (const entry of toTranscribe) {
          setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: "processing" } : e)));
          try {
            const audioUri = entryAudioUri(entry.id);
            const { text, duration_seconds } = await transcribeLocal(audioUri, entry.filename);
            const updated = await completeEntry(entry.id, text, duration_seconds);
            setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
          } catch (err) {
            const updated = await failEntry(entry.id, err.message);
            if (updated) setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
          }
        }
      } else {
        await Promise.all(
          toTranscribe.map(async (entry) => {
            try {
              const audioUri = entryAudioUri(entry.id);
              const { assemblyai_id } = await submitAssemblyAI(audioUri, entry.filename);
              const updated = await updateEntryToProcessing(entry.id, assemblyai_id);
              setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
            } catch (err) {
              const updated = await failEntry(entry.id, err.message);
              if (updated) setEntries((prev) => prev.map((e) => (e.id === entry.id ? updated : e)));
            }
          })
        );
      }
    } else if (engineTargetId) {
      // Single entry transcription
      const entryId = engineTargetId;
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

  const sections = grouped.map(({ date, data }) => ({
    date,
    allData: data,
    data: collapsedDates.has(date) ? [] : data,
  }));

  const renderSectionHeader = ({ section }) => {
    const { date, allData } = section;
    const isCollapsed = collapsedDates.has(date);
    const totalDur = allData.reduce((s, e) => s + (e.duration_seconds || 0), 0);
    const untranscribed = allData.filter((e) => e.status === "recorded").length;

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
          <Text style={[typography.caption, { marginLeft: spacing.sm }]}>
            {allData.length} kl · {formatDuration(totalDur)}
          </Text>
        </TouchableOpacity>
        {untranscribed > 0 && (
          <Button
            mode="contained-tonal"
            compact
            onPress={() => openBatchEngineDialog(date)}
            style={styles.batchBtn}
            labelStyle={styles.batchBtnLabel}
            buttonColor={colors.primaryLight}
            textColor={colors.primary}
          >
            Transkribisi sve
          </Button>
        )}
      </View>
    );
  };

  const copyCombinedText = (date) => {
    const text = combinedTexts[date];
    if (!text) return;
    Clipboard.setString(text);
    setSnackbar("Tekst je kopiran.");
  };

  const shareCombinedText = async (date) => {
    const text = combinedTexts[date];
    if (!text) return;
    try {
      await Share.share({ message: text, title: `Dnevni Log — ${formatSectionDate(date)}` });
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

  const renderSectionFooter = ({ section }) => {
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
  };

  const renderItem = ({ item }) => {
    const status = item.status ?? "done";
    const isRecorded = status === "recorded";
    const isProcessing = status === "processing";
    const isDone = !isRecorded && !isProcessing;
    const sc = statusConfig(status);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => isDone && navigation.navigate("Entry", { id: item.id })}
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
            <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
              {isProcessing ? (
                <ActivityIndicator size={10} color={sc.fg} style={{ marginRight: 4 }} />
              ) : (
                <MaterialCommunityIcons name={sc.icon} size={12} color={sc.fg} style={{ marginRight: 4 }} />
              )}
              <Text style={[styles.statusText, { color: sc.fg }]}>{sc.label}</Text>
            </View>
            {isDone && item.text ? (
              <Text style={[typography.body, styles.preview]} numberOfLines={2}>
                {item.text}
              </Text>
            ) : isRecorded ? (
              <Button
                mode="contained"
                compact
                onPress={() => openSingleEngineDialog(item.id)}
                style={styles.transcribeBtn}
                labelStyle={styles.transcribeBtnLabel}
                buttonColor={colors.primary}
              >
                Transkribisi
              </Button>
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
                title="Transkribisi"
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
  };

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
        stickySectionHeadersEnabled={false}
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
        />
      )}

      {!isActiveSession && (
        <FAB
          icon="microphone"
          style={styles.fab}
          color="#FFF"
          onPress={handleStartRecording}
        />
      )}

      <Portal>
        {/* Delete dialog */}
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title style={typography.heading}>Obrisi zapis</Dialog.Title>
          <Dialog.Content>
            <Text style={typography.body}>Obrisati ovaj snimak?</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)} textColor={colors.muted}>Otkazi</Button>
            <Button onPress={onDeleteConfirm} textColor={colors.danger}>Obrisi</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Engine choice dialog */}
        <Dialog visible={engineDialogVisible} onDismiss={() => setEngineDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title style={typography.heading}>
            {batchDate ? "Batch transkripcija" : "Izaberi tip transkripcije"}
          </Dialog.Title>
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
                    Prepoznavanje govornika, visa tacnost, automatske interpunkcije.
                    {"\n"}Potreban API kljuc (podesi u Podesavanjima).
                  </Text>
                </View>
              </TouchableOpacity>
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEngineDialogVisible(false)} textColor={colors.muted}>Otkazi</Button>
            <Button onPress={onTranscribeConfirm} textColor={colors.primary}>Transkribisi</Button>
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
  list: { padding: spacing.lg, paddingBottom: 120 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: colors.muted, textAlign: "center", lineHeight: 26 },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
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
  batchBtn: {
    borderRadius: radii.sm,
    marginLeft: spacing.sm,
  },
  batchBtnLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

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

  // Status badge
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: 100,
    marginBottom: spacing.xs,
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

  transcribeBtn: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    borderRadius: radii.sm,
  },
  transcribeBtnLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  // FAB
  fab: {
    position: "absolute",
    bottom: 28,
    right: 24,
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
  },

  // Dialogs
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
