import { initWhisper } from "whisper.rn";
import { File, Directory, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import crypto from "react-native-quick-crypto";
import { t } from "../src/i18n";

const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin";

const SERBIAN_PROMPT =
  "Ovo je transkript na srpskom jeziku. " +
  "Koristi pravilnu srpsku gramatiku, interpunkciju i dijakritičke znakove: č, ć, š, ž, đ. " +
  "Rečenice završavaj tačkom. Imena piši velikim slovom.";

// SHA256 of official ggml-small.bin from huggingface.co/ggerganov/whisper.cpp
const MODEL_SHA256 = "be8ef2d6de21e69e5e7a5534c68be79ece36ed3367a0950f4ebac7ea1d577735";

const modelsDir = new Directory(Paths.document, "whisper-models");
const modelFile = new File(modelsDir, "ggml-small.bin");

let whisperContext = null;

export function getModelStatus() {
  const exists = modelFile.exists;
  return {
    downloaded: exists,
    downloading: false,
    progress: exists ? 1 : 0,
    sizeBytes: exists ? modelFile.size : 0,
  };
}

const MIN_MODEL_SIZE = 140 * 1024 * 1024; // 140MB minimum for ggml-small

export async function downloadModel(onProgress) {
  modelsDir.create({ idempotent: true });

  // Download to temp file — keeps existing model intact if download fails
  const tempFile = new File(modelsDir, "ggml-small.bin.tmp")
  if (tempFile.exists) tempFile.delete()

  const downloadResumable = FileSystem.createDownloadResumable(
    MODEL_URL,
    tempFile.uri,
    {},
    (downloadProgress) => {
      const progress =
        downloadProgress.totalBytesWritten /
        downloadProgress.totalBytesExpectedToWrite;
      onProgress?.(progress);
    }
  );

  await downloadResumable.downloadAsync();

  // Validate — detect interrupted/partial downloads
  if (!tempFile.exists || tempFile.size < MIN_MODEL_SIZE) {
    if (tempFile.exists) tempFile.delete()
    throw new Error(t('whisper.downloadIncomplete'));
  }

  // Verify integrity — reject tampered or corrupted downloads
  const fileBytes = tempFile.bytes();
  const hash = crypto.createHash("sha256").update(Buffer.from(fileBytes)).digest("hex");
  if (hash !== MODEL_SHA256) {
    tempFile.delete();
    throw new Error(t('whisper.integrityFailed'));
  }

  // Atomic swap: delete old model only after successful download
  if (modelFile.exists) modelFile.delete()
  tempFile.move(modelFile)

  return modelFile.uri;
}

export function deleteModel() {
  if (whisperContext) {
    whisperContext.release();
    whisperContext = null;
  }
  if (modelFile.exists) {
    modelFile.delete();
  }
}

export async function transcribe(audioFileUri, onProgress) {
  if (!modelFile.exists) {
    throw new Error(t('whisper.modelNotDownloaded'));
  }

  if (!whisperContext) {
    whisperContext = await initWhisper({
      filePath: modelFile.uri,
    });
  }

  try {
    const { promise } = whisperContext.transcribe(audioFileUri, {
      language: "sr",
      prompt: SERBIAN_PROMPT,
      onProgress: (progress) => {
        onProgress?.(progress / 100);
      },
    });

    const result = await promise;

    return {
      text: (result.result || "").trim(),
      duration_seconds: Math.round((result.segments?.slice(-1)[0]?.t1 || 0) / 100),
    };
  } catch (e) {
    // Release corrupted context so it's re-initialized on next attempt
    try { whisperContext.release(); } catch {}
    whisperContext = null;
    throw e;
  }
}

export function releaseContext() {
  if (whisperContext) {
    whisperContext.release();
    whisperContext = null;
  }
}
