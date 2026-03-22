import AsyncStorage from "@react-native-async-storage/async-storage"
import * as SecureStore from "expo-secure-store"
import * as Sentry from "@sentry/react-native"
import { createClient } from "@supabase/supabase-js"
import { getEncryptionKey, encryptText, decryptText } from "./cryptoService"

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://YOUR_PROJECT.supabase.co"
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "YOUR_ANON_KEY"

// SecureStore has a ~2KB limit on iOS. Supabase tokens typically fit,
// but if a value is too large we fall back to encrypted AsyncStorage.
const SECURE_STORE_LIMIT = 2048
const ENCRYPTED_PREFIX = "enc:v1:"

async function encryptForStorage(value) {
  const key = await getEncryptionKey()
  if (!key) return value
  const encrypted = encryptText(value, key)
  return ENCRYPTED_PREFIX + Buffer.from(encrypted).toString("base64")
}

async function decryptFromStorage(stored) {
  if (!stored || !stored.startsWith(ENCRYPTED_PREFIX)) return stored
  const key = await getEncryptionKey()
  if (!key) return stored
  const raw = Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), "base64")
  return decryptText(raw, key)
}

const SecureStoreAdapter = {
  async getItem(key) {
    try {
      const value = await SecureStore.getItemAsync(key)
      if (value !== null) return value

      // Lazy migration: check AsyncStorage for pre-existing token
      const legacy = await AsyncStorage.getItem(key)
      if (legacy !== null) {
        // Decrypt if it was stored encrypted
        const plaintext = await decryptFromStorage(legacy)
        // Migrate to SecureStore, then remove from AsyncStorage
        if (plaintext.length <= SECURE_STORE_LIMIT) {
          await SecureStore.setItemAsync(key, plaintext)
          await AsyncStorage.removeItem(key)
        }
        return plaintext
      }

      return null
    } catch (e) {
      if (__DEV__) console.warn("SecureStoreAdapter.getItem failed:", e.message)
      Sentry.captureMessage(`SecureStore.getItem fallback to AsyncStorage: ${e.message}`, "warning")
      const stored = await AsyncStorage.getItem(key)
      return decryptFromStorage(stored)
    }
  },

  async setItem(key, value) {
    try {
      if (value.length > SECURE_STORE_LIMIT) {
        const encrypted = await encryptForStorage(value)
        await AsyncStorage.setItem(key, encrypted)
        return
      }
      await SecureStore.setItemAsync(key, value)
      // Clean up AsyncStorage if it had the old value
      await AsyncStorage.removeItem(key).catch(() => {})
    } catch (e) {
      if (__DEV__) console.warn("SecureStoreAdapter.setItem failed:", e.message)
      Sentry.captureMessage(`SecureStore.setItem fallback to AsyncStorage: ${e.message}`, "warning")
      const encrypted = await encryptForStorage(value)
      await AsyncStorage.setItem(key, encrypted)
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
