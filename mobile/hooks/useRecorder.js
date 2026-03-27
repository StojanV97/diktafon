import { useEffect, useRef, useState } from "react";
import { Alert, Linking } from "react-native";
import { t } from "../src/i18n";
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  IOSOutputFormat,
  AudioQuality,
  setAudioModeAsync,
} from "expo-audio";
import * as FileSystem from "expo-file-system";
import { setRecordingGuard } from "../src/utils/recordingGuard";

const WHISPER_RECORDING_OPTIONS = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  android: {
    outputFormat: 'default',
    audioEncoder: 'default',
  },
  ios: {
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MAX,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/wav',
    bitsPerSecond: 256000,
  },
};

export function useRecorder({ onRecordingComplete }) {
  const audioRecorder = useAudioRecorder({
    ...WHISPER_RECORDING_OPTIONS,
    isMeteringEnabled: true,
  });
  const recorderState = useAudioRecorderState(audioRecorder, 100);
  const [isPaused, setIsPaused] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const meteringBuffer = useRef([]);
  const [meteringHistory, setMeteringHistory] = useState([]);

  const isSessionActiveRef = useRef(false);
  isSessionActiveRef.current = isSessionActive;

  const cancelRecordingRef = useRef(null);

  // Sync recording guard for tab-switch protection
  useEffect(() => {
    if (isSessionActive) {
      setRecordingGuard(true, async () => {
        await cancelRecordingRef.current?.();
      });
    } else {
      setRecordingGuard(false, null);
    }
    return () => setRecordingGuard(false, null);
  }, [isSessionActive]);

  // Cleanup on unmount: stop recording + release audio mode
  useEffect(() => {
    return () => {
      if (isSessionActiveRef.current) {
        audioRecorder.stop().catch(() => {});
        setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    if (recorderState.isRecording) {
      const buf = meteringBuffer.current;
      if (buf.length >= 100) buf.shift();
      buf.push(recorderState.metering ?? -160);
      setMeteringHistory([...buf]);
    }
  }, [recorderState.metering, recorderState.isRecording]);

  const startRecording = async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) {
      Alert.alert(
        t('recording.micPermissionTitle'),
        t('recording.micPermissionMessage'),
        [
          { text: t('common.cancel'), style: "cancel" },
          { text: t('recording.openSettings'), onPress: () => Linking.openSettings() },
        ]
      );
      return { started: false, reason: "permission_denied" };
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await audioRecorder.prepareToRecordAsync();
    const recStatus = audioRecorder.getStatus();
    if (!recStatus.canRecord) {
      throw new Error(t('recording.recorderNotReady'));
    }
    audioRecorder.record();
    setIsSessionActive(true);
    setIsPaused(false);
    return { started: true };
  };

  const pauseRecording = async () => {
    // Set paused BEFORE stopping recorder so isActiveSession stays true
    // (isRecording becomes false when recorder pauses)
    setIsPaused(true);
    try {
      await audioRecorder.pause();
    } catch (e) {
      setIsPaused(false);
      throw e;
    }
  };

  const resumeRecording = async () => {
    try {
      audioRecorder.record();
      setIsPaused(false);
    } catch (e) {
      throw e;
    }
  };

  const stopRecording = async () => {
    const elapsed = recorderState.durationMillis ?? 0;
    await audioRecorder.stop();
    setIsSessionActive(false);
    setIsPaused(false);
    meteringBuffer.current = [];
    setMeteringHistory([]);
    await setAudioModeAsync({ allowsRecording: false });

    const uri = audioRecorder.uri;
    if (!uri) return;

    const now = new Date();
    const filename = `zapis_${now.toISOString().slice(0, 19).replace(/[T:]/g, "-")}.wav`;
    const durationSeconds = Math.floor(elapsed / 1000);
    await onRecordingComplete(uri, durationSeconds, filename);
  };

  const cancelRecording = async () => {
    await audioRecorder.stop();
    setIsSessionActive(false);
    setIsPaused(false);
    meteringBuffer.current = [];
    setMeteringHistory([]);
    await setAudioModeAsync({ allowsRecording: false });
    // Delete the orphaned audio file
    const uri = audioRecorder.uri;
    if (uri) {
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  };

  cancelRecordingRef.current = cancelRecording;

  return {
    isRecording: recorderState.isRecording,
    isPaused,
    isSessionActive,
    elapsed: recorderState.durationMillis ?? 0,
    meteringHistory,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
  };
}
