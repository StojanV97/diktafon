import { Alert } from "react-native"
import { talsecStart, setThreatListeners } from "freerasp-react-native"
import * as Sentry from "@sentry/react-native"
import Constants from "expo-constants"
import { clearCachedKey } from "./cryptoService"

export async function initRuntimeProtection() {
  await setThreatListeners({
    privilegedAccess: () => {
      Sentry.captureMessage("freeRASP: jailbreak/root detected", "warning")
      Alert.alert(
        "Bezbednosno upozorenje",
        "Uredaj je rootovan ili jailbreak-ovan. Podaci mogu biti ugrozeni.",
        [{ text: "U redu" }]
      )
    },
    hooks: () => {
      Sentry.captureMessage("freeRASP: hooking framework detected", "error")
      clearCachedKey()
    },
    debug: () => {
      if (!__DEV__) {
        Sentry.captureMessage("freeRASP: debugger attached in production", "warning")
      }
    },
    simulator: () => {
      if (!__DEV__) {
        Sentry.captureMessage("freeRASP: running on emulator in production", "warning")
      }
    },
    appIntegrity: () => {
      Sentry.captureMessage("freeRASP: app integrity compromised", "error")
      clearCachedKey()
    },
    passcode: () => {
      Sentry.captureMessage("freeRASP: device has no passcode set", "warning")
    },
  })

  const {
    FREERASP_APPLE_TEAM_ID,
    FREERASP_ANDROID_CERT_HASH,
    FREERASP_WATCHER_MAIL,
  } = Constants.expoConfig?.extra ?? {}

  if (!FREERASP_APPLE_TEAM_ID && !FREERASP_ANDROID_CERT_HASH) {
    if (__DEV__) console.warn("freeRASP: config not set, skipping in dev")
    if (!__DEV__) Sentry.captureMessage("freeRASP: missing config in production", "error")
    return
  }

  await talsecStart({
    iosConfig: {
      appBundleId: "com.diktafon.app",
      appTeamId: FREERASP_APPLE_TEAM_ID || "",
    },
    androidConfig: {
      packageName: "com.diktafon.app",
      certificateHashes: FREERASP_ANDROID_CERT_HASH
        ? [FREERASP_ANDROID_CERT_HASH]
        : [],
    },
    watcherMail: FREERASP_WATCHER_MAIL || "security@diktafon.app",
    isProd: !__DEV__,
  })
}
