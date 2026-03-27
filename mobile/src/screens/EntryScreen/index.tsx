import React, { useCallback, useEffect, useState } from "react";
import {
  AppState,
  Keyboard,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { usePreventScreenCapture } from "expo-screen-capture";
import {
  ActivityIndicator,
  Portal,
  Snackbar,
  Text,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { fetchEntry, entryAudioExists, updateEntryText, getDecryptedAudioUri, cleanupDecryptedAudio, cleanupDecryptedFile, downloadAudioFromICloud } from "../../../services/journalStorage";
import { fileExistsOnICloud } from "../../../services/icloudSyncService";
import useAutoSave from "../../../hooks/useAutoSave";
import { useTranscription } from "../../../hooks/useTranscription";
import { safeErrorMessage } from "../../../utils/errorHelpers";
import { colors, spacing, radii, elevation, typography } from "../../../theme";
import { formatDate, formatDurationVerbose, formatPlaybackTime } from "../../utils/formatters";
import { t } from "../../i18n";
import { useSnackbar } from "../../hooks/useSnackbar";
import { useClipboardWithTimer } from "../../hooks/useClipboardWithTimer";
import { useEngineDialog } from "../../hooks/useEngineDialog";
import EngineChoiceDialog from "../../../components/EngineChoiceDialog";
import ModelDownloadDialog from "../../../components/ModelDownloadDialog";
import WaveformPlayer from "./WaveformPlayer";
import TranscribeCTA from "./TranscribeCTA";
import { extractWaveformData } from "../../utils/wavWaveform";

export default function EntryScreen({ route, navigation }: any) {
  usePreventScreenCapture();
  const { id } = route.params;
  const { snackbar, setSnackbar, dismissSnackbar } = useSnackbar();
  const copyWithTimer = useClipboardWithTimer(setSnackbar);

  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [audioMissing, setAudioMissing] = useState(false);
  const [audioOnICloud, setAudioOnICloud] = useState(false);
  const [audioDownloading, setAudioDownloading] = useState(false);
  const [decryptedAudioUri, setDecryptedAudioUri] = useState<string | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [editing, setEditing] = useState(false);

  const saveFn = useCallback((text: string) => updateEntryText(id, text), [id]);
  const { editableText, handleTextChange, flush, init } = useAutoSave(saveFn);

  // Engine dialog for transcription
  const {
    engineDialogVisible,
    engineChoice,
    setEngineChoice,
    engineTargetId,
    openForEntry,
    closeDialog: closeEngineDialog,
  } = useEngineDialog();

  // Transcription hook (single-entry wrapper)
  const { startTranscription, modelDownload } = useTranscription({
    entries: record ? [record] : [],
    setEntries: (fn: any) => {
      const prev = record ? [record] : [];
      const next = typeof fn === "function" ? fn(prev) : fn;
      if (next[0]) setRecord(next[0]);
    },
    onComplete: async () => {
      const data = await fetchEntry(id);
      if (data) {
        setRecord(data);
        if (data.status === "done" && data.text) init(data.text);
      }
    },
  });

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

  // Set header title/subtitle
  useEffect(() => {
    if (!record) return;
    const subtitle = formatDate(record.created_at) +
      (record.duration_seconds > 0 ? `  \u2022  ${formatDurationVerbose(record.duration_seconds)}` : "");
    navigation.setOptions({
      title: record.filename,
      subtitle,
    });
  }, [record, navigation]);

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
    return navigation.addListener("beforeRemove", () => { flush(); setEditing(false); });
  }, [navigation, flush]);

  const audioSource = decryptedAudioUri && !audioMissing ? { uri: decryptedAudioUri } : null;
  const player = useAudioPlayer(audioSource as any, 250 as any);
  const status = useAudioPlayerStatus(player);

  // Load waveform data when decrypted audio becomes available
  useEffect(() => {
    if (!decryptedAudioUri) {
      setWaveformData([]);
      return;
    }
    let cancelled = false;
    try {
      const data = extractWaveformData(decryptedAudioUri, 64);
      if (!cancelled) setWaveformData(data);
    } catch {
      if (!cancelled) setWaveformData([]);
    }
    return () => { cancelled = true; };
  }, [decryptedAudioUri]);

  useEffect(() => {
    const unsub = navigation.addListener("blur", () => {
      if (status.playing) player.pause();
    });
    return unsub;
  }, [navigation, player, status.playing]);

  useEffect(() => {
    if (status.didJustFinish) player.seekTo(0);
  }, [status.didJustFinish]);

  const handleSeek = useCallback((fraction: number) => {
    if (!status.isLoaded || !status.duration) return;
    player.seekTo(fraction * status.duration);
  }, [status.isLoaded, status.duration, player]);

  const currentText = record?.status === "done" ? editableText : record?.text;

  const copyText = useCallback(() => {
    if (currentText) copyWithTimer(currentText);
  }, [currentText, copyWithTimer]);

  const startEditing = useCallback(() => setEditing(true), []);

  const saveEditing = useCallback(() => {
    flush();
    setEditing(false);
  }, [flush]);

  const cancelEditing = useCallback(() => {
    init(record?.text || "");
    setEditing(false);
  }, [init, record?.text]);

  // Transcription handler
  const handleTranscribe = useCallback(() => {
    if (record?.id) openForEntry(record.id);
  }, [record?.id, openForEntry]);

  const onTranscribeConfirm = useCallback(async () => {
    closeEngineDialog();
    if (!engineTargetId) return;
    const result: any = await startTranscription(engineTargetId, engineChoice);
    if (!result.started) setSnackbar(result.message);
    else if (result.error) setSnackbar(result.error);
  }, [engineTargetId, engineChoice, startTranscription, closeEngineDialog, setSnackbar]);

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
        {record.status === "done" && record.text ? (
          <View style={[styles.transcriptionCard, elevation.md]}>
            <View style={styles.transcriptionHeader}>
              <Text style={typography.monoLabel as any}>{t("entry.transcription")}</Text>
              <View style={styles.headerIcons}>
                {editing ? (
                  <>
                    <TouchableOpacity onPress={cancelEditing} hitSlop={8}>
                      <MaterialCommunityIcons name="close" size={20} color={colors.danger} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={saveEditing} hitSlop={8}>
                      <MaterialCommunityIcons name="check" size={20} color={colors.success} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity onPress={startEditing} hitSlop={8}>
                      <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.muted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={copyText} hitSlop={8}>
                      <MaterialCommunityIcons name="content-copy" size={18} color={colors.muted} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
            {editing ? (
              <TextInput
                style={styles.bodyText}
                multiline
                scrollEnabled={false}
                value={editableText}
                onChangeText={handleTextChange}
                autoFocus
              />
            ) : (
              <Text style={styles.bodyText} selectable>{editableText}</Text>
            )}
          </View>
        ) : record.text ? (
          <View style={[styles.transcriptionCard, elevation.md]}>
            <View style={styles.transcriptionHeader}>
              <Text style={typography.monoLabel as any}>{t("entry.transcription")}</Text>
              <TouchableOpacity onPress={copyText} hitSlop={8}>
                <MaterialCommunityIcons name="content-copy" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.bodyText} selectable>{record.text}</Text>
          </View>
        ) : record.status === "processing" ? (
          <View style={[styles.transcriptionCard, elevation.md]}>
            <Text style={[typography.monoLabel as any, { marginBottom: spacing.md }]}>{t("entry.transcription")}</Text>
            <View style={{ alignItems: "center", paddingVertical: spacing.xl }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[typography.caption, { color: colors.muted, marginTop: spacing.sm }]}>{t("entry.statusProcessing")}</Text>
            </View>
          </View>
        ) : (
          <TranscribeCTA onPress={handleTranscribe} />
        )}
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
          <WaveformPlayer
            amplitudes={waveformData}
            progress={status.isLoaded && status.duration ? status.currentTime / status.duration : 0}
            onSeek={handleSeek}
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatPlaybackTime(status.currentTime)}</Text>
            <Text style={styles.timeText}>{formatPlaybackTime(status.duration)}</Text>
          </View>
          <View style={styles.controls}>
            <TouchableOpacity
              onPress={() => player.seekTo(Math.max(0, status.currentTime - 10))}
              disabled={!status.isLoaded}
              style={[styles.skipBtn, elevation.sm]}
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
              style={[styles.skipBtn, elevation.sm]}
            >
              <MaterialCommunityIcons name="fast-forward-10" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Portal>
        <EngineChoiceDialog
          visible={engineDialogVisible}
          onDismiss={closeEngineDialog}
          onConfirm={onTranscribeConfirm}
          engineChoice={engineChoice}
          onEngineChange={setEngineChoice}
          title={undefined}
          navigation={navigation}
        />
        <ModelDownloadDialog
          visible={modelDownload.visible}
          progress={modelDownload.progress}
        />
      </Portal>

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
    borderRadius: radii.xl,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
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
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  playFab: {
    backgroundColor: colors.danger,
    width: 58,
    height: 58,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  textScroll: { flex: 1, backgroundColor: colors.background },
  textContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: 6, flexGrow: 1 },
  transcriptionCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    flex: 1,
  },
  bodyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.foreground,
    lineHeight: 24,
  },
  transcriptionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
});
