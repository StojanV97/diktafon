import Purchases from "react-native-purchases"

// TODO: Replace with your RevenueCat API key
const REVENUECAT_API_KEY_IOS = "YOUR_REVENUECAT_IOS_KEY"
const REVENUECAT_API_KEY_ANDROID = "YOUR_REVENUECAT_ANDROID_KEY"

const PREMIUM_ENTITLEMENT = "premium"
export const MONTHLY_MINUTES_LIMIT = 120

let _initialized = false

// ── Init ───────────────────────────────────────────────

export async function initPurchases(platform = "ios") {
  if (_initialized) return
  const apiKey = platform === "android"
    ? REVENUECAT_API_KEY_ANDROID
    : REVENUECAT_API_KEY_IOS

  Purchases.configure({ apiKey })
  _initialized = true
}

/**
 * Link RevenueCat to a Supabase user ID — call after auth sign-in.
 */
export async function loginUser(userId) {
  if (!_initialized) return
  await Purchases.logIn(userId)
}

export async function logoutUser() {
  if (!_initialized) return
  await Purchases.logOut()
}

// ── Subscription Status ────────────────────────────────

export async function isPremium() {
  if (!_initialized) return false
  try {
    const customerInfo = await Purchases.getCustomerInfo()
    return customerInfo.entitlements.active[PREMIUM_ENTITLEMENT] !== undefined
  } catch {
    return false
  }
}

export async function getCustomerInfo() {
  if (!_initialized) return null
  try {
    return await Purchases.getCustomerInfo()
  } catch {
    return null
  }
}

// ── Offerings / Purchase ───────────────────────────────

export async function getOfferings() {
  if (!_initialized) return null
  try {
    const offerings = await Purchases.getOfferings()
    return offerings.current
  } catch {
    return null
  }
}

export async function purchasePackage(pkg) {
  const { customerInfo } = await Purchases.purchasePackage(pkg)
  return customerInfo.entitlements.active[PREMIUM_ENTITLEMENT] !== undefined
}

export async function restorePurchases() {
  const customerInfo = await Purchases.restorePurchases()
  return customerInfo.entitlements.active[PREMIUM_ENTITLEMENT] !== undefined
}

// ── Usage Tracking (read from Supabase profile) ───────

export function getUsageFromProfile(profile) {
  if (!profile) return { used: 0, limit: MONTHLY_MINUTES_LIMIT, remaining: MONTHLY_MINUTES_LIMIT }
  const used = profile.transcription_minutes_used || 0
  return { used, limit: MONTHLY_MINUTES_LIMIT, remaining: Math.max(0, MONTHLY_MINUTES_LIMIT - used) }
}
