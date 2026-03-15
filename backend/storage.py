import json
import uuid
import os
from datetime import datetime
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)


def _index_path():
    return DATA_DIR / "index.json"


def _load_index():
    path = _index_path()
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_index(records):
    with open(_index_path(), "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


def save_transcription(filename: str, text: str, duration_seconds: float) -> dict:
    record_id = str(uuid.uuid4())
    record = {
        "id": record_id,
        "filename": filename,
        "text": text,
        "created_at": datetime.now().isoformat(),
        "duration_seconds": duration_seconds,
    }

    # Save full text in separate file to keep index small
    text_path = DATA_DIR / f"{record_id}.txt"
    with open(text_path, "w", encoding="utf-8") as f:
        f.write(text)

    # Save record (without full text) to index
    index = _load_index()
    index.insert(0, {**record, "text": text[:200] + ("..." if len(text) > 200 else "")})
    _save_index(index)

    return record


def list_transcriptions() -> list:
    return _load_index()


def get_transcription(record_id: str) -> dict | None:
    index = _load_index()
    meta = next((r for r in index if r["id"] == record_id), None)
    if not meta:
        return None

    text_path = DATA_DIR / f"{record_id}.txt"
    if text_path.exists():
        with open(text_path, "r", encoding="utf-8") as f:
            meta = {**meta, "text": f.read()}
    return meta


def delete_transcription(record_id: str) -> bool:
    index = _load_index()
    new_index = [r for r in index if r["id"] != record_id]
    if len(new_index) == len(index):
        return False

    text_path = DATA_DIR / f"{record_id}.txt"
    if text_path.exists():
        text_path.unlink()

    _save_index(new_index)
    return True
