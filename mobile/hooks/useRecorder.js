import { useEffect, useState } from "react";
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  IOSOutputFormat,
  AudioQuality,
  setAudioModeAsync,
} from "expo-audio";

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
  const [meteringHistory, setMeteringHistory] = useState([]);

  useEffect(() => {
    if (recorderState.isRecording) {
      setMeteringHistory((prev) => {
        const next = [...prev, recorderState.metering ?? -160];
        return next.length > 40 ? next.slice(next.length - 40) : next;
      });
    }
  }, [recorderState.metering, recorderState.isRecording]);

  const startRecording = async () => {
    const status = await AudioModule.requestRecordingPermissionsAsync();
    if (!status.granted) {
      throw new Error("Potrebna je dozvola za mikrofon.");
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await audioRecorder.prepareToRecordAsync();
    const recStatus = audioRecorder.getStatus();
    if (!recStatus.canRecord) {
      throw new Error("Snimac nije spreman.");
    }
    audioRecorder.record();
    setIsPaused(false);
  };

  const pauseRecording = async () => {
    await audioRecorder.pause();
    setIsPaused(true);
  };

  const resumeRecording = async () => {
    audioRecorder.record();
    setIsPaused(false);
  };

  const stopRecording = async () => {
    const elapsed = recorderState.durationMillis ?? 0;
    await audioRecorder.stop();
    setIsPaused(false);
    setMeteringHistory([]);
    await setAudioModeAsync({ allowsRecording: false });

    const uri = audioRecorder.uri;
    if (!uri) return;

    const now = new Date();
    const filename = `zapis_${now.toISOString().slice(0, 19).replace(/[T:]/g, "-")}.wav`;
    const durationSeconds = Math.floor(elapsed / 1000);
    await onRecordingComplete(uri, durationSeconds, filename);
  };

  return {
    isRecording: recorderState.isRecording,
    isPaused,
    elapsed: recorderState.durationMillis ?? 0,
    meteringHistory,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  };
}
