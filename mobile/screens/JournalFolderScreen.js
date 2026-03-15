import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAudioRecorder, useAudioRecorderState, AudioModule, RecordingPresets, setAudioModeAsync } from "expo-audio";
import { fetchEntries, uploadEntry, deleteEntry } from "../services/journalApi";

function formatDate(iso) {
  return new Date(iso).toLocaleString("sr-Latn-RS");
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function JournalFolderScreen({ route, navigation }) {
  const { id: folderId } = route.params;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(audioRecorder, 100);
  const [meteringHistory, setMeteringHistory] = useState([]);
  const [isPaused, setIsPaused] = useState(false);
  const prevIsRecording = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchEntries(folderId);
      setEntries(data);
    } catch (e) {
      Alert.alert("Greška", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [folderId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    return unsubscribe;
  }, [navigation, load]);

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
        Alert.alert("Dozvola", "Potrebna je dozvola za mikrofon.");
        return;
      }

      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });

      await audioRecorder.prepareToRecordAsync();
      const recStatus = audioRecorder.getStatus();
      if (!recStatus.canRecord) {
        Alert.alert("Greška", "Snimač nije spreman.");
        return;
      }
      audioRecorder.record();
      setIsPaused(false);
    } catch (e) {
      Alert.alert("Greška", "Snimanje nije uspelo: " + e.message);
    }
  };

  const pauseRecording = async () => {
    try {
      await audioRecorder.pause();
      setIsPaused(true);
    } catch (e) {
      Alert.alert("Greška", "Pauza nije uspela: " + e.message);
    }
  };

  const resumeRecording = async () => {
    try {
      audioRecorder.record();
      setIsPaused(false);
    } catch (e) {
      Alert.alert("Greška", "Nastavak nije uspeo: " + e.message);
    }
  };

  const stopRecording = async () => {
    try {
      await audioRecorder.stop();
      setIsPaused(false);
      setMeteringHistory([]);

      await setAudioModeAsync({ allowsRecording: false });

      const uri = audioRecorder.uri;
      if (!uri) return;

      setUploading(true);
      const now = new Date();
      const filename = `zapis_${now.toISOString().slice(0, 19).replace(/[T:]/g, "-")}.m4a`;
      try {
        const entry = await uploadEntry(folderId, uri, filename, "audio/m4a");
        setEntries((prev) => [entry, ...prev]);
      } catch (e) {
        Alert.alert("Greška", "Upload ili transkripcija nisu uspeli:\n" + e.message);
      } finally {
        setUploading(false);
      }
    } catch (e) {
      Alert.alert("Greška", "Zaustavljanje nije uspelo: " + e.message);
    }
  };

  const onDeleteEntry = (entryId, filename) => {
    Alert.alert("Obriši zapis", `Obrisati "${filename}"?`, [
      { text: "Otkaži", style: "cancel" },
      {
        text: "Obriši",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteEntry(entryId);
            setEntries((prev) => prev.filter((e) => e.id !== entryId));
          } catch (e) {
            Alert.alert("Greška", e.message);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => navigation.navigate("JournalEntry", { id: item.id })}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.filename} numberOfLines={1}>
          {item.filename}
        </Text>
        <View style={styles.cardMeta}>
          {item.duration_seconds > 0 && (
            <Text style={styles.duration}>{formatDuration(item.duration_seconds)}</Text>
          )}
          <Pressable
            style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
            onPress={() => onDeleteEntry(item.id, item.filename)}
            hitSlop={8}
          >
            <Text style={styles.deleteBtnText}>×</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.date}>{formatDate(item.created_at)}</Text>
      <Text style={styles.preview} numberOfLines={2}>
        {item.text}
      </Text>
    </Pressable>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A9EFF" />
      </View>
    );
  }

  const isRecording = recorderState.isRecording;
  const isActiveSession = isRecording || isPaused;
  const elapsed = (recorderState.durationMillis ?? 0) / 1000;

  return (
    <View style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={entries.length === 0 && !uploading ? styles.empty : styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor="#4A9EFF"
          />
        }
        ListHeaderComponent={
          uploading ? (
            <View style={styles.uploadingBar}>
              <ActivityIndicator size="small" color="#4A9EFF" />
              <Text style={styles.uploadingText}>Transkribovanje...</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !uploading ? (
            <Text style={styles.emptyText}>
              Nema zapisa.{"\n"}Tapni mikrofon da snimiš.
            </Text>
          ) : null
        }
      />

      <View style={styles.recordArea}>
        {isActiveSession ? (
          <>
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
            <Text style={[styles.timer, isPaused && styles.timerPaused]}>{formatTimer(elapsed)}</Text>
            <View style={styles.recordControls}>
              <Pressable
                style={({ pressed }) => [styles.recordBtn, styles.recordBtnActive, pressed && styles.recordBtnPressed]}
                onPress={isPaused ? resumeRecording : pauseRecording}
              >
                <Text style={styles.controlIcon}>{isPaused ? "▶" : "⏸"}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.stopBtn, pressed && styles.recordBtnPressed]}
                onPress={stopRecording}
              >
                <View style={styles.stopIcon} />
              </Pressable>
            </View>
            <Text style={styles.recordHint}>
              {isPaused ? "Nastavi ili zaustavi" : "Pauziraj ili zaustavi"}
            </Text>
          </>
        ) : (
          <>
            <Pressable
              style={({ pressed }) => [styles.recordBtn, pressed && styles.recordBtnPressed]}
              onPress={startRecording}
              disabled={uploading}
            >
              <Text style={styles.micEmoji}>🎙️</Text>
            </Pressable>
            <Text style={styles.recordHint}>Tapni da snimaš</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#111" },
  list: { padding: 12, paddingBottom: 140 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { color: "#666", fontSize: 16, textAlign: "center", lineHeight: 26 },
  card: {
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  cardPressed: { opacity: 0.7 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 },
  filename: { color: "#FFF", fontWeight: "600", fontSize: 15, flex: 1, marginRight: 8 },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  duration: { color: "#4A9EFF", fontSize: 13 },
  deleteBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2A2A2A",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteBtnPressed: { backgroundColor: "#FF4444" },
  deleteBtnText: { color: "#888", fontSize: 18, lineHeight: 22, fontWeight: "300" },
  date: { color: "#888", fontSize: 12, marginBottom: 6 },
  preview: { color: "#AAA", fontSize: 13, lineHeight: 18 },
  uploadingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A1A1A",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  uploadingText: { color: "#4A9EFF", fontSize: 14 },
  recordArea: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: 28,
    paddingTop: 12,
    backgroundColor: "#111",
    borderTopWidth: 1,
    borderTopColor: "#2A2A2A",
  },
  timer: {
    color: "#FF4444",
    fontSize: 20,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    marginBottom: 8,
  },
  recordBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#4A9EFF",
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#4A9EFF",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  recordBtnActive: {
    backgroundColor: "#FF4444",
    shadowColor: "#FF4444",
  },
  recordBtnPressed: { opacity: 0.8 },
  stopIcon: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: "#FFF",
  },
  timerPaused: { color: "#888" },
  recordControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  stopBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  controlIcon: { color: "#FFF", fontSize: 20 },
  micEmoji: { fontSize: 28 },
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
  recordHint: { color: "#666", fontSize: 12, marginTop: 6 },
});
