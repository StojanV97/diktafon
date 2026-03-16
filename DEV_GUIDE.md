# Diktafon — Dev Guide

## Prerequisites

- Node.js 20+
- Xcode 15+ (for iOS builds)
- CocoaPods: `sudo gem install cocoapods`
- EAS CLI (optional, for cloud builds): `npm install -g eas-cli`

---

## First Time Setup

```bash
cd mobile
npm install
```

---

## Running the App

> **Expo Go is NOT supported** — `whisper.rn` requires native code. You need a dev build.

### iOS Simulator (no device needed)

```bash
cd mobile
npx expo prebuild          # generates ios/ and android/ — only needed once (or after dep changes)
npx expo run:ios           # compiles and launches in Simulator
```

First build takes ~5-10 min. Subsequent runs are fast.

### iOS Physical Device

```bash
npx expo run:ios --device  # select your connected device
```

Requires Apple ID in Xcode for code signing (`mobile/ios/*.xcworkspace` → Signing & Capabilities).

### After dependency changes

```bash
npx expo prebuild --clean  # full regeneration
npx expo run:ios
```

---

## EAS Cloud Builds (for distribution)

```bash
cd mobile
eas login
eas build --profile development --platform ios   # dev build (.ipa)
eas build --profile preview --platform ios       # internal testing
eas build --profile production --platform ios    # App Store
```

After installing a dev build on device:
```bash
npx expo start --dev-client
```

---

## Project Structure

```
diktafon/
├── mobile/               # React Native app (Expo)
│   ├── App.js            # Root: navigation, ErrorBoundary, whisper context cleanup
│   ├── app.json          # Expo config (plugins, bundle ID, build properties)
│   ├── eas.json          # EAS build profiles
│   ├── theme.js          # Design tokens (colors, spacing, typography)
│   ├── screens/
│   │   ├── DirectoryHomeScreen.js   # Home: folder list + settings gear
│   │   ├── DirectoryScreen.js       # Folder entries + recording
│   │   ├── DailyLogScreen.js        # Quick-capture daily log
│   │   ├── EntryScreen.js           # Transcript viewer + audio player
│   │   └── SettingsScreen.js        # Model download, API key, default engine
│   ├── services/
│   │   ├── whisperService.js        # On-device Whisper AI (whisper.rn)
│   │   ├── assemblyAIService.js     # Direct AssemblyAI REST API
│   │   ├── journalApi.js            # Facade: transcribeLocal / submitAssemblyAI / checkAssemblyAI
│   │   └── journalStorage.js        # Local file storage (folders, entries, audio, texts)
│   ├── hooks/
│   │   └── useRecorder.js           # Audio recording hook
│   └── components/
│       └── RecordingOverlay.js      # Waveform + timer overlay
└── backend/              # Old FastAPI backend (no longer used by app)
```

---

## Transcription Engines

### On-Device (Whisper AI)
- Uses `whisper.rn` with `ggml-base` model (~141 MB)
- Model downloaded once, cached at `DocumentsDir/whisper-models/ggml-base.bin`
- Fully private, works offline
- **Setup**: Settings → "Preuzmi model"

### AssemblyAI (Cloud)
- Direct REST calls to `api.assemblyai.com`
- Speaker diarization, higher accuracy
- Requires internet + API key
- **Setup**: Settings → enter API key from assemblyai.com

---

## First Use Checklist

1. Build & launch the app (see above)
2. Open **Podesavanja** (gear icon on Home screen)
3. Download the Whisper model (~141 MB, needs Wi-Fi)
4. Optionally add AssemblyAI API key for cloud transcription
5. Go back → create a folder or open Dnevni Log → record → transcribe

---

## Local Data Location

All app data lives in the device's Documents directory:

```
DocumentsDir/journal/
├── folders.json       # folder metadata
├── entries.json       # entry metadata (truncated text)
├── audio/             # {entryId}.m4a recordings
└── texts/             # journal_{entryId}.txt full transcripts

DocumentsDir/whisper-models/
└── ggml-base.bin      # Whisper model (~141 MB)
```

---

## Common Issues

| Problem | Fix |
|---------|-----|
| `ios.deploymentTarget needs to be at least 15.1` | Already fixed in app.json — run `npx expo prebuild` again |
| Build fails after adding a package | `npx expo prebuild --clean && npx expo run:ios` |
| Simulator can't record audio | Use physical device for recording |
| Model download fails | Check internet connection, ~141 MB needed |
| `expo-secure-store` crash on old simulator | Test API key flow on physical device |
| Entries stuck in "processing" | Auto-reset to "recorded" on next app launch (>24h migration) |

---

## Key Commands Cheatsheet

```bash
# Install deps
npm install

# Generate native projects
npx expo prebuild
npx expo prebuild --clean        # full regeneration

# Run
npx expo run:ios                 # simulator
npx expo run:ios --device        # physical device
npx expo start --dev-client      # JS bundler for installed dev build

# EAS builds
eas build --profile development --platform ios
eas build --profile preview --platform ios
eas build --profile production --platform ios
```
