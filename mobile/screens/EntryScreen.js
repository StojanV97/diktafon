import React, { useCallback, useEffect, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ExpoClipboard from "expo-clipboard";
import {
  ActivityIndicator,
  Menu,
  Snackbar,
  Text,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { fetchEntry, entryAudioUri, updateEntryText } from "../services/journalStorage";
import useAutoSave from "../hooks/useAutoSave";
import { colors, spacing, radii, elevation, typography } from "../theme";

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

export default function EntryScreen({ route, navigation }) {
  const { id } = route.params;
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState("");
  const [shareMenuVisible, setShareMenuVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const saveFn = useCallback((text) => updateEntryText(id, text), [id]);
  const { editableText, handleTextChange, flush, init } = useAutoSave(saveFn);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchEntry(id);
        setRecord(data);
        if (data?.status === "done" && data.text) {
          init(data.text);
        }
      } catch (e) {
        setSnackbar(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    return navigation.addListener("beforeRemove", () => { flush(); });
  }, [navigation, flush]);

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

  const currentText = record?.status === "done" ? editableText : record?.text;

  const copyText = () => {
    if (!currentText) return;
    ExpoClipboard.setStringAsync(currentText);
    setSnackbar("Tekst je kopiran u clipboard.");
  };

  const shareText = async () => {
    setShareMenuVisible(false);
    if (!currentText) return;
    try {
      await Share.share({ message: currentText, title: record.filename });
    } catch {
      // user dismissed
    }
  };

  const saveRecordingToFiles = async () => {
    setShareMenuVisible(false);
    if (!record?.audio_file) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setSnackbar("Deljenje fajlova nije dostupno na ovom uredjaju.");
        return;
      }
      await Sharing.shareAsync(entryAudioUri(record.id), {
        mimeType: "audio/wav",
        dialogTitle: "Sacuvaj snimak",
        UTI: "com.microsoft.waveform-audio",
      });
    } catch (e) {
      setSnackbar("Nije moguce sacuvati snimak: " + e.message);
    }
  };

  const saveTranscriptToFiles = async () => {
    setShareMenuVisible(false);
    if (!currentText) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setSnackbar("Deljenje fajlova nije dostupno na ovom uredjaju.");
        return;
      }
      const baseName = record.filename.replace(/\.[^.]+$/, "");
      const txtPath = FileSystem.cacheDirectory + baseName + ".txt";
      await FileSystem.writeAsStringAsync(txtPath, currentText, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(txtPath, {
        mimeType: "text/plain",
        dialogTitle: "Sacuvaj transkript",
        UTI: "public.plain-text",
      });
    } catch (e) {
      setSnackbar("Nije moguce sacuvati transkript: " + e.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.center}>
        <Text style={[typography.body, { color: colors.muted }]}>Zapis nije pronadjen.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Meta + Transcript (scrollable) */}
      <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent}>
        <Text style={typography.heading}>{record.filename}</Text>
        <Text style={[typography.caption, { marginTop: spacing.xs, marginBottom: spacing.lg }]}>
          {formatDate(record.created_at)}
          {record.duration_seconds > 0 && `  \u2022  ${formatDuration(record.duration_seconds)}`}
        </Text>

        <Text style={[typography.monoLabel, { marginBottom: spacing.md }]}>TRANSKRIPCIJA</Text>
        {record.status === "done" && record.text
          ? <TextInput
              style={styles.bodyText}
              multiline
              scrollEnabled={false}
              value={editableText}
              onChangeText={handleTextChange}
            />
          : record.text
            ? <Text style={styles.bodyText} selectable>{record.text}</Text>
            : <Text style={[typography.body, { color: colors.muted, fontStyle: 'italic' }]}>
                Transkript nije dostupan. Vrati se i tapni „Transkribisi".
              </Text>
        }
      </ScrollView>

      {/* Player card — pinned above bottom bar (hidden when keyboard is up) */}
      {!keyboardVisible && record?.audio_file && (
        <View style={[styles.playerCard, elevation.md]}>
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
            <Text style={styles.timeText}>
              {formatPlaybackTime(status.currentTime)}
            </Text>
            <Text style={styles.timeText}>
              {formatPlaybackTime(status.duration)}
            </Text>
          </View>
          <View style={styles.controls}>
            <TouchableOpacity
              onPress={() => player.seekTo(Math.max(0, status.currentTime - 10))}
              disabled={!status.isLoaded}
              style={styles.skipBtn}
            >
              <MaterialCommunityIcons name="rewind-10" size={22} color={colors.muted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => status.playing ? player.pause() : player.play()}
              disabled={!status.isLoaded}
              style={[styles.playFab, elevation.md]}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name={status.playing ? "pause" : "play"}
                size={28}
                color="#FFF"
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => player.seekTo(Math.min(status.duration ?? 0, status.currentTime + 10))}
              disabled={!status.isLoaded}
              style={styles.skipBtn}
            >
              <MaterialCommunityIcons name="fast-forward-10" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Bottom actions (hidden when keyboard is up) */}
      {!keyboardVisible && (
        <View style={[styles.actions, elevation.sm]}>
          <TouchableOpacity onPress={copyText} style={styles.actionBtn}>
            <MaterialCommunityIcons name="content-copy" size={20} color={colors.muted} />
            <Text style={styles.actionLabel}>Kopiraj</Text>
          </TouchableOpacity>

          <View style={styles.actionDivider} />

          <Menu
            visible={shareMenuVisible}
            onDismiss={() => setShareMenuVisible(false)}
            anchor={
              <TouchableOpacity onPress={() => setShareMenuVisible(true)} style={styles.actionBtn}>
                <MaterialCommunityIcons name="share-variant" size={20} color={colors.muted} />
                <Text style={styles.actionLabel}>Podeli</Text>
              </TouchableOpacity>
            }
          >
            <Menu.Item
              leadingIcon="text-box-outline"
              onPress={shareText}
              title="Podeli transkript"
            />
            {record.audio_file && (
              <Menu.Item
                leadingIcon="music-note"
                onPress={saveRecordingToFiles}
                title="Sacuvaj snimak u Fajlove"
              />
            )}
            {currentText && (
              <Menu.Item
                leadingIcon="file-document-outline"
                onPress={saveTranscriptToFiles}
                title="Sacuvaj transkript u Fajlove"
              />
            )}
          </Menu>
        </View>
      )}

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
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },

  // Player card — pinned above bottom bar
  playerCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.background,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: "#E2E8F0",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  timeText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 11,
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxl,
  },
  skipBtn: {
    padding: spacing.sm,
  },
  playFab: {
    backgroundColor: colors.primary,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },

  // Transcript
  textScroll: { flex: 1, backgroundColor: colors.surface },
  textContent: { padding: spacing.lg },
  bodyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.foreground,
    lineHeight: 24,
  },

  // Bottom actions
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderTopWidth: 0,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  actionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.muted,
  },
  actionDivider: {
    width: 1,
    height: 20,
    backgroundColor: "#E2E8F0",
  },
});
