import json
import uuid
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

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

def create_folder(name: str) -> dict:
    folder = {
        "id": str(uuid.uuid4()),
        "name": name,
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

    remaining = [e for e in entries if e["folder_id"] != folder_id]
    _save_json(ENTRIES_PATH, remaining)
    _save_json(FOLDERS_PATH, new_folders)
    return True


# ── Entries ──────────────────────────────────────────────

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
    new_entries = [e for e in entries if e["id"] != entry_id]
    if len(new_entries) == len(entries):
        return False

    txt_path = DATA_DIR / f"journal_{entry_id}.txt"
    if txt_path.exists():
        txt_path.unlink()

    _save_json(ENTRIES_PATH, new_entries)
    return True
