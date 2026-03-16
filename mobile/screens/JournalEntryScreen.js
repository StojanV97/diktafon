import React, { useEffect, useState } from "react";
import {
  Clipboard,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import {
  ActivityIndicator,
  FAB,
  IconButton,
  Snackbar,
  Text,
  useTheme,
} from "react-native-paper";
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
  const theme = useTheme();
  const { id } = route.params;
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchEntry(id);
        setRecord(data);
      } catch (e) {
        setSnackbar(e.message);
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
    setSnackbar("Tekst je kopiran u clipboard.");
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
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge" style={styles.errorText}>Zapis nije pronađen.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.meta}>
        <Text variant="titleMedium" style={styles.filename}>{record.filename}</Text>
        <Text variant="bodySmall" style={styles.metaLine}>
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
            <Text variant="labelSmall" style={styles.timeText}>
              {formatPlaybackTime(status.currentTime)}
            </Text>
            <Text variant="labelSmall" style={styles.timeText}>
              {formatPlaybackTime(status.duration)}
            </Text>
          </View>
          <View style={styles.controls}>
            <IconButton
              icon="rewind-10"
              iconColor="#AAA"
              containerColor="#2A2A2A"
              size={20}
              onPress={() => player.seekTo(Math.max(0, status.currentTime - 10))}
              disabled={!status.isLoaded}
            />
            <FAB
              icon={status.playing ? "pause" : "play"}
              size="small"
              onPress={() => status.playing ? player.pause() : player.play()}
              disabled={!status.isLoaded}
              style={styles.playFab}
            />
            <IconButton
              icon="fast-forward-10"
              iconColor="#AAA"
              containerColor="#2A2A2A"
              size={20}
              onPress={() => player.seekTo(Math.min(status.duration ?? 0, status.currentTime + 10))}
              disabled={!status.isLoaded}
            />
          </View>
        </View>
      )}

      <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent}>
        <Text variant="bodyMedium" style={styles.bodyText} selectable>
          {record.text}
        </Text>
      </ScrollView>

      <View style={styles.actions}>
        <IconButton
          icon="content-copy"
          iconColor="#AAA"
          size={24}
          onPress={copyText}
        />
        <Text variant="labelSmall" style={styles.actionDivider}>|</Text>
        <IconButton
          icon="share-variant"
          iconColor="#AAA"
          size={24}
          onPress={shareText}
        />
      </View>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar("")}
        duration={2000}
      >
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { color: "#AAA" },
  meta: {
    backgroundColor: "#1A1A1A",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  filename: { color: "#FFF", fontWeight: "600", marginBottom: 4 },
  metaLine: { color: "#888" },
  textScroll: { flex: 1 },
  textContent: { padding: 16 },
  bodyText: { color: "#DDD", lineHeight: 24 },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#2A2A2A",
    backgroundColor: "#1A1A1A",
    paddingVertical: 4,
  },
  actionDivider: { color: "#2A2A2A" },
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
    fontVariant: ["tabular-nums"],
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  playFab: {
    backgroundColor: "#4A9EFF",
  },
});
