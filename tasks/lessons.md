# Lessons Learned

## 2026-03-20: Security Audit Implementation
- Widget Swift files had hardcoded `com.local.diktafon` URLs AND group identifiers that didn't match `app.config.js` (`com.diktafon.app`). Always check for mismatches across Swift/JS boundaries.
- `expo-screen-capture` has `enableAppSwitcherProtectionAsync()` for app-switcher blur — `addScreenshotListener()` is only for detection, not prevention.
- When encrypting audio files at rest, all consumers (transcription service, audio player, sharing) need decrypted temp copies. The temp files must be cleaned up on background.
- `crypto.randomUUID()` from `react-native-quick-crypto` is a drop-in replacement for the `Math.random()` UUID generator pattern.
