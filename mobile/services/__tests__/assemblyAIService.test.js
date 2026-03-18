/**
 * Tests for assemblyAI unified submit() and check() wrappers.
 * Verifies they route to direct vs proxy mode based on session state.
 */

// Mock supabaseClient
const mockGetSession = jest.fn()
jest.mock("../supabaseClient", () => ({
  supabase: {
    auth: { getSession: () => mockGetSession() },
    storage: { from: jest.fn() },
    functions: { invoke: jest.fn() },
  },
}))

// Mock expo-secure-store
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn().mockResolvedValue("test-api-key"),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}))

// Mock expo-file-system/legacy
jest.mock("expo-file-system/legacy", () => ({
  uploadAsync: jest.fn().mockResolvedValue({
    status: 200,
    body: JSON.stringify({ upload_url: "https://example.com/upload" }),
  }),
  readAsStringAsync: jest.fn().mockResolvedValue("base64data"),
  EncodingType: { Base64: "base64" },
  FileSystemUploadType: { BINARY_CONTENT: 0 },
}))

// Mock fetch for direct API calls
const mockFetch = jest.fn()
global.fetch = mockFetch

const assemblyAI = require("../assemblyAIService")

beforeEach(() => {
  jest.clearAllMocks()
})

describe("submit()", () => {
  test("routes to direct API when no session (not logged in)", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "transcript-123" }),
    })

    const result = await assemblyAI.submit("file:///audio.wav")
    expect(result).toEqual({ assemblyai_id: "transcript-123" })
    // Should have called fetch for upload + transcript creation
  })

  test("routes to proxy when session exists (logged in)", async () => {
    const mockSupabase = require("../supabaseClient").supabase
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
    })
    mockSupabase.storage.from.mockReturnValue({
      upload: jest.fn().mockResolvedValue({ error: null }),
    })
    mockSupabase.functions.invoke.mockResolvedValue({
      data: { assemblyai_id: "proxy-123" },
      error: null,
    })

    const result = await assemblyAI.submit("file:///audio.wav")
    expect(result).toEqual({ assemblyai_id: "proxy-123" })
    expect(mockSupabase.functions.invoke).toHaveBeenCalled()
  })
})

describe("check()", () => {
  test("routes to direct API when no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "completed", text: "hello", audio_duration: 30 }),
    })

    const result = await assemblyAI.check("transcript-123")
    expect(result).toEqual({ status: "done", text: "hello", duration_seconds: 30 })
  })

  test("routes to proxy when session exists", async () => {
    const mockSupabase = require("../supabaseClient").supabase
    mockGetSession.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
    })
    mockSupabase.functions.invoke.mockResolvedValue({
      data: { status: "done", text: "proxy hello", duration_seconds: 45 },
      error: null,
    })

    const result = await assemblyAI.check("transcript-123")
    expect(result).toEqual({ status: "done", text: "proxy hello", duration_seconds: 45 })
    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith("transcribe/status", {
      body: { id: "transcript-123" },
    })
  })
})
