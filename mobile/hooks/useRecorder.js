import { useEffect, useState } from "react";
import {
  useAudioRecorder,
  useAudioRecorderState,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from "expo-audio";

export function useRecorder({ onRecordingComplete }) {
  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
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
    const filename = `zapis_${now.toISOString().slice(0, 19).replace(/[T:]/g, "-")}.m4a`;
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
