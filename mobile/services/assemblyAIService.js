import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";

const API_BASE = "https://api.assemblyai.com/v2";
const STORE_KEY = "assemblyai_api_key";

const STATUS_TIMEOUT_MS = 30_000;

// ── API Key Management ──────────────────────────────────

export async function getApiKey() {
  return SecureStore.getItemAsync(STORE_KEY);
}

export async function setApiKey(key) {
  await SecureStore.setItemAsync(STORE_KEY, key);
}

export async function removeApiKey() {
  await SecureStore.deleteItemAsync(STORE_KEY);
}

export async function hasApiKey() {
  const key = await getApiKey();
  return !!(key && key.trim().length > 0);
}

// ── Transcription ───────────────────────────────────────

async function getKeyOrThrow() {
  const key = await getApiKey();
  if (key && key.trim()) return key.trim();
  throw new Error("ASSEMBLYAI_KEY_MISSING");
}

export async function submitAndGetId(fileUri, options = {}) {
  const apiKey = await getKeyOrThrow();

  // Step 1: Upload audio to AssemblyAI
  const uploadResult = await FileSystem.uploadAsync(
    `${API_BASE}/upload`,
    fileUri,
    {
      httpMethod: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/octet-stream",
      },
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    }
  );

  if (uploadResult.status !== 200) {
    throw new Error(`Upload failed (${uploadResult.status}): ${uploadResult.body}`);
  }

  const { upload_url } = JSON.parse(uploadResult.body);

  // Step 2: Create transcription job
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/transcript`, {
      method: "POST",
      headers: {
        authorization: apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_url: upload_url,
        speech_models: ["universal-2", "universal-3-pro"],
        language_code: "sr",
        speaker_labels: options.speakerLabels ?? true,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Transcript creation failed (${res.status}): ${body}`);
    }

    const data = await res.json();
    return { assemblyai_id: data.id };
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Request timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkTranscript(transcriptId) {
  const apiKey = await getKeyOrThrow();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/transcript/${transcriptId}`, {
      headers: { authorization: apiKey },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Status check failed (${res.status}): ${body}`);
    }

    const data = await res.json();

    if (data.status === "completed") {
      const text = formatUtterances(data);
      const duration_seconds = Math.round(data.audio_duration || 0);
      return { status: "done", text, duration_seconds };
    }

    if (data.status === "error") {
      return { status: "error", error: data.error || "Unknown AssemblyAI error" };
    }

    // queued or processing
    return { status: "processing" };
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Request timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── Speaker Formatting ──────────────────────────────────

function formatUtterances(data) {
  if (!data.utterances || data.utterances.length === 0) {
    return data.text || "";
  }

  return data.utterances
    .map((u) => {
      const startSec = (u.start || 0) / 1000;
      const m = Math.floor(startSec / 60);
      const s = Math.floor(startSec % 60);
      const timestamp = `${m}:${s.toString().padStart(2, "0")}`;
      return `[Govornik ${u.speaker} – ${timestamp}] ${u.text}`;
    })
    .join("\n");
}
