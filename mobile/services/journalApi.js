import { BASE_URL, request } from "./api";

// ── Folders ─────────────────────────────────────────────

export async function createFolder(name) {
  return request("/journal/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
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

  const res = await fetch(`${BASE_URL}/journal/folders/${folderId}/entries`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upload failed (${res.status}): ${body}`);
  }
  return res.json();
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
