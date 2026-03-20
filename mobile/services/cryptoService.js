import crypto from "react-native-quick-crypto"
import * as SecureStore from "expo-secure-store"

const KEY_NAME = "diktafon_encryption_key_v1"
const KEY_LENGTH = 32 // AES-256
const IV_LENGTH = 12 // GCM standard
const TAG_LENGTH = 16 // GCM auth tag
const PBKDF2_ITERATIONS = 100000
const PBKDF2_SALT_LENGTH = 16

// In-memory cache — avoid SecureStore round-trip on every encrypt/decrypt
let _cachedKey = null

// ── Key Management ──────────────────────────────────────

export async function initEncryption() {
  const existing = await SecureStore.getItemAsync(KEY_NAME)
  if (existing) {
    _cachedKey = Buffer.from(existing, "base64")
    return true
  }
  const key = crypto.randomBytes(KEY_LENGTH)
  await SecureStore.setItemAsync(KEY_NAME, Buffer.from(key).toString("base64"))
  _cachedKey = Buffer.from(key)
  return true
}

export async function getEncryptionKey() {
  if (_cachedKey) return _cachedKey
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
  const stored = await SecureStore.getItemAsync(KEY_NAME)
  return stored !== null
}

export async function exportRecoveryKey() {
  const stored = await SecureStore.getItemAsync(KEY_NAME)
  return stored || null
}

export async function importRecoveryKey(base64Key) {
  const trimmed = base64Key.trim()
  // Validate base64 format: decode then re-encode and compare
  const keyBuf = Buffer.from(trimmed, "base64")
  if (keyBuf.length === 0 || Buffer.from(keyBuf).toString("base64") !== trimmed) {
    throw new Error("Neispravan format kljuca")
  }
  if (keyBuf.length !== KEY_LENGTH) {
    throw new Error("Neispravan kljuc za oporavak")
  }
  await SecureStore.setItemAsync(KEY_NAME, trimmed)
  _cachedKey = keyBuf
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

  const key = deriveKeyFromPassword(password, salt)
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new Error("Pogresna lozinka")
  }
}
