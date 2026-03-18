/**
 * Tests for getUsageFromProfile — verifies limit constant is used consistently.
 */

jest.mock("react-native-purchases", () => ({}))

const { getUsageFromProfile, MONTHLY_MINUTES_LIMIT } = require("../subscriptionService")

describe("getUsageFromProfile", () => {
  test("returns limit from MONTHLY_MINUTES_LIMIT constant", () => {
    const result = getUsageFromProfile(null)
    expect(result.limit).toBe(MONTHLY_MINUTES_LIMIT)
  })

  test("defaults to 0 used and full remaining when no profile", () => {
    const result = getUsageFromProfile(null)
    expect(result.used).toBe(0)
    expect(result.remaining).toBe(MONTHLY_MINUTES_LIMIT)
  })

  test("calculates remaining from limit minus used", () => {
    const result = getUsageFromProfile({ transcription_minutes_used: 45 })
    expect(result.used).toBe(45)
    expect(result.limit).toBe(MONTHLY_MINUTES_LIMIT)
    expect(result.remaining).toBe(MONTHLY_MINUTES_LIMIT - 45)
  })

  test("remaining is never negative", () => {
    const result = getUsageFromProfile({ transcription_minutes_used: 999 })
    expect(result.remaining).toBe(0)
  })
})
