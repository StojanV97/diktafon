import os
import tempfile
import shutil
import traceback
import logging
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from typing import Literal

logging.basicConfig(level=logging.INFO)

load_dotenv()

from storage import save_transcription, list_transcriptions, get_transcription, delete_transcription
from transcription import transcribe_audio
from journal_storage import (
    AUDIO_DIR,
    create_folder, list_folders, get_folder, rename_folder, delete_folder,
    save_entry, save_recorded_entry, save_pending_entry, complete_entry, fail_entry,
    update_entry_to_processing, list_entries, get_entry, delete_entry,
)
from transcription_assemblyai import submit_transcription, check_transcription
from pydantic import BaseModel, Field

app = FastAPI(title="Diktafon API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPORTED_FORMATS = {
    ".mp3", ".mp4", ".mpeg", ".mpga", ".m4a",
    ".wav", ".webm", ".ogg", ".flac", ".aac",
}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    context: str = Query(""),
    segment: bool = Query(False),
):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{suffix}'. Supported: {', '.join(SUPPORTED_FORMATS)}"
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        safe_filename = Path(file.filename).name or "upload"
        tmp_path = os.path.join(tmpdir, safe_filename)

        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        size = os.path.getsize(tmp_path)
        if size > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large (max 500MB)")
        if size == 0:
            raise HTTPException(status_code=400, detail="File is empty")

        try:
            text, duration = transcribe_audio(tmp_path, file.filename, context)
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    if segment:
        return {"text": text, "duration_seconds": duration}

    record = save_transcription(
        filename=file.filename,
        text=text,
        duration_seconds=duration,
    )
    return record


@app.get("/transcriptions")
def get_transcriptions():
    return list_transcriptions()


@app.get("/transcriptions/{record_id}")
def get_one(record_id: str):
    record = get_transcription(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Transcription not found")
    return record


@app.delete("/transcriptions/{record_id}")
def remove(record_id: str):
    ok = delete_transcription(record_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Transcription not found")
    return {"deleted": True}


@app.get("/transcriptions/{record_id}/download")
def download(record_id: str):
    record = get_transcription(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Transcription not found")

    txt_path = Path(__file__).parent / "data" / f"{record_id}.txt"
    if not txt_path.exists():
        return PlainTextResponse(record.get("text", ""))

    safe_name = Path(record["filename"]).stem + "_transkript.txt"
    return FileResponse(
        path=str(txt_path),
        media_type="text/plain; charset=utf-8",
        filename=safe_name,
    )


# ── Journal ──────────────────────────────────────────────

class FolderBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    engine: Literal["local", "assemblyai"] = "local"


@app.post("/journal/folders")
def journal_create_folder(body: FolderBody):
    return create_folder(body.name, body.engine)


@app.get("/journal/folders")
def journal_list_folders():
    return list_folders()


@app.put("/journal/folders/{folder_id}")
def journal_rename_folder(folder_id: str, body: FolderBody):
    folder = rename_folder(folder_id, body.name)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


@app.delete("/journal/folders/{folder_id}")
def journal_delete_folder(folder_id: str):
    ok = delete_folder(folder_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Folder not found")
    return {"deleted": True}


@app.post("/journal/folders/{folder_id}/entries")
async def journal_create_entry(folder_id: str, file: UploadFile = File(...)):
    folder = get_folder(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{suffix}'. Supported: {', '.join(SUPPORTED_FORMATS)}"
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        safe_filename = Path(file.filename).name or "upload"
        tmp_path = os.path.join(tmpdir, safe_filename)

        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        size = os.path.getsize(tmp_path)
        if size > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large (max 500MB)")
        if size == 0:
            raise HTTPException(status_code=400, detail="File is empty")

        return save_recorded_entry(folder_id, file.filename, tmp_path)


@app.post("/journal/entries/{entry_id}/transcribe")
async def journal_transcribe_entry(entry_id: str):
    entry = get_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if entry.get("status") != "recorded":
        raise HTTPException(status_code=400, detail="Entry is not in 'recorded' state")

    audio_path = AUDIO_DIR / entry["audio_file"]
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    folder = get_folder(entry["folder_id"])
    engine = folder.get("engine", "local") if folder else "local"

    if engine == "assemblyai":
        try:
            transcript_id = submit_transcription(str(audio_path))
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"AssemblyAI submission failed: {str(e)}")
        return update_entry_to_processing(entry_id, transcript_id)

    try:
        text, duration = transcribe_audio(str(audio_path), entry["filename"])
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    return complete_entry(entry_id, text, duration)


@app.get("/journal/folders/{folder_id}/entries")
def journal_list_entries(folder_id: str):
    if not get_folder(folder_id):
        raise HTTPException(status_code=404, detail="Folder not found")
    return list_entries(folder_id)


@app.get("/journal/entries/{entry_id}")
def journal_get_entry(entry_id: str):
    entry = get_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    if entry.get("status") == "processing" and entry.get("assemblyai_id"):
        try:
            result = check_transcription(entry["assemblyai_id"])
        except Exception as e:
            traceback.print_exc()
            return entry  # Don't fail the request; let mobile retry

        if result is None:
            return entry  # Still processing

        if "error" in result:
            return fail_entry(entry_id, result["error"]) or entry

        return complete_entry(entry_id, result["text"], result["duration_seconds"]) or entry

    return entry


@app.delete("/journal/entries/{entry_id}")
def journal_delete_entry(entry_id: str):
    ok = delete_entry(entry_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"deleted": True}
