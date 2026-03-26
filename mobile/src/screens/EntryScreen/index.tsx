import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Keyboard,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { usePreventScreenCapture } from "expo-screen-capture";
import {
  ActivityIndicator,
  Menu,
  Snackbar,
  Text,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
// expo-file-system legacy API (cacheDirectory, writeAsStringAsync, EncodingType)
const FileSystemLegacy = require("expo-file-system") as { cacheDirectory: string; writeAsStringAsync: any; EncodingType: any };
import * as Sharing from "expo-sharing";
import { fetchEntry, entryAudioUri, entryAudioExists, updateEntryText, getDecryptedAudioUri, cleanupDecryptedAudio, cleanupDecryptedFile, downloadAudioFromICloud } from "../../../services/journalStorage";
import { fileExistsOnICloud } from "../../../services/icloudSyncService";
import useAutoSave from "../../../hooks/useAutoSave";
import { safeErrorMessage } from "../../../utils/errorHelpers";
import { colors, spacing, radii, elevation, typography } from "../../../theme";
import { formatDate, formatDurationVerbose, formatPlaybackTime } from "../../utils/formatters";
import { t } from "../../i18n";

import { useSnackbar } from "../../hooks/useSnackbar";
import { useClipboardWithTimer } from "../../hooks/useClipboardWithTimer";

export default function EntryScreen({ route, navigation }: any) {
  usePreventScreenCapture();
  const { id } = route.params;
  const { snackbar, setSnackbar, dismissSnackbar } = useSnackbar();
  const copyWithTimer = useClipboardWithTimer(setSnackbar);

  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [shareMenuVisible, setShareMenuVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [audioMissing, setAudioMissing] = useState(false);
  const [audioOnICloud, setAudioOnICloud] = useState(false);
  const [audioDownloading, setAudioDownloading] = useState(false);
  const [decryptedAudioUri, setDecryptedAudioUri] = useState<string | null>(null);

  const saveFn = useCallback((text: string) => updateEntryText(id, text), [id]);
  const { editableText, handleTextChange, flush, init } = useAutoSave(saveFn);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const data = await fetchEntry(id);
        if (ignore) return;
        setRecord(data);
        if (data?.audio_file && !entryAudioExists(data.id)) {
          setAudioMissing(true);
          if (data.audio_on_icloud) {
            setAudioOnICloud(true);
          } else {
            try {
              const onCloud = await fileExistsOnICloud(`audio/${data.id}.wav`);
              if (onCloud) setAudioOnICloud(true);
            } catch {}
          }
        } else if (data?.audio_file) {
          const uri = await getDecryptedAudioUri(data.id);
          if (uri) setDecryptedAudioUri(uri);
        }
        if (data?.status === "done" && data.text) {
          init(data.text);
        }
      } catch (e) {
        if (!ignore) setSnackbar(safeErrorMessage(e));
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
      cleanupDecryptedAudio();
    };
  }, [id]);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // Wipe decrypted temp audio when app leaves foreground; re-decrypt on return
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "background" || nextState === "inactive") {
        cleanupDecryptedFile(id);
        setDecryptedAudioUri(null);
      } else if (nextState === "active" && record?.audio_file && !audioMissing) {
        getDecryptedAudioUri(id).then((uri) => {
          if (uri) setDecryptedAudioUri(uri);
        });
      }
    });
    return () => sub.remove();
  }, [id, record, audioMissing]);

  useEffect(() => {
    return navigation.addListener("beforeRemove", () => { flush(); });
  }, [navigation, flush]);

  const audioSource = decryptedAudioUri && !audioMissing ? { uri: decryptedAudioUri } : null;
  const player = useAudioPlayer(audioSource as any, 250 as any);
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

  const handleSeek = useCallback((event: any) => {
    if (!status.isLoaded || !status.duration) return;
    const fraction = Math.max(0, Math.min(1, event.nativeEvent.locationX / barWidth));
    player.seekTo(fraction * status.duration);
  }, [status.isLoaded, status.duration, barWidth, player]);

  const currentText = record?.status === "done" ? editableText : record?.text;

  const copyText = useCallback(() => {
    if (currentText) copyWithTimer(currentText);
  }, [currentText, copyWithTimer]);

  const shareText = useCallback(async () => {
    setShareMenuVisible(false);
    if (!currentText) return;
    try {
      await Share.share({ message: currentText, title: record.filename });
    } catch {
      // user dismissed
    }
  }, [currentText, record]);

  const saveRecordingToFiles = useCallback(async () => {
    setShareMenuVisible(false);
    if (!record?.audio_file) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setSnackbar(t("entry.sharingNotAvailable"));
        return;
      }
      const shareUri = decryptedAudioUri || entryAudioUri(record.id);
      await Sharing.shareAsync(shareUri, {
        mimeType: "audio/wav",
        dialogTitle: t("entry.saveRecording"),
        UTI: "com.microsoft.waveform-audio",
      });
    } catch (e) {
      setSnackbar(safeErrorMessage(e, t("entry.saveRecordingFailed")));
    }
  }, [record, decryptedAudioUri, setSnackbar]);

  const saveTranscriptToFiles = useCallback(async () => {
    setShareMenuVisible(false);
    if (!currentText || !record?.filename) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setSnackbar(t("entry.sharingNotAvailable"));
        return;
      }
      const baseName = record.filename.replace(/\.[^.]+$/, "");
      const txtPath = FileSystemLegacy.cacheDirectory + baseName + ".txt";
      await FileSystemLegacy.writeAsStringAsync(txtPath, currentText, {
        encoding: FileSystemLegacy.EncodingType.UTF8,
      });
      await Sharing.shareAsync(txtPath, {
        mimeType: "text/plain",
        dialogTitle: t("entry.saveTranscript"),
        UTI: "public.plain-text",
      });
    } catch (e) {
      setSnackbar(safeErrorMessage(e, t("entry.saveTranscriptFailed")));
    }
  }, [currentText, record, setSnackbar]);

  const handleDownloadAudio = useCallback(async () => {
    setAudioDownloading(true);
    try {
      const success = await downloadAudioFromICloud(id);
      if (success) {
        const uri = await getDecryptedAudioUri(id);
        if (uri) {
          setDecryptedAudioUri(uri);
          setAudioMissing(false);
          setAudioOnICloud(false);
        }
      } else {
        setSnackbar(t("entry.downloadFailed"));
      }
    } catch {
      setSnackbar(t("entry.downloadFailed"));
    } finally {
      setAudioDownloading(false);
    }
  }, [id, setSnackbar]);

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
        <Text style={[typography.body, { color: colors.muted }]}>{t("entry.notFound")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent}>
        <Text style={typography.heading}>{record.filename}</Text>
        <Text style={[typography.caption, { marginTop: spacing.xs, marginBottom: spacing.lg }]}>
          {formatDate(record.created_at)}
          {record.duration_seconds > 0 && `  \u2022  ${formatDurationVerbose(record.duration_seconds)}`}
        </Text>

        <Text style={[typography.monoLabel as any, { marginBottom: spacing.md }]}>{t("entry.transcription")}</Text>
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
            : <Text style={[typography.body, { color: colors.muted, fontStyle: "italic" }]}>
                {t("entry.transcriptUnavailable")}
              </Text>
        }
      </ScrollView>

      {!keyboardVisible && audioMissing && (
        <View style={[styles.playerCard, elevation.md, { alignItems: "center", paddingVertical: spacing.lg }]}>
          {audioOnICloud && !audioDownloading ? (
            <TouchableOpacity onPress={handleDownloadAudio} style={{ alignItems: "center" }}>
              <MaterialCommunityIcons name="cloud-download-outline" size={28} color={colors.primary} />
              <Text style={[typography.caption, { color: colors.primary, marginTop: spacing.xs }]}>{t("entry.downloadFromICloud")}</Text>
            </TouchableOpacity>
          ) : audioOnICloud && audioDownloading ? (
            <>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[typography.caption, { color: colors.muted, marginTop: spacing.xs }]}>{t("entry.downloadingFromICloud")}</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="file-music-outline" size={24} color={colors.muted} />
              <Text style={[typography.caption, { color: colors.muted, marginTop: spacing.xs }]}>{t("entry.audioNotFound")}</Text>
            </>
          )}
        </View>
      )}

      {!keyboardVisible && record?.audio_file && !audioMissing && (
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
            <Text style={styles.timeText}>{formatPlaybackTime(status.currentTime)}</Text>
            <Text style={styles.timeText}>{formatPlaybackTime(status.duration)}</Text>
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
                color={colors.surface}
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

      {!keyboardVisible && (
        <View style={[styles.actions, elevation.sm]}>
          <TouchableOpacity onPress={copyText} style={styles.actionBtn}>
            <MaterialCommunityIcons name="content-copy" size={20} color={colors.muted} />
            <Text style={styles.actionLabel}>{t("entry.copy")}</Text>
          </TouchableOpacity>

          <View style={styles.actionDivider} />

          <Menu
            visible={shareMenuVisible}
            onDismiss={() => setShareMenuVisible(false)}
            anchor={
              <TouchableOpacity onPress={() => setShareMenuVisible(true)} style={styles.actionBtn}>
                <MaterialCommunityIcons name="share-variant" size={20} color={colors.muted} />
                <Text style={styles.actionLabel}>{t("entry.share")}</Text>
              </TouchableOpacity>
            }
          >
            <Menu.Item
              leadingIcon="text-box-outline"
              onPress={shareText}
              title={t("entry.shareTranscript")}
            />
            {record.audio_file && (
              <Menu.Item
                leadingIcon="music-note"
                onPress={saveRecordingToFiles}
                title={t("entry.saveRecordingToFiles")}
              />
            )}
            {currentText && (
              <Menu.Item
                leadingIcon="file-document-outline"
                onPress={saveTranscriptToFiles}
                title={t("entry.saveTranscriptToFiles")}
              />
            )}
          </Menu>
        </View>
      )}

      <Snackbar visible={!!snackbar} onDismiss={dismissSnackbar} duration={2000}>
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  playerCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.background,
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: colors.divider,
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
  textScroll: { flex: 1, backgroundColor: colors.surface },
  textContent: { padding: spacing.lg },
  bodyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.foreground,
    lineHeight: 24,
  },
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
    backgroundColor: colors.divider,
  },
});
