import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Dialog,
  FAB,
  IconButton,
  Menu,
  Portal,
  RadioButton,
  Snackbar,
  Text,
  useTheme,
} from "react-native-paper";
import { useAudioRecorder, useAudioRecorderState, AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
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

const AUDIO_TYPES = [
  "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg",
  "audio/flac", "audio/aac", "audio/x-m4a", "audio/webm", "audio/*",
];

function formatDate(iso) {
  return new Date(iso).toLocaleString("sr-Latn-RS");
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTimer(ms) {
  const total = Math.floor((ms ?? 0) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function DirectoryScreen({ route, navigation }) {
  const theme = useTheme();
  const { id: folderId } = route.params;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);

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

  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(audioRecorder, 100);
  const [meteringHistory, setMeteringHistory] = useState([]);
  const prevIsRecording = useRef(false);

  const pollIntervalRef = useRef(null);

  // AI Insights button in header
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => setAiDialogVisible(true)} style={styles.aiBtn}>
          <Text style={styles.aiBtnText}>AI</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

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
  useEffect(() => {
    const hasProcessing = entries.some((e) => e.status === "processing");

    if (hasProcessing && !pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(async () => {
        const processing = entries.filter((e) => e.status === "processing" && e.assemblyai_id);
        if (processing.length === 0) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          return;
        }
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
    }

    if (!hasProcessing && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [entries]);

  useEffect(() => {
    if (recorderState.isRecording) {
      setMeteringHistory((prev) => {
        const next = [...prev, recorderState.metering ?? -160];
        return next.length > 40 ? next.slice(next.length - 40) : next;
      });
    }
    prevIsRecording.current = recorderState.isRecording;
  }, [recorderState.metering, recorderState.isRecording]);

  const startRecording = async () => {
    try {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      if (!status.granted) {
        setSnackbar("Potrebna je dozvola za mikrofon.");
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      await audioRecorder.prepareToRecordAsync();
      const recStatus = audioRecorder.getStatus();
      if (!recStatus.canRecord) {
        setSnackbar("Snimač nije spreman.");
        return;
      }
      audioRecorder.record();
      setIsPaused(false);
    } catch (e) {
      setSnackbar("Snimanje nije uspelo: " + e.message);
    }
  };

  const pauseRecording = async () => {
    try {
      await audioRecorder.pause();
      setIsPaused(true);
    } catch (e) {
      setSnackbar("Pauza nije uspela: " + e.message);
    }
  };

  const resumeRecording = async () => {
    try {
      audioRecorder.record();
      setIsPaused(false);
    } catch (e) {
      setSnackbar("Nastavak nije uspeo: " + e.message);
    }
  };

  const stopRecording = async () => {
    try {
      const elapsed = recorderState.durationMillis ?? 0;
      await audioRecorder.stop();
      setIsPaused(false);
      setMeteringHistory([]);

      await setAudioModeAsync({ allowsRecording: false });

      const uri = audioRecorder.uri;
      if (!uri) return;

      const now = new Date();
      const filename = `zapis_${now.toISOString().slice(0, 19).replace(/[T:]/g, "-")}.m4a`;
      const durationSeconds = Math.floor(elapsed / 1000);

      try {
        const entry = await createEntry(folderId, filename, uri, durationSeconds);
        setEntries((prev) => [entry, ...prev]);
      } catch (e) {
        setSnackbar("Čuvanje snimka nije uspelo: " + e.message);
      }
    } catch (e) {
      setSnackbar("Zaustavljanje nije uspelo: " + e.message);
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

  const openEngineDialog = (entryId) => {
    setMenuVisible(null);
    setEngineTargetId(entryId);
    setEngineChoice("local");
    setEngineDialogVisible(true);
  };

  const onTranscribeConfirm = async () => {
    setEngineDialogVisible(false);
    const entryId = engineTargetId;
    if (!entryId) return;

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

  const statusLabel = (status) => {
    switch (status) {
      case "recorded": return "Snimljeno";
      case "processing": return "Transkribuje...";
      case "error": return "Greška";
      default: return "Gotovo";
    }
  };

  const statusIcon = (status) => {
    switch (status) {
      case "recorded": return "record-circle-outline";
      case "processing": return "progress-clock";
      case "error": return "alert-circle-outline";
      default: return "check-circle-outline";
    }
  };

  const renderItem = ({ item }) => {
    const status = item.status ?? "done";
    const isRecorded = status === "recorded";
    const isProcessing = status === "processing";
    const isError = status === "error";
    const isDone = !isRecorded && !isProcessing;

    return (
      <Card
        style={styles.card}
        onPress={() => isDone && navigation.navigate("Entry", { id: item.id })}
      >
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text variant="titleSmall" style={styles.filename} numberOfLines={1}>
              {item.filename}
            </Text>
            <View style={styles.cardMeta}>
              {item.duration_seconds > 0 && (
                <Text variant="bodySmall" style={styles.duration}>
                  {formatDuration(item.duration_seconds)}
                </Text>
              )}
              <Menu
                visible={menuVisible === item.id}
                onDismiss={() => setMenuVisible(null)}
                anchor={
                  <IconButton
                    icon="dots-vertical"
                    size={18}
                    onPress={() => setMenuVisible(item.id)}
                  />
                }
              >
                {isRecorded && (
                  <Menu.Item
                    leadingIcon="text-recognition"
                    onPress={() => openEngineDialog(item.id)}
                    title="Transkribiši"
                  />
                )}
                {(isDone || isRecorded) && (
                  <Menu.Item
                    leadingIcon="delete-outline"
                    onPress={() => onDeletePress(item.id, item.filename)}
                    title="Obriši"
                  />
                )}
              </Menu>
            </View>
          </View>
          <Text variant="bodySmall" style={styles.date}>{formatDate(item.created_at)}</Text>
          <Chip
            compact
            icon={statusIcon(status)}
            textStyle={styles.statusChipText}
            style={[
              styles.statusChip,
              isError && styles.statusChipError,
              isDone && !isError && styles.statusChipDone,
              isRecorded && styles.statusChipRecorded,
              isProcessing && styles.statusChipProcessing,
            ]}
          >
            {statusLabel(status)}
          </Chip>
          {isRecorded && (
            <Button
              mode="contained"
              compact
              onPress={() => openEngineDialog(item.id)}
              style={styles.transcribeBtn}
              labelStyle={styles.transcribeBtnLabel}
            >
              Transkribiši
            </Button>
          )}
          {isProcessing && (
            <View style={styles.processingRow}>
              <ActivityIndicator size="small" />
              <Text variant="bodySmall" style={styles.processingText}>Transkribovanje...</Text>
            </View>
          )}
          {isDone && (
            <Text
              variant="bodySmall"
              style={[styles.preview, isError && styles.previewError]}
              numberOfLines={2}
            >
              {item.text}
            </Text>
          )}
        </Card.Content>
      </Card>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const isRecording = recorderState.isRecording;
  const isActiveSession = isRecording || isPaused;
  const elapsed = recorderState.durationMillis ?? 0;

  return (
    <View style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={entries.length === 0 ? styles.empty : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          <Text variant="bodyLarge" style={styles.emptyText}>
            Nema zapisa.{"\n"}Tapni mikrofon da snimiš.
          </Text>
        }
      />

      {isActiveSession && (
        <View style={styles.recordArea}>
          <View style={styles.waveform}>
            {meteringHistory.map((m, i) => {
              const normalized = Math.max(0, Math.min(1, (m + 60) / 60));
              return (
                <View
                  key={i}
                  style={[
                    styles.waveformBar,
                    { height: 4 + normalized * 36, opacity: isPaused ? 0.4 : 1 },
                  ]}
                />
              );
            })}
          </View>
          <Text variant="titleMedium" style={[styles.timer, isPaused && styles.timerPaused]}>
            {formatTimer(elapsed)}
          </Text>
          <View style={styles.recordControls}>
            <IconButton
              icon={isPaused ? "play" : "pause"}
              iconColor="#FFF"
              containerColor="#FF4444"
              size={28}
              onPress={isPaused ? resumeRecording : pauseRecording}
            />
            <IconButton
              icon="stop"
              iconColor="#FFF"
              containerColor="#333"
              size={24}
              onPress={stopRecording}
            />
          </View>
          <Text variant="bodySmall" style={styles.recordHint}>
            {isPaused ? "Nastavi ili zaustavi" : "Pauziraj ili zaustavi"}
          </Text>
        </View>
      )}

      <FAB.Group
        open={fabOpen}
        visible={!isActiveSession}
        icon={fabOpen ? "close" : "microphone"}
        actions={[
          {
            icon: "microphone",
            label: "Snimi",
            onPress: startRecording,
            style: { backgroundColor: "#4A9EFF" },
          },
          {
            icon: "file-upload-outline",
            label: "Uvezi fajl",
            onPress: importFile,
            style: { backgroundColor: "#4A9EFF" },
          },
        ]}
        onStateChange={({ open }) => setFabOpen(open)}
        fabStyle={styles.recordFab}
      />

      <Portal>
        {/* Delete dialog */}
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Obriši zapis</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Obrisati "{deleteTarget?.filename}"?
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>Otkaži</Button>
            <Button onPress={onDeleteConfirm} textColor={theme.colors.error}>Obriši</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Engine choice dialog */}
        <Dialog visible={engineDialogVisible} onDismiss={() => setEngineDialogVisible(false)}>
          <Dialog.Title>Izaberi tip transkripcije</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group onValueChange={setEngineChoice} value={engineChoice}>
              <TouchableOpacity
                style={styles.engineRow}
                onPress={() => setEngineChoice("local")}
              >
                <RadioButton value="local" />
                <View style={styles.engineInfo}>
                  <Text variant="bodyMedium" style={styles.engineTitle}>Lokalni model — Besplatno</Text>
                  <Text variant="bodySmall" style={styles.engineDesc}>
                    Osnovna transkripcija. Radi lokalno, bez slanja podataka van uređaja. Podržava srpski i engleski jezik.
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.engineRow}
                onPress={() => setEngineChoice("assemblyai")}
              >
                <RadioButton value="assemblyai" />
                <View style={styles.engineInfo}>
                  <Text variant="bodyMedium" style={styles.engineTitle}>AssemblyAI — Premium</Text>
                  <Text variant="bodySmall" style={styles.engineDesc}>
                    Prepoznavanje govornika (ko je govorio šta), viša tačnost, podrška za akcentovane govore, automatske interpunkcije i detekcija tema.
                  </Text>
                </View>
              </TouchableOpacity>
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEngineDialogVisible(false)}>Otkaži</Button>
            <Button onPress={onTranscribeConfirm}>Transkribiši</Button>
          </Dialog.Actions>
        </Dialog>

        {/* AI Insights dialog */}
        <Dialog visible={aiDialogVisible} onDismiss={() => setAiDialogVisible(false)}>
          <Dialog.Title>AI uvidi</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {"AI analiza će omogućiti:\n• Automatsko sažimanje transkripata\n• Prepoznavanje govornika i tema\n• Pametan pregled ključnih tačaka\n• Pretraga po sadržaju unutar direktorijuma\n\nOva funkcija je u razvoju i biće dostupna uskoro."}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAiDialogVisible(false)}>Zatvori</Button>
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
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { padding: 12, paddingBottom: 140 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: "#888", textAlign: "center", lineHeight: 26 },
  card: {
    backgroundColor: "#FFFFFF",
    marginBottom: 10,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  filename: { color: "#111", fontWeight: "600", flex: 1, marginRight: 8 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  duration: { color: "#4A9EFF" },
  date: { color: "#777", marginBottom: 6 },
  statusChip: {
    alignSelf: "flex-start",
    marginBottom: 6,
    height: 28,
    backgroundColor: "#F0F0F0",
  },
  statusChipText: { fontSize: 11, lineHeight: 14 },
  statusChipRecorded: { backgroundColor: "#E3F0FF" },
  statusChipProcessing: { backgroundColor: "#FFFDE7" },
  statusChipDone: { backgroundColor: "#E8F5E9" },
  statusChipError: { backgroundColor: "#FFEBEE" },
  preview: { color: "#555", lineHeight: 18 },
  previewError: { color: "#D32F2F" },
  processingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  processingText: { color: "#4A9EFF" },
  transcribeBtn: {
    alignSelf: "flex-start",
    marginTop: 4,
    backgroundColor: "#4A9EFF",
  },
  transcribeBtnLabel: { fontSize: 13 },
  engineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
  },
  engineInfo: { flex: 1, paddingLeft: 4 },
  engineTitle: { fontWeight: "700", marginBottom: 2 },
  engineDesc: { color: "#555", lineHeight: 18 },
  aiBtn: {
    backgroundColor: "#4A9EFF",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
  },
  aiBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  recordArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: 28,
    paddingTop: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  timer: {
    color: "#FF4444",
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    marginBottom: 8,
  },
  timerPaused: { color: "#AAA" },
  recordControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  recordFab: {
    backgroundColor: "#4A9EFF",
  },
  recordHint: { color: "#666", marginTop: 6 },
  waveform: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 40,
    gap: 2,
    marginBottom: 8,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
    backgroundColor: "#FF4444",
  },
});
