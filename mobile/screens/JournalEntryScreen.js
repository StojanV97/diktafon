import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { fetchEntry, entryAudioUri } from "../services/journalStorage";

function formatDate(iso) {
  return new Date(iso).toLocaleString("sr-Latn-RS");
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m} min ${s} s`;
}

function formatPlaybackTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function JournalEntryScreen({ route, navigation }) {
  const { id } = route.params;
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchEntry(id);
        setRecord(data);
      } catch (e) {
        Alert.alert("Greška", e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const audioSource = record?.audio_file ? { uri: entryAudioUri(record.id) } : null;
  const player = useAudioPlayer(audioSource, 250);
  const status = useAudioPlayerStatus(player);
  const [barWidth, setBarWidth] = useState(1);

  useEffect(() => {
    const unsub = navigation.addListener("blur", () => {
      if (status.playing) player.pause();
    });
    return unsub;
  }, [navigation, player, status.playing]);

  useEffect(() => {
    if (status.didJustFinish) player.seekTo(0);
  }, [status.didJustFinish]);

  const handleSeek = (event) => {
    if (!status.isLoaded || !status.duration) return;
    const fraction = Math.max(0, Math.min(1, event.nativeEvent.locationX / barWidth));
    player.seekTo(fraction * status.duration);
  };

  const copyText = () => {
    if (!record?.text) return;
    Clipboard.setString(record.text);
    Alert.alert("Kopirano", "Tekst je kopiran u clipboard.");
  };

  const shareText = async () => {
    if (!record?.text) return;
    try {
      await Share.share({ message: record.text, title: record.filename });
    } catch {
      // user dismissed
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A9EFF" />
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Zapis nije pronađen.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.meta}>
        <Text style={styles.filename}>{record.filename}</Text>
        <Text style={styles.metaLine}>
          {formatDate(record.created_at)}
          {record.duration_seconds > 0 && `  •  ${formatDuration(record.duration_seconds)}`}
        </Text>
      </View>

      {record?.audio_file && (
        <View style={styles.playerCard}>
          <Pressable
            style={styles.progressBarTrack}
            onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
            onPress={handleSeek}
          >
            <View style={[
              styles.progressBarFill,
              { width: status.isLoaded && status.duration
                  ? `${(status.currentTime / status.duration) * 100}%`
                  : "0%" }
            ]} />
          </Pressable>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatPlaybackTime(status.currentTime)}</Text>
            <Text style={styles.timeText}>{formatPlaybackTime(status.duration)}</Text>
          </View>
          <View style={styles.controls}>
            <Pressable
              style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.7 }]}
              onPress={() => player.seekTo(Math.max(0, status.currentTime - 10))}
              disabled={!status.isLoaded}
            >
              <Text style={styles.skipBtnText}>−10</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.8 }]}
              onPress={() => status.playing ? player.pause() : player.play()}
              disabled={!status.isLoaded}
            >
              <Text style={styles.playBtnIcon}>{status.playing ? "⏸" : "▶"}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.7 }]}
              onPress={() => player.seekTo(Math.min(status.duration ?? 0, status.currentTime + 10))}
              disabled={!status.isLoaded}
            >
              <Text style={styles.skipBtnText}>+10</Text>
            </Pressable>
          </View>
        </View>
      )}

      <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent}>
        <Text style={styles.bodyText} selectable>
          {record.text}
        </Text>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          onPress={copyText}
        >
          <Text style={styles.actionIcon}>📋</Text>
          <Text style={styles.actionLabel}>Kopiraj</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
          onPress={shareText}
        >
          <Text style={styles.actionIcon}>↗️</Text>
          <Text style={styles.actionLabel}>Podeli</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#111" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#111" },
  errorText: { color: "#AAA", fontSize: 16 },
  meta: {
    backgroundColor: "#1A1A1A",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  filename: { color: "#FFF", fontWeight: "600", fontSize: 16, marginBottom: 4 },
  metaLine: { color: "#888", fontSize: 13 },
  textScroll: { flex: 1 },
  textContent: { padding: 16 },
  bodyText: { color: "#DDD", fontSize: 15, lineHeight: 24 },
  actions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#2A2A2A",
    backgroundColor: "#1A1A1A",
  },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    gap: 4,
  },
  pressed: { opacity: 0.6 },
  actionIcon: { fontSize: 22 },
  actionLabel: { color: "#AAA", fontSize: 12 },
  playerCard: {
    backgroundColor: "#1A1A1A",
    marginHorizontal: 12,
    marginTop: 10,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: "#2A2A2A",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#4A9EFF",
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 12,
  },
  timeText: {
    color: "#666",
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  skipBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#2A2A2A",
    justifyContent: "center",
    alignItems: "center",
  },
  skipBtnText: {
    color: "#AAA",
    fontSize: 13,
    fontWeight: "600",
  },
  playBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#4A9EFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4A9EFF",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 5,
  },
  playBtnIcon: {
    color: "#FFF",
    fontSize: 22,
  },
});
