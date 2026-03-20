import { Alert } from "react-native"
import { talsecStart, setThreatListeners } from "freerasp-react-native"
import * as Sentry from "@sentry/react-native"
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

  await talsecStart({
    iosConfig: {
      appBundleId: "com.diktafon.app",
      appTeamId: "YOUR_TEAM_ID", // TODO: Replace with your Apple Team ID
    },
    androidConfig: {
      packageName: "com.diktafon.app",
      certificateHashes: ["YOUR_CERT_HASH"], // TODO: Replace with your signing cert SHA-256
    },
    watcherMail: "security@diktafon.app", // TODO: Replace with your email
    isProd: !__DEV__,
  })
}
