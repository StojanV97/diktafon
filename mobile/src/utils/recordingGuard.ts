type RecordingGuard = {
  isActive: boolean;
  cancelRecording: (() => Promise<void>) | null;
};

export const recordingGuard: { current: RecordingGuard } = {
  current: {
    isActive: false,
    cancelRecording: null,
  },
};

export function setRecordingGuard(
  isActive: boolean,
  cancelRecording: (() => Promise<void>) | null
) {
  recordingGuard.current = { isActive, cancelRecording };
}
