import * as SecureStore from "expo-secure-store"
import * as LocalAuthentication from "expo-local-authentication"

const BIOMETRIC_LOCK_KEY = "biometric_lock_enabled"

export async function isBiometricAvailable() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync()
  if (!hasHardware) return false
  return LocalAuthentication.isEnrolledAsync()
}

export async function isBiometricLockEnabled() {
  const value = await SecureStore.getItemAsync(BIOMETRIC_LOCK_KEY)
  return value === "true"
}

export async function setBiometricLockEnabled(enabled) {
  await SecureStore.setItemAsync(BIOMETRIC_LOCK_KEY, enabled ? "true" : "false")
}

export async function authenticateWithBiometrics() {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "Otključaj Diktafon",
    cancelLabel: "Otkaži",
    disableDeviceFallback: false,
    fallbackLabel: "Koristi lozinku",
  })
  return result.success
}
