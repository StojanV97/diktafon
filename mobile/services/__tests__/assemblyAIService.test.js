/**
 * Tests for assemblyAI proxy-only submit() and check().
 * Verifies they route through Supabase edge functions.
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

// Mock expo-file-system/legacy
jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: jest.fn().mockResolvedValue("base64data"),
  EncodingType: { Base64: "base64" },
}))

const assemblyAI = require("../assemblyAIService")

beforeEach(() => {
  jest.clearAllMocks()
})

describe("submit()", () => {
  test("throws AUTH_REQUIRED when no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })

    await expect(assemblyAI.submit("file:///audio.wav")).rejects.toThrow("AUTH_REQUIRED")
  })

  test("submits via proxy when session exists", async () => {
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
  test("checks via proxy", async () => {
    const mockSupabase = require("../supabaseClient").supabase
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
