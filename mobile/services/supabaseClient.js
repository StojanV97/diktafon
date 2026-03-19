import AsyncStorage from "@react-native-async-storage/async-storage"
import * as SecureStore from "expo-secure-store"
import * as Sentry from "@sentry/react-native"
import { createClient } from "@supabase/supabase-js"

// TODO: Replace with your Supabase project URL and anon key
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY"

// SecureStore has a ~2KB limit on iOS. Supabase tokens typically fit,
// but if a value is too large we fall back to AsyncStorage for that key.
const SECURE_STORE_LIMIT = 2048

const SecureStoreAdapter = {
  async getItem(key) {
    try {
      const value = await SecureStore.getItemAsync(key)
      if (value !== null) return value

      // Lazy migration: check AsyncStorage for pre-existing token
      const legacy = await AsyncStorage.getItem(key)
      if (legacy !== null) {
        // Migrate to SecureStore, then remove from AsyncStorage
        if (legacy.length <= SECURE_STORE_LIMIT) {
          await SecureStore.setItemAsync(key, legacy)
        } else {
          if (__DEV__) console.warn(`SecureStoreAdapter: key "${key}" exceeds SecureStore limit, keeping in AsyncStorage`)
          return legacy
        }
        await AsyncStorage.removeItem(key)
        return legacy
      }

      return null
    } catch (e) {
      if (__DEV__) console.warn("SecureStoreAdapter.getItem failed:", e.message)
      Sentry.captureMessage(`SecureStore.getItem fallback to AsyncStorage: ${e.message}`, "warning")
      return AsyncStorage.getItem(key)
    }
  },

  async setItem(key, value) {
    try {
      if (value.length > SECURE_STORE_LIMIT) {
        if (__DEV__) console.warn(`SecureStoreAdapter: key "${key}" exceeds SecureStore limit, using AsyncStorage`)
        await AsyncStorage.setItem(key, value)
        return
      }
      await SecureStore.setItemAsync(key, value)
      // Clean up AsyncStorage if it had the old value
      await AsyncStorage.removeItem(key).catch(() => {})
    } catch (e) {
      if (__DEV__) console.warn("SecureStoreAdapter.setItem failed:", e.message)
      Sentry.captureMessage(`SecureStore.setItem fallback to AsyncStorage: ${e.message}`, "warning")
      await AsyncStorage.setItem(key, value)
    }
  },

  async removeItem(key) {
    try {
      await SecureStore.deleteItemAsync(key)
    } catch (e) {
      if (__DEV__) console.warn("SecureStoreAdapter.removeItem SecureStore failed:", e.message)
      Sentry.captureMessage(`SecureStore.removeItem failed: ${e.message}`, "warning")
    }
    // Always also remove from AsyncStorage (migration cleanup)
    try {
      await AsyncStorage.removeItem(key)
    } catch (e) {
      if (__DEV__) console.warn("SecureStoreAdapter.removeItem AsyncStorage failed:", e.message)
    }
  },
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
