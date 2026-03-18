/**
 * Tests for updateEntryText in journalStorage.
 *
 * We mock expo-file-system at the module level so journalStorage
 * works against in-memory data rather than real disk I/O.
 */

// ── Module mocks for transitive dependencies ─────────
jest.mock("@react-native-async-storage/async-storage", () => ({
  multiGet: jest.fn().mockResolvedValue([]),
  multiSet: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
}))
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }))
jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}))

// ── In-memory filesystem stub ──────────────────────────
// Variables prefixed with "mock" are allowed inside jest.mock() factory
const mockFiles = {} // path → content string
const mockDirs = new Set()

jest.mock("expo-file-system", () => {
  class MockFile {
    constructor(...segments) {
      const parts = segments.map((s) =>
        typeof s === "string" ? s : s?._path ?? ""
      )
      this._path = parts.join("/").replace(/\/+/g, "/")
    }
    get uri() { return "file://" + this._path }
    get name() { return this._path.split("/").pop() }
    get parentDirectory() {
      const parent = this._path.replace(/\/[^/]+$/, "")
      return new MockFile(parent)
    }
    get exists() { return this._path in mockFiles }
    write(content) { mockFiles[this._path] = typeof content === "string" ? content : JSON.stringify(content) }
    async text() { return mockFiles[this._path] }
    delete() { delete mockFiles[this._path] }
    copy(dest) { mockFiles[dest._path] = mockFiles[this._path] }
    move(dest) { mockFiles[dest._path] = mockFiles[this._path]; delete mockFiles[this._path] }
    bytes() { return mockFiles[this._path] }
  }

  class MockDirectory {
    constructor(...segments) {
      const parts = segments.map((s) =>
        typeof s === "string" ? s : s?._path ?? ""
      )
      this._path = parts.join("/").replace(/\/+/g, "/")
    }
    create() { mockDirs.add(this._path) }
  }

  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: "/mock-docs" },
  }
})

// ── Helpers ────────────────────────────────────────────
function seedEntries(entries) {
  const path = "/mock-docs/journal/entries.json"
  mockFiles[path] = JSON.stringify(entries)
}

function readEntriesJSON() {
  const path = "/mock-docs/journal/entries.json"
  return JSON.parse(mockFiles[path])
}

function readTextFile(entryId) {
  const path = `/mock-docs/journal/texts/journal_${entryId}.txt`
  return mockFiles[path]
}

// ── Tests ──────────────────────────────────────────────
const { updateEntryText } = require("../journalStorage")

beforeEach(() => {
  for (const key in mockFiles) delete mockFiles[key]
  mockDirs.clear()
})

describe("updateEntryText", () => {
  const baseEntry = {
    id: "entry-1",
    folder_id: "folder-1",
    filename: "rec.wav",
    text: "old truncated",
    created_at: "2026-01-01T00:00:00.000Z",
    duration_seconds: 42,
    status: "done",
    audio_file: "entry-1.wav",
  }

  test("updates .txt file and returns entry with full text", async () => {
    seedEntries([{ ...baseEntry }])
    const result = await updateEntryText("entry-1", "New full text here")

    expect(readTextFile("entry-1")).toBe("New full text here")
    expect(result.text).toBe("New full text here")
    expect(result.id).toBe("entry-1")
  })

  test("truncates text in JSON metadata for entries > 200 chars", async () => {
    seedEntries([{ ...baseEntry }])
    const longText = "A".repeat(250)
    await updateEntryText("entry-1", longText)

    const stored = readEntriesJSON()
    const entry = stored.find((e) => e.id === "entry-1")
    expect(entry.text).toBe("A".repeat(200) + "...")
    expect(entry.text.length).toBe(203)
  })

  test("returns null for non-existent entry ID", async () => {
    seedEntries([{ ...baseEntry }])
    const result = await updateEntryText("non-existent", "some text")
    expect(result).toBeNull()
  })

  test("preserves all other fields", async () => {
    seedEntries([{ ...baseEntry }])
    const result = await updateEntryText("entry-1", "updated")

    expect(result.status).toBe("done")
    expect(result.filename).toBe("rec.wav")
    expect(result.duration_seconds).toBe(42)
    expect(result.folder_id).toBe("folder-1")
    expect(result.audio_file).toBe("entry-1.wav")
  })
})
