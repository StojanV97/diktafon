import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

AUDIO_DIR = DATA_DIR / "audio"
AUDIO_DIR.mkdir(exist_ok=True)

FOLDERS_PATH = DATA_DIR / "journal_folders.json"
ENTRIES_PATH = DATA_DIR / "journal_entries.json"


def _load_json(path):
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ── Folders ──────────────────────────────────────────────

def create_folder(name: str, engine: str = "local") -> dict:
    folder = {
        "id": str(uuid.uuid4()),
        "name": name,
        "engine": engine,
        "created_at": datetime.now().isoformat(),
    }
    folders = _load_json(FOLDERS_PATH)
    folders.insert(0, folder)
    _save_json(FOLDERS_PATH, folders)
    return folder


def list_folders() -> list:
    return _load_json(FOLDERS_PATH)


def get_folder(folder_id: str) -> dict | None:
    folders = _load_json(FOLDERS_PATH)
    return next((f for f in folders if f["id"] == folder_id), None)


def rename_folder(folder_id: str, name: str) -> dict | None:
    folders = _load_json(FOLDERS_PATH)
    folder = next((f for f in folders if f["id"] == folder_id), None)
    if not folder:
        return None
    folder["name"] = name
    _save_json(FOLDERS_PATH, folders)
    return folder


def delete_folder(folder_id: str) -> bool:
    folders = _load_json(FOLDERS_PATH)
    new_folders = [f for f in folders if f["id"] != folder_id]
    if len(new_folders) == len(folders):
        return False

    # Delete all entries in this folder
    entries = _load_json(ENTRIES_PATH)
    to_delete = [e for e in entries if e["folder_id"] == folder_id]
    for entry in to_delete:
        txt_path = DATA_DIR / f"journal_{entry['id']}.txt"
        if txt_path.exists():
            txt_path.unlink()
        audio_file = entry.get("audio_file")
        if audio_file:
            audio_path = AUDIO_DIR / audio_file
            if audio_path.exists():
                audio_path.unlink()

    remaining = [e for e in entries if e["folder_id"] != folder_id]
    _save_json(ENTRIES_PATH, remaining)
    _save_json(FOLDERS_PATH, new_folders)
    return True


# ── Entries ──────────────────────────────────────────────

def save_recorded_entry(folder_id: str, filename: str, src_audio_path: str) -> dict:
    """Create a journal entry in 'recorded' state with a persisted audio file."""
    entry_id = str(uuid.uuid4())
    audio_filename = f"{entry_id}.m4a"
    shutil.copy2(src_audio_path, AUDIO_DIR / audio_filename)
    entry = {
        "id": entry_id,
        "folder_id": folder_id,
        "filename": filename,
        "text": "",
        "created_at": datetime.now().isoformat(),
        "duration_seconds": 0,
        "status": "recorded",
        "audio_file": audio_filename,
    }
    entries = _load_json(ENTRIES_PATH)
    entries.insert(0, entry)
    _save_json(ENTRIES_PATH, entries)
    return entry


def update_entry_to_processing(entry_id: str, assemblyai_id: str) -> dict:
    """Transition a 'recorded' entry to 'processing' state with an AssemblyAI job ID."""
    entries = _load_json(ENTRIES_PATH)
    entry = next((e for e in entries if e["id"] == entry_id), None)
    if not entry:
        return None
    entry["status"] = "processing"
    entry["assemblyai_id"] = assemblyai_id
    _save_json(ENTRIES_PATH, entries)
    return entry


def save_pending_entry(folder_id: str, filename: str, assemblyai_id: str) -> dict:
    """Create a journal entry in 'processing' state (AssemblyAI async flow)."""
    entry_id = str(uuid.uuid4())
    entry = {
        "id": entry_id,
        "folder_id": folder_id,
        "filename": filename,
        "text": "",
        "created_at": datetime.now().isoformat(),
        "duration_seconds": 0,
        "status": "processing",
        "assemblyai_id": assemblyai_id,
    }
    entries = _load_json(ENTRIES_PATH)
    entries.insert(0, entry)
    _save_json(ENTRIES_PATH, entries)
    return entry


def complete_entry(entry_id: str, text: str, duration_seconds: float) -> dict:
    """Update a 'processing' entry with the completed transcription."""
    entries = _load_json(ENTRIES_PATH)
    entry = next((e for e in entries if e["id"] == entry_id), None)
    if not entry:
        return None

    entry["text"] = text[:200] + ("..." if len(text) > 200 else "")
    entry["duration_seconds"] = duration_seconds
    entry["status"] = "done"
    entry.pop("assemblyai_id", None)

    txt_path = DATA_DIR / f"journal_{entry_id}.txt"
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(text)

    _save_json(ENTRIES_PATH, entries)
    return {**entry, "text": text}


def fail_entry(entry_id: str, error: str) -> dict:
    """Update a 'processing' entry with an error status."""
    entries = _load_json(ENTRIES_PATH)
    entry = next((e for e in entries if e["id"] == entry_id), None)
    if not entry:
        return None

    entry["status"] = "error"
    entry["text"] = f"Greška: {error}"
    entry.pop("assemblyai_id", None)
    _save_json(ENTRIES_PATH, entries)
    return entry


def save_entry(folder_id: str, filename: str, text: str, duration_seconds: float) -> dict:
    entry_id = str(uuid.uuid4())
    entry = {
        "id": entry_id,
        "folder_id": folder_id,
        "filename": filename,
        "text": text[:200] + ("..." if len(text) > 200 else ""),
        "created_at": datetime.now().isoformat(),
        "duration_seconds": duration_seconds,
    }

    txt_path = DATA_DIR / f"journal_{entry_id}.txt"
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(text)

    entries = _load_json(ENTRIES_PATH)
    entries.insert(0, entry)
    _save_json(ENTRIES_PATH, entries)

    return {**entry, "text": text}


def list_entries(folder_id: str) -> list:
    entries = _load_json(ENTRIES_PATH)
    return [e for e in entries if e["folder_id"] == folder_id]


def get_entry(entry_id: str) -> dict | None:
    entries = _load_json(ENTRIES_PATH)
    meta = next((e for e in entries if e["id"] == entry_id), None)
    if not meta:
        return None

    txt_path = DATA_DIR / f"journal_{entry_id}.txt"
    if txt_path.exists():
        with open(txt_path, "r", encoding="utf-8") as f:
            meta = {**meta, "text": f.read()}
    return meta


def delete_entry(entry_id: str) -> bool:
    entries = _load_json(ENTRIES_PATH)
    entry = next((e for e in entries if e["id"] == entry_id), None)
    if not entry:
        return False

    new_entries = [e for e in entries if e["id"] != entry_id]

    txt_path = DATA_DIR / f"journal_{entry_id}.txt"
    if txt_path.exists():
        txt_path.unlink()

    audio_file = entry.get("audio_file")
    if audio_file:
        audio_path = AUDIO_DIR / audio_file
        if audio_path.exists():
            audio_path.unlink()

    _save_json(ENTRIES_PATH, new_entries)
    return True
