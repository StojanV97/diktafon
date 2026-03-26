# Encryption Testing Checklist

## Manual Testing (on device or simulator)

### 1. Encryption at Rest
- Create a recording and complete transcription
- On simulator: open `Documents/journal/audio/{id}.wav` with a hex editor or try playing it directly from Finder
- **Expected**: File is binary gibberish, not a valid .wav

### 2. Decrypt + Play
- Open the entry in-app, tap play
- **Expected**: Audio plays correctly (decrypted on the fly)

### 3. Backup with Password
- Go to Settings > create backup with password
- Try opening the .enc file without the app — should be unreadable
- Restore with correct password — should succeed
- Restore with wrong password — should show error message
- **Expected**: Only correct password decrypts the backup

### 4. Reinstall Recovery
- Create a password-protected backup
- Save .enc file to Files app
- Delete the app
- Reinstall
- Restore from .enc file with the same password
- **Expected**: All folders, entries, audio, and transcripts restored

### 5. Background Cleanup
- Open an entry and play audio
- Background the app (swipe to home)
- Inspect `Library/Caches/decrypted_audio/` in the app sandbox
- **Expected**: Directory is empty or deleted

### 6. iCloud Sync
- Create a recording on one device
- Check iCloud container files on another device or via Settings > iCloud > Manage Storage
- **Expected**: Synced files are encrypted (not readable as plaintext JSON or valid audio)

### 7. Widget Data
- Add the Diktafon widget to home screen
- Create a few recordings
- **Expected**: Widget shows clip count and duration only — no transcript text visible

### 8. Share/Export
- Open an entry, tap share text
- **Expected**: Plaintext transcript shared (intentional user action)
- Tap save audio to Files
- **Expected**: Playable .wav file saved (decrypted for user)

## Automated Unit Tests (future)

Tests to write for `cryptoService.js`:

- `encryptText` -> `decryptText` roundtrip returns original
- `encryptBytes` -> `decryptBytes` roundtrip returns original
- `encryptBlob` -> `decryptBlob` with correct password returns original
- `decryptBlob` with wrong password throws error
- `decryptText` with wrong key throws (GCM auth tag fails)
- `decryptText` with tampered ciphertext throws (flipped byte in middle)
- `decryptBlob` with legacy 100k iterations still works (backward compat)
- `deriveKeyFromPassword` with same password+salt produces same key
- `deriveKeyFromPassword` with different salt produces different key
- IV is different on each `encryptText` call (random, not reused)
