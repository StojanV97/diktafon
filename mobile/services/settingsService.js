import AsyncStorage from "@react-native-async-storage/async-storage"

const SCHEMA = {
  defaultEngine: {
    key: "default_transcription_engine",
    default: "local",
    parse: (v) => (v === "assemblyai" ? "assemblyai" : "local"),
    serialize: (v) => v,
  },
  autoMoveFolderId: {
    key: "daily_log_auto_move_folder_id",
    default: null,
    parse: (v) => v || null,
    serialize: (v) => v,
  },
  autoMoveFolderName: {
    key: "daily_log_auto_move_folder_name",
    default: "",
    parse: (v) => v || "",
    serialize: (v) => v,
  },
  autoMoveKeepAudio: {
    key: "daily_log_auto_move_keep_audio",
    default: false,
    parse: (v) => v === "true",
    serialize: (v) => (v ? "true" : "false"),
  },
  icloudSyncEnabled: {
    key: "icloud_sync_enabled",
    default: false,
    parse: (v) => v === "true",
    serialize: (v) => (v ? "true" : "false"),
  },
  googleDriveSyncEnabled: {
    key: "google_drive_sync_enabled",
    default: false,
    parse: (v) => v === "true",
    serialize: (v) => (v ? "true" : "false"),
  },
  googleDriveEmail: {
    key: "google_drive_email",
    default: "",
    parse: (v) => v || "",
    serialize: (v) => v,
  },
}

const NAMES = Object.keys(SCHEMA)
const KEYS = NAMES.map((name) => SCHEMA[name].key)

export async function getSettings() {
  const pairs = await AsyncStorage.multiGet(KEYS)
  const result = {}
  for (let i = 0; i < NAMES.length; i++) {
    const name = NAMES[i]
    const raw = pairs[i][1]
    result[name] = raw === null ? SCHEMA[name].default : SCHEMA[name].parse(raw)
  }
  return result
}

export async function updateSettings(patch) {
  const toSet = []
  const toRemove = []
  for (const [name, value] of Object.entries(patch)) {
    const schema = SCHEMA[name]
    if (!schema) throw new Error(`Unknown setting: ${name}`)
    if (value === null || value === undefined) {
      toRemove.push(schema.key)
    } else {
      toSet.push([schema.key, schema.serialize(value)])
    }
  }
  if (toSet.length > 0) await AsyncStorage.multiSet(toSet)
  if (toRemove.length > 0) await AsyncStorage.multiRemove(toRemove)
  return getSettings()
}
