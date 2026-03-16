# Diktafon — Project Reference

Audio recording + transcription journal app with Serbian UI.
**Stack**: FastAPI backend (Python) + Expo/React Native mobile (JS).
**Purpose**: Record audio → transcribe (local whisper / AssemblyAI) → browse & share transcripts.

---

## Backend (`backend/`)

### File Structure
```
backend/
├── main.py                      # FastAPI app, all endpoints, audio preprocessing, chunking
├── storage.py                   # Simple transcription CRUD (index.json + {id}.txt)
├── journal_storage.py           # Journal folders/entries CRUD (journal_folders.json + journal_entries.json)
├── transcription.py             # Local (faster-whisper) & OpenAI Whisper engines
├── transcription_assemblyai.py  # AssemblyAI with speaker diarization
├── requirements.txt             # Python deps
├── .env / .env.example          # Config (API keys, engine, model size)
└── data/
    ├── index.json               # Transcription metadata (simple endpoint)
    ├── journal_folders.json     # Folder metadata
    ├── journal_entries.json     # Entry metadata
    ├── audio/                   # Audio files ({entry_id}.m4a)
    ├── {record_id}.txt          # Full text (simple transcriptions)
    └── journal_{entry_id}.txt   # Full text (journal entries)
```

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health check |
| POST | `/transcribe` | Upload audio → transcribe → save |
| GET | `/transcriptions` | List all transcriptions |
| GET | `/transcriptions/{id}` | Get transcription (full text from .txt) |
| DELETE | `/transcriptions/{id}` | Delete transcription |
| GET | `/transcriptions/{id}/download` | Download as .txt |
| POST | `/journal/folders` | Create folder |
| GET | `/journal/folders` | List folders |
| PUT | `/journal/folders/{id}` | Rename folder |
| DELETE | `/journal/folders/{id}` | Delete folder (cascades entries + audio) |
| POST | `/journal/folders/{folder_id}/entries` | Upload audio → create entry |
| GET | `/journal/folders/{folder_id}/entries` | List entries in folder |
| GET | `/journal/entries/{id}` | Get entry (checks AssemblyAI status if processing) |
| POST | `/journal/entries/{id}/transcribe` | Transcribe entry (uses folder's engine) |
| DELETE | `/journal/entries/{id}` | Delete entry |
| GET | `/journal/entries/{id}/audio` | Stream audio file |
| POST | `/transcribe/assemblyai/submit` | Submit audio to AssemblyAI → returns transcript_id |
| GET | `/transcribe/assemblyai/status/{id}` | Check AssemblyAI job status |

### Data Schema

**Folder**: `{ id, name, engine ("local"|"assemblyai"), created_at }`

**Entry**: `{ id, folder_id, filename, text (first 200 chars), created_at, duration_seconds, status, audio_file, assemblyai_id? }`

**Status state machine**: `recorded → processing → done | error`

### Transcription Engines
- **local** (default): faster-whisper, model size configurable (tiny/base/small/medium/large)
- **openai**: Whisper API (`whisper-1`), requires `OPENAI_API_KEY`
- **assemblyai**: Speaker diarization, async polling, `language_code="sr"`, requires `ASSEMBLYAI_API_KEY`

### Audio Pipeline (FFmpeg)
```
Input → strip video → mono → 16kHz → highpass=80Hz → afftdn(nf=-20) → loudnorm(I=-16,TP=-1.5) → PCM WAV 16-bit
```

### Key Patterns
- **Chunking**: Files >24MB split into 10-min (600s) chunks, processed sequentially
- **Context continuity**: Last 200 chars of previous chunk → Whisper `initial_prompt`
- **Serbian diacritics prompt**: Hardcoded in `transcription.py` — instructs Whisper to use č, ć, š, ž, đ
- **JSON storage**: `ensure_ascii=False` to preserve diacritics
- **Supported formats**: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac, aac
- **Max upload**: 500MB

### Environment Variables
```
TRANSCRIPTION_ENGINE=local       # or "openai"
WHISPER_MODEL_SIZE=small         # tiny, base, small, medium, large
OPENAI_API_KEY=sk-...
ASSEMBLYAI_API_KEY=...
```

---

## Mobile (`mobile/`)

### File Structure
```
mobile/
├── App.js                       # Root: fonts, splash, navigation setup
├── app.json                     # Expo config (com.local.diktafon, permissions)
├── theme.js                     # Colors, spacing, radii, elevation, typography, FOLDER_COLORS
├── screens/
│   ├── DirectoryHomeScreen.js   # Folder list, create/edit/delete folders
│   ├── DirectoryScreen.js       # Entry list, recording UI, transcription
│   └── EntryScreen.js           # Full transcript viewer + audio player
└── services/
    ├── api.js                   # BASE_URL (192.168.0.10:8000), request(), timeouts
    ├── journalApi.js            # transcribeLocal(), submitAssemblyAI(), checkAssemblyAI()
    └── journalStorage.js        # File-based CRUD: folders, entries, audio, texts
```

### Navigation
Stack navigator (React Navigation Native Stack):
- **Home** → `DirectoryHomeScreen` (no params)
- **Directory** → `DirectoryScreen` (params: `{ id, name }`)
- **Entry** → `EntryScreen` (params: `{ id }`)

### Services

**api.js**: `BASE_URL = http://192.168.0.10:8000`, `REQUEST_TIMEOUT_MS = 30_000`

**journalApi.js**: `UPLOAD_TIMEOUT_MS = 120_000`
- `transcribeLocal(fileUri, filename)` → POST `/transcribe?segment=true` → `{ text, duration_seconds }`
- `submitAssemblyAI(fileUri, filename)` → POST `/transcribe/assemblyai/submit` → `{ assemblyai_id }`
- `checkAssemblyAI(id)` → GET `/transcribe/assemblyai/status/{id}` → `{ status, text?, duration_seconds?, error? }`

**journalStorage.js** — local file-based storage using expo-file-system:
```
DocumentsDir/journal/
├── folders.json      # Folder metadata array
├── entries.json      # Entry metadata array
├── audio/            # {entryId}.m4a files
└── texts/            # journal_{entryId}.txt files
```
Key ops: `createFolder`, `fetchFolders`, `updateFolder`, `deleteFolder` (cascades),
`createEntry`, `fetchEntries`, `fetchEntry`, `deleteEntry`,
`updateEntryToProcessing`, `completeEntry`, `failEntry`, `entryAudioUri`, `getAllTags`

### Screens

**DirectoryHomeScreen**: Folder list with FAB to create. Each folder card shows color accent, name, date, tags. Dialog for create/edit with name, color picker (8 colors), tag autocomplete.

**DirectoryScreen**: Entry list + recording interface. FAB.Group with mic (record) and file upload. Recording overlay shows waveform (40-sample metering history), timer, pause/stop. After recording → engine choice dialog (local vs assemblyai) → transcription. Polls processing entries every 5s.

**EntryScreen**: Full transcript viewer + audio player. Seekable progress bar, rewind/ff 10s, play/pause. Bottom bar: copy text, share text, save audio to Files, save transcript to Files.

### Recording Flow
1. Tap mic FAB → request permission → `audioRecorder.record()` → waveform overlay
2. Stop → copy audio to `journal/audio/{id}.m4a` → `createEntry()` with status `recorded`
3. Tap transcribe → engine choice dialog
4. **Local**: `transcribeLocal()` → `completeEntry()` → done
5. **AssemblyAI**: `submitAssemblyAI()` → `updateEntryToProcessing()` → poll every 5s → `completeEntry()`/`failEntry()`

### Theme (theme.js)
**Colors**: background `#F7F8FA`, surface `#FFFFFF`, foreground `#0F172A`, muted `#64748B`, primary `#3B5EDB`, success `#31C47E`, warning `#F59E0B`, danger `#E04040` (each has a Light variant)

**Spacing** (4px base): xs=4, sm=8, md=12, lg=16, xl=20, xxl=24

**Radii**: sm=6, md=8, lg=12, xl=16

**Typography**: Inter (400, 600, 700) for body/headings, JetBrains Mono (400, 500) for labels/captions

**FOLDER_COLORS**: `["#3B5EDB", "#E04040", "#31C47E", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"]`

### app.json
- Bundle ID: `com.local.diktafon` (iOS & Android)
- Orientation: portrait only
- Permissions: RECORD_AUDIO, READ_EXTERNAL_STORAGE, NSMicrophoneUsageDescription
- Plugins: expo-document-picker (iCloud), expo-asset, expo-font

---

## Data Flow Patterns

1. **Record**: expo-audio → stop → copy to `journal/audio/` → create entry (status: `recorded`)
2. **Transcribe locally**: POST audio to backend → faster-whisper → response with text → `completeEntry()` → write `.txt` + update JSON
3. **Transcribe AssemblyAI**: POST audio → get `assemblyai_id` → poll `/status/{id}` every 5s → complete/fail
4. **Local storage**: JSON metadata (truncated 200-char text) + separate `.txt` for full text (keeps JSON small)
5. **Cascading deletes**: folder → all entries → audio files + text files

## Key Dependencies
- **Backend**: FastAPI, faster-whisper, openai, assemblyai, ffmpeg (system), python-multipart
- **Mobile**: expo ~54, react-native ~0.81, react-native-paper, @react-navigation, expo-audio, expo-file-system, expo-sharing
