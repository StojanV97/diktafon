export type EntryStatus = "recorded" | "processing" | "error" | "done";

export type RecordingType = "beleshka" | "razgovor";

export interface Folder {
  id: string;
  name: string;
  color: string;
  tags: string[];
  is_daily_log?: boolean;
  deleted_locally?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Entry {
  id: string;
  folder_id: string;
  filename: string;
  status: EntryStatus;
  text: string;
  duration_seconds: number;
  recording_type: RecordingType;
  recorded_date: string;
  assemblyai_id?: string;
  encrypted?: boolean;
  deleted_locally?: boolean;
  created_at: string;
  updated_at: string;
}

export interface DailyLogStats {
  clipCount: number;
  totalDuration: number;
  latestTimestamp: string | null;
}

export interface TranscriptionResult {
  text: string;
  duration_seconds: number;
}

export interface Settings {
  defaultEngine: "local" | "cloud";
  autoMoveFolderId: string | null;
  autoMoveFolderName: string;
  autoMoveKeepAudio: boolean;
  icloudSyncEnabled: boolean;
}

export interface StatusConfig {
  label: string;
  icon: string;
  bg: string;
  fg: string;
}
