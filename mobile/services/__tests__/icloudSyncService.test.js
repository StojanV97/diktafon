/**
 * Tests for icloudSyncService sync toggle functions.
 * Verifies they delegate to settingsService instead of direct AsyncStorage access.
 */

// Mock settingsService
const mockGetSettings = jest.fn()
const mockUpdateSettings = jest.fn()
jest.mock("../settingsService", () => ({
  getSettings: (...args) => mockGetSettings(...args),
  updateSettings: (...args) => mockUpdateSettings(...args),
}))

// Mock Platform
jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
}))

// Mock Sentry
jest.mock("@sentry/react-native", () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}))

// Mock react-native-cloud-store (lazy loaded)
jest.mock("react-native-cloud-store", () => ({
  isICloudAvailable: jest.fn().mockResolvedValue(true),
}))

const { isSyncEnabled, enableSync, disableSync } = require("../icloudSyncService")

beforeEach(() => {
  jest.clearAllMocks()
})

describe("isSyncEnabled", () => {
  test("returns true when settingsService reports icloudSyncEnabled=true", async () => {
    mockGetSettings.mockResolvedValue({ icloudSyncEnabled: true })
    const result = await isSyncEnabled()
    expect(result).toBe(true)
    expect(mockGetSettings).toHaveBeenCalled()
  })

  test("returns false when settingsService reports icloudSyncEnabled=false", async () => {
    mockGetSettings.mockResolvedValue({ icloudSyncEnabled: false })
    const result = await isSyncEnabled()
    expect(result).toBe(false)
  })
})

describe("enableSync", () => {
  test("calls updateSettings with icloudSyncEnabled=true", async () => {
    await enableSync()
    expect(mockUpdateSettings).toHaveBeenCalledWith({ icloudSyncEnabled: true })
  })
})

describe("disableSync", () => {
  test("calls updateSettings with icloudSyncEnabled=false", async () => {
    await disableSync()
    expect(mockUpdateSettings).toHaveBeenCalledWith({ icloudSyncEnabled: false })
  })
})
