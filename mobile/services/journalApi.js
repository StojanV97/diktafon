import { BASE_URL, parseErrorMessage } from "./api";

const UPLOAD_TIMEOUT_MS = 120_000;

export async function transcribeLocal(fileUri, filename) {
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    name: filename,
    type: "audio/m4a",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/transcribe?segment=true`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(parseErrorMessage(res.status, body));
    }
    return res.json();
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Upload timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function submitAssemblyAI(fileUri, filename) {
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    name: filename,
    type: "audio/m4a",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/transcribe/assemblyai/submit`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(parseErrorMessage(res.status, body));
    }
    return res.json();
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Upload timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkAssemblyAI(assemblyaiId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${BASE_URL}/transcribe/assemblyai/status/${assemblyaiId}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(parseErrorMessage(res.status, body));
    }
    return res.json();
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Request timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
