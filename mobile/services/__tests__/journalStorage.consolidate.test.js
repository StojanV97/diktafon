/**
 * Tests for consolidateDailyLogEntries — the behavior where
 * successfully transcribed daily log entries are merged into
 * a single combined entry and the originals are removed.
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

// ── Mock expo-file-system ──────────────────────────────────
const mockFiles = {}

const MockFile = jest.fn().mockImplementation((...pathParts) => {
  // Build path from parts (Directory objects have .uri, strings are literal)
  const parts = pathParts.map((p) =>
    typeof p === "object" && p.uri ? p.uri : String(p)
  )
  const uri = parts.join("/")
  return {
    uri,
    get exists() {
      return uri in mockFiles
    },
    text: jest.fn(async () => mockFiles[uri] ?? ""),
    write: jest.fn((content) => {
      mockFiles[uri] = content
    }),
    delete: jest.fn(() => {
      delete mockFiles[uri]
    }),
    copy: jest.fn((dest) => {
      mockFiles[dest.uri] = mockFiles[uri]
    }),
    move: jest.fn((dest) => {
      mockFiles[dest.uri] = mockFiles[uri]
      delete mockFiles[uri]
    }),
  }
})

const MockDirectory = jest.fn().mockImplementation((...pathParts) => {
  const parts = pathParts.map((p) =>
    typeof p === "object" && p.uri ? p.uri : String(p)
  )
  return {
    uri: parts.join("/"),
    create: jest.fn(),
  }
})

jest.mock("expo-file-system", () => ({
  File: MockFile,
  Directory: MockDirectory,
  Paths: { document: { uri: "/mock-docs" } },
}))

// ── Helpers ────────────────────────────────────────────────

function clearMockFiles() {
  for (const key of Object.keys(mockFiles)) delete mockFiles[key]
}

function seedEntries(entries) {
  const uri = "/mock-docs/journal/entries.json"
  mockFiles[uri] = JSON.stringify(entries)
}

function seedFolders(folders) {
  const uri = "/mock-docs/journal/folders.json"
  mockFiles[uri] = JSON.stringify(folders)
}

function seedTextFile(entryId, text) {
  mockFiles[`/mock-docs/journal/texts/journal_${entryId}.txt`] = text
}

function seedAudioFile(entryId) {
  mockFiles[`/mock-docs/journal/audio/${entryId}.wav`] = "<audio>"
}

function readEntries() {
  const raw = mockFiles["/mock-docs/journal/entries.json"]
  return raw ? JSON.parse(raw) : []
}

// ── Tests ──────────────────────────────────────────────────

const DAILY_FOLDER = {
  id: "daily-folder-1",
  name: "Dnevni Log",
  color: "#1E90FF",
  tags: [],
  is_daily_log: true,
  created_at: "2026-03-18T08:00:00.000Z",
}

function makeEntry(overrides) {
  return {
    id: overrides.id || "entry-1",
    folder_id: DAILY_FOLDER.id,
    filename: "zapis.wav",
    text: overrides.text || "",
    created_at: overrides.created_at || "2026-03-18T09:00:00.000Z",
    duration_seconds: overrides.duration_seconds || 30,
    status: overrides.status || "done",
    audio_file: `${overrides.id || "entry-1"}.wav`,
    recorded_date: overrides.recorded_date || "2026-03-18",
  }
}

let consolidateDailyLogEntries

beforeEach(() => {
  clearMockFiles()
  // Reset module cache so each test gets fresh state
  jest.resetModules()
  jest.mock("expo-file-system", () => ({
    File: MockFile,
    Directory: MockDirectory,
    Paths: { document: { uri: "/mock-docs" } },
  }))
  const storage = require("../journalStorage")
  consolidateDailyLogEntries = storage.consolidateDailyLogEntries
})

describe("consolidateDailyLogEntries", () => {
  test("combines done entries into a single new entry and deletes originals", async () => {
    // Use local-time ISO strings (no Z) so getHours() matches expectations
    const entry1 = makeEntry({
      id: "e1",
      created_at: "2026-03-18T09:00:00.000",
      text: "truncated...",
      duration_seconds: 30,
    })
    const entry2 = makeEntry({
      id: "e2",
      created_at: "2026-03-18T10:30:00.000",
      text: "truncated...",
      duration_seconds: 45,
    })

    seedFolders([DAILY_FOLDER])
    seedEntries([entry2, entry1]) // reverse chrono in storage
    seedTextFile("e1", "Ovo je prvi transkript.")
    seedTextFile("e2", "Ovo je drugi transkript.")
    seedAudioFile("e1")
    seedAudioFile("e2")

    const result = await consolidateDailyLogEntries("2026-03-18")

    // Should return the new combined entry
    expect(result).not.toBeNull()
    expect(result.status).toBe("done")
    expect(result.folder_id).toBe(DAILY_FOLDER.id)
    expect(result.recorded_date).toBe("2026-03-18")

    // Combined text should have timestamps and both transcripts
    const combinedTextFile =
      mockFiles[`/mock-docs/journal/texts/journal_${result.id}.txt`]
    expect(combinedTextFile).toContain("[09:00]")
    expect(combinedTextFile).toContain("Ovo je prvi transkript.")
    expect(combinedTextFile).toContain("[10:30]")
    expect(combinedTextFile).toContain("Ovo je drugi transkript.")

    // Original entries should be gone from entries.json
    const entries = readEntries()
    expect(entries.find((e) => e.id === "e1")).toBeUndefined()
    expect(entries.find((e) => e.id === "e2")).toBeUndefined()

    // New combined entry should exist
    expect(entries.find((e) => e.id === result.id)).toBeDefined()

    // Original audio and text files should be deleted
    expect(mockFiles["/mock-docs/journal/audio/e1.wav"]).toBeUndefined()
    expect(mockFiles["/mock-docs/journal/audio/e2.wav"]).toBeUndefined()
    expect(mockFiles["/mock-docs/journal/texts/journal_e1.txt"]).toBeUndefined()
    expect(mockFiles["/mock-docs/journal/texts/journal_e2.txt"]).toBeUndefined()
  })

  test("only removes done entries, keeps error and recorded entries", async () => {
    const doneEntry = makeEntry({
      id: "done1",
      created_at: "2026-03-18T09:00:00.000Z",
      status: "done",
    })
    const errorEntry = makeEntry({
      id: "err1",
      created_at: "2026-03-18T10:00:00.000Z",
      status: "error",
    })
    const recordedEntry = makeEntry({
      id: "rec1",
      created_at: "2026-03-18T11:00:00.000Z",
      status: "recorded",
    })

    seedFolders([DAILY_FOLDER])
    seedEntries([recordedEntry, errorEntry, doneEntry])
    seedTextFile("done1", "Transkript koji je uspeo.")
    seedAudioFile("done1")
    seedAudioFile("err1")
    seedAudioFile("rec1")

    const result = await consolidateDailyLogEntries("2026-03-18")

    expect(result).not.toBeNull()

    const entries = readEntries()
    // Done entry removed
    expect(entries.find((e) => e.id === "done1")).toBeUndefined()
    // Error and recorded entries kept
    expect(entries.find((e) => e.id === "err1")).toBeDefined()
    expect(entries.find((e) => e.id === "rec1")).toBeDefined()
    // Combined entry added
    expect(entries.find((e) => e.id === result.id)).toBeDefined()
  })

  test("returns null when no done entries exist for the date", async () => {
    const recordedEntry = makeEntry({
      id: "rec1",
      status: "recorded",
    })

    seedFolders([DAILY_FOLDER])
    seedEntries([recordedEntry])

    const result = await consolidateDailyLogEntries("2026-03-18")

    expect(result).toBeNull()

    // Nothing should be deleted
    const entries = readEntries()
    expect(entries).toHaveLength(1)
  })

  test("sums duration from all consolidated entries", async () => {
    const entry1 = makeEntry({
      id: "e1",
      created_at: "2026-03-18T09:00:00.000",
      duration_seconds: 30,
    })
    const entry2 = makeEntry({
      id: "e2",
      created_at: "2026-03-18T10:00:00.000",
      duration_seconds: 45,
    })

    seedFolders([DAILY_FOLDER])
    seedEntries([entry2, entry1])
    seedTextFile("e1", "A")
    seedTextFile("e2", "B")

    const result = await consolidateDailyLogEntries("2026-03-18")

    expect(result.duration_seconds).toBe(75)
  })

  test("does not consolidate entries from other dates", async () => {
    const todayEntry = makeEntry({
      id: "today1",
      created_at: "2026-03-18T09:00:00.000Z",
      recorded_date: "2026-03-18",
    })
    const yesterdayEntry = makeEntry({
      id: "yesterday1",
      created_at: "2026-03-17T09:00:00.000Z",
      recorded_date: "2026-03-17",
    })

    seedFolders([DAILY_FOLDER])
    seedEntries([todayEntry, yesterdayEntry])
    seedTextFile("today1", "Danas.")
    seedTextFile("yesterday1", "Juce.")
    seedAudioFile("today1")
    seedAudioFile("yesterday1")

    await consolidateDailyLogEntries("2026-03-18")

    const entries = readEntries()
    // Yesterday's entry should still exist
    expect(entries.find((e) => e.id === "yesterday1")).toBeDefined()
  })
})
