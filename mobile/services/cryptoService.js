import crypto from "react-native-quick-crypto"
import * as SecureStore from "expo-secure-store"
import * as Keychain from "react-native-keychain"

const KEY_NAME = "diktafon_encryption_key_v1"
const KEY_LENGTH = 32 // AES-256
const IV_LENGTH = 12 // GCM standard
const TAG_LENGTH = 16 // GCM auth tag
const PBKDF2_ITERATIONS = 600000
const LEGACY_PBKDF2_ITERATIONS = 100000
const PBKDF2_SALT_LENGTH = 16

// iCloud Keychain constants (v2)
const KEYCHAIN_SERVICE = "com.diktafon.app.encryption"
const KEYCHAIN_USERNAME = "encryption_key_v2"

// In-memory cache — avoid Keychain/SecureStore round-trip on every encrypt/decrypt
let _cachedKey = null

// ── Keychain Helpers (iCloud-synced) ────────────────────

async function readKeyFromKeychain() {
  try {
    const result = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE })
    if (!result || !result.password) return null
    return Buffer.from(result.password, "base64")
  } catch {
    return null
  }
}

async function writeKeyToKeychain(base64Key) {
  await Keychain.setGenericPassword(KEYCHAIN_USERNAME, base64Key, {
    service: KEYCHAIN_SERVICE,
    accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
    synchronizable: true,
  })
}

// ── v1 → v2 Migration ──────────────────────────────────

async function migrateKeyToKeychain() {
  // 1. Already in Keychain? Done — just clean up SecureStore if leftover
  const keychainKey = await readKeyFromKeychain()
  if (keychainKey) {
    _cachedKey = keychainKey
    try { await SecureStore.deleteItemAsync(KEY_NAME) } catch {}
    return
  }

  // 2. Read v1 key from SecureStore
  const v1Key = await SecureStore.getItemAsync(KEY_NAME)
  if (!v1Key) return // Fresh install — initEncryption will generate

  // 3. Write to Keychain, verify round-trip, delete from SecureStore
  await writeKeyToKeychain(v1Key)
  const verify = await readKeyFromKeychain()
  if (!verify || Buffer.from(verify).toString("base64") !== v1Key) {
    throw new Error("Keychain migration round-trip verification failed")
  }
  await SecureStore.deleteItemAsync(KEY_NAME)
  _cachedKey = verify
}

// ── Key Management ──────────────────────────────────────

export async function initEncryption() {
  // Try migration first (non-fatal if it fails)
  try {
    await migrateKeyToKeychain()
  } catch (e) {
    if (__DEV__) console.warn("Key migration to Keychain failed:", e.message)
  }

  // Check Keychain
  const keychainKey = await readKeyFromKeychain()
  if (keychainKey) {
    _cachedKey = keychainKey
    return true
  }

  // Fallback: check SecureStore (migration may have failed)
  const secureStoreKey = await SecureStore.getItemAsync(KEY_NAME)
  if (secureStoreKey) {
    _cachedKey = Buffer.from(secureStoreKey, "base64")
    return true
  }

  // Generate new key → write to Keychain (not SecureStore)
  const key = crypto.randomBytes(KEY_LENGTH)
  const base64 = Buffer.from(key).toString("base64")
  await writeKeyToKeychain(base64)
  _cachedKey = Buffer.from(key)
  return true
}

export async function getEncryptionKey() {
  if (_cachedKey) return _cachedKey

  const keychainKey = await readKeyFromKeychain()
  if (keychainKey) {
    _cachedKey = keychainKey
    return _cachedKey
  }

  // Fallback: SecureStore (pre-migration devices)
  const stored = await SecureStore.getItemAsync(KEY_NAME)
  if (!stored) return null
  _cachedKey = Buffer.from(stored, "base64")
  return _cachedKey
}

export function clearCachedKey() {
  if (_cachedKey) {
    _cachedKey.fill(0)
    _cachedKey = null
  }
}

export async function hasEncryptionKey() {
  if (_cachedKey) return true
  const keychainKey = await readKeyFromKeychain()
  if (keychainKey) return true
  const stored = await SecureStore.getItemAsync(KEY_NAME)
  return stored !== null
}

// ── AES-256-GCM Encrypt/Decrypt ─────────────────────────

export function encryptText(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Format: [12-byte IV][ciphertext][16-byte auth tag]
  return Buffer.concat([Buffer.from(iv), encrypted, authTag])
}

export function decryptText(encryptedBuf, key) {
  const buf = Buffer.from(encryptedBuf)
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted data too short")
  }
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(buf.length - TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH)

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString("utf8")
}

// ── Binary file encrypt/decrypt (for audio) ─────────────

export function encryptBytes(data, key) {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()])
  const authTag = cipher.getAuthTag()
  // Same format as encryptText: [12-byte IV][ciphertext][16-byte auth tag]
  return Buffer.concat([Buffer.from(iv), encrypted, authTag])
}

export function decryptBytes(encryptedBuf, key) {
  const buf = Buffer.from(encryptedBuf)
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted data too short")
  }
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(buf.length - TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH)

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

// ── PBKDF2 Password-Based Encryption (for backups) ──────

export function deriveKeyFromPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256")
}

export function encryptBlob(data, password) {
  const salt = crypto.randomBytes(PBKDF2_SALT_LENGTH)
  const key = deriveKeyFromPassword(password, salt)
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(Buffer.from(data)), cipher.final()])
  const authTag = cipher.getAuthTag()

  // Format: [16-byte salt][12-byte IV][encrypted data][16-byte auth tag]
  return Buffer.concat([Buffer.from(salt), Buffer.from(iv), encrypted, authTag])
}

export function decryptBlob(encryptedBuf, password) {
  const buf = Buffer.from(encryptedBuf)
  const minLength = PBKDF2_SALT_LENGTH + IV_LENGTH + TAG_LENGTH
  if (buf.length < minLength) {
    throw new Error("Encrypted backup too short")
  }

  const salt = buf.subarray(0, PBKDF2_SALT_LENGTH)
  const iv = buf.subarray(PBKDF2_SALT_LENGTH, PBKDF2_SALT_LENGTH + IV_LENGTH)
  const authTag = buf.subarray(buf.length - TAG_LENGTH)
  const ciphertext = buf.subarray(PBKDF2_SALT_LENGTH + IV_LENGTH, buf.length - TAG_LENGTH)

  // Try current iteration count first, fall back to legacy for old backups
  for (const iterations of [PBKDF2_ITERATIONS, LEGACY_PBKDF2_ITERATIONS]) {
    try {
      const key = crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, "sha256")
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
      decipher.setAuthTag(authTag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()])
    } catch {
      if (iterations === LEGACY_PBKDF2_ITERATIONS) throw new Error("Pogresna lozinka")
    }
  }
}
