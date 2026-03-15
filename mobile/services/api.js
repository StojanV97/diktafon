// ============================================================
// CONFIGURE THIS: replace with your computer's local IP address
// Find it with: ifconfig | grep "inet " (Mac/Linux)
//               ipconfig (Windows)
// ============================================================
export const BASE_URL = "http://192.168.0.10:8000";

export async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function uploadAndTranscribe(fileUri, filename, mimeType, onProgress) {
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    name: filename,
    type: mimeType || "audio/mpeg",
  });

  // fetch doesn't support progress natively in RN; onProgress is called at start/end
  onProgress?.(0.05);

  const res = await fetch(`${BASE_URL}/transcribe`, {
    method: "POST",
    body: formData,
  });

  onProgress?.(1.0);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Transcription failed (${res.status}): ${body}`);
  }
  return res.json();
}

export async function fetchTranscriptions() {
  return request("/transcriptions");
}

export async function fetchTranscription(id) {
  return request(`/transcriptions/${id}`);
}

export async function deleteTranscription(id) {
  return request(`/transcriptions/${id}`, { method: "DELETE" });
}

export function downloadUrl(id) {
  return `${BASE_URL}/transcriptions/${id}/download`;
}
