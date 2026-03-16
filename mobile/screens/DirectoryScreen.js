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
  Dialog,
  FAB,
  IconButton,
  Menu,
  Portal,
  RadioButton,
  Snackbar,
  Text,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
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
import { colors, spacing, radii, elevation, typography } from "../theme";

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
          <MaterialCommunityIcons name="creation" size={18} color={colors.primary} />
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
        setSnackbar("Snimac nije spreman.");
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
        setSnackbar("Cuvanje snimka nije uspelo: " + e.message);
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

  const renderItem = ({ item }) => {
    const status = item.status ?? "done";
    const isRecorded = status === "recorded";
    const isProcessing = status === "processing";
    const isError = status === "error";
    const isDone = !isRecorded && !isProcessing;
    const sc = statusConfig(status);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => isDone && navigation.navigate("Entry", { id: item.id })}
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
                  title="Transkribisi"
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

        <Text style={[typography.caption, { marginBottom: spacing.sm }]}>{formatDate(item.created_at)}</Text>

        {/* Status badge */}
        <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
          {isProcessing ? (
            <ActivityIndicator size={12} color={sc.fg} style={{ marginRight: 6 }} />
          ) : (
            <MaterialCommunityIcons name={sc.icon} size={14} color={sc.fg} style={{ marginRight: 6 }} />
          )}
          <Text style={[styles.statusText, { color: sc.fg }]}>{sc.label}</Text>
        </View>

        {isRecorded && (
          <Button
            mode="contained"
            compact
            onPress={() => openEngineDialog(item.id)}
            style={styles.transcribeBtn}
            labelStyle={styles.transcribeBtnLabel}
            buttonColor={colors.primary}
          >
            Transkribisi
          </Button>
        )}

        {isDone && item.text && (
          <Text style={[typography.body, styles.preview, isError && { color: colors.danger }]} numberOfLines={2}>
            {item.text}
          </Text>
        )}
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
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <Text style={[typography.body, styles.emptyText]}>
            Nema zapisa.{"\n"}Tapni mikrofon da snimis.
          </Text>
        }
      />

      {/* Recording overlay */}
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
          <Text style={[styles.timer, isPaused && styles.timerPaused]}>
            {formatTimer(elapsed)}
          </Text>
          <View style={styles.recordControls}>
            <TouchableOpacity
              style={styles.pauseBtn}
              onPress={isPaused ? resumeRecording : pauseRecording}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={isPaused ? "play" : "pause"}
                size={28}
                color="#FFF"
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.stopBtn}
              onPress={stopRecording}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="stop" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <Text style={[typography.caption, { marginTop: spacing.sm }]}>
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
            style: { backgroundColor: colors.primary },
          },
          {
            icon: "file-upload-outline",
            label: "Uvezi fajl",
            onPress: importFile,
            style: { backgroundColor: colors.primary },
          },
        ]}
        onStateChange={({ open }) => setFabOpen(open)}
        fabStyle={styles.recordFab}
        color="#FFF"
      />

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
                  <Text style={[typography.heading, { fontSize: 15 }]}>Lokalni model — Besplatno</Text>
                  <Text style={[typography.body, { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 }]}>
                    Osnovna transkripcija. Radi lokalno, bez slanja podataka van uredjaja. Podrzava srpski i engleski jezik.
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

        {/* AI Insights dialog */}
        <Dialog visible={aiDialogVisible} onDismiss={() => setAiDialogVisible(false)} style={styles.dialog}>
          <Dialog.Title style={typography.heading}>AI uvidi</Dialog.Title>
          <Dialog.Content>
            <Text style={[typography.body, { lineHeight: 22 }]}>
              {"AI analiza ce omoguciti:\n\u2022 Automatsko sazimanje transkripata\n\u2022 Prepoznavanje govornika i tema\n\u2022 Pametan pregled kljucnih tacaka\n\u2022 Pretraga po sadrzaju unutar direktorijuma\n\nOva funkcija je u razvoju i bice dostupna uskoro."}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAiDialogVisible(false)} textColor={colors.primary}>Zatvori</Button>
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
  list: { padding: spacing.lg, paddingBottom: 140 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: colors.muted, textAlign: "center", lineHeight: 26 },

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

  // Status badge
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 100,
    marginBottom: spacing.sm,
  },
  statusText: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 11,
  },

  preview: {
    color: colors.muted,
    lineHeight: 20,
  },

  transcribeBtn: {
    alignSelf: "flex-start",
    marginTop: spacing.xs,
    borderRadius: radii.sm,
  },
  transcribeBtnLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // AI button
  aiBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
  },

  // Recording overlay
  recordArea: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  timer: {
    fontFamily: "JetBrainsMono_500Medium",
    fontSize: 32,
    color: colors.danger,
    fontVariant: ["tabular-nums"],
    marginBottom: spacing.lg,
  },
  timerPaused: { color: colors.muted },
  recordControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  pauseBtn: {
    backgroundColor: colors.danger,
    borderRadius: radii.xl,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  stopBtn: {
    backgroundColor: "#E2E8F0",
    borderRadius: radii.xl,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  recordFab: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
  },
  waveform: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 48,
    gap: 3,
    marginBottom: spacing.lg,
  },
  waveformBar: {
    width: 4,
    borderRadius: 2,
    backgroundColor: colors.danger,
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
