import { BASE_URL, request, parseErrorMessage } from "./api";

const UPLOAD_TIMEOUT_MS = 120_000; // 2 min — audio uploads can be large

// ── Folders ─────────────────────────────────────────────

export async function createFolder(name, engine = "local") {
  return request("/journal/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, engine }),
  });
}

export async function fetchFolders() {
  return request("/journal/folders");
}

export async function renameFolder(id, name) {
  return request(`/journal/folders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export async function deleteFolder(id) {
  return request(`/journal/folders/${id}`, { method: "DELETE" });
}

// ── Entries ─────────────────────────────────────────────

export async function uploadEntry(folderId, fileUri, filename, mimeType) {
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    name: filename,
    type: mimeType || "audio/m4a",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/journal/folders/${folderId}/entries`, {
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

export async function fetchEntries(folderId) {
  return request(`/journal/folders/${folderId}/entries`);
}

export async function fetchEntry(entryId) {
  return request(`/journal/entries/${entryId}`);
}

export async function deleteEntry(entryId) {
  return request(`/journal/entries/${entryId}`, { method: "DELETE" });
}

export async function transcribeEntry(entryId) {
  return request(`/journal/entries/${entryId}/transcribe`, { method: "POST" });
}
