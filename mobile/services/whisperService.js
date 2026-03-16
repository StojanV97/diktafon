import { initWhisper } from "whisper.rn";
import { File, Directory, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system";

const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";

const SERBIAN_PROMPT =
  "Ovo je transkript na srpskom jeziku. " +
  "Koristi pravilnu srpsku gramatiku, interpunkciju i dijakritičke znakove: č, ć, š, ž, đ. " +
  "Rečenice završavaj tačkom. Imena piši velikim slovom.";

const modelsDir = new Directory(Paths.document, "whisper-models");
const modelFile = new File(modelsDir, "ggml-base.bin");

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

export async function downloadModel(onProgress) {
  modelsDir.create({ idempotent: true });

  const downloadResumable = FileSystem.createDownloadResumable(
    MODEL_URL,
    modelFile.uri,
    {},
    (downloadProgress) => {
      const progress =
        downloadProgress.totalBytesWritten /
        downloadProgress.totalBytesExpectedToWrite;
      onProgress?.(progress);
    }
  );

  const result = await downloadResumable.downloadAsync();
  return result.uri;
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
    throw new Error("Whisper model nije preuzet. Preuzmi ga u Podesavanjima.");
  }

  if (!whisperContext) {
    whisperContext = await initWhisper({
      filePath: modelFile.uri,
    });
  }

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
}

export function releaseContext() {
  if (whisperContext) {
    whisperContext.release();
    whisperContext = null;
  }
}
