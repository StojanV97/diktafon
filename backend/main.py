import os
import tempfile
import shutil
import traceback
import logging
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse

logging.basicConfig(level=logging.INFO)

load_dotenv()

from storage import save_transcription, list_transcriptions, get_transcription, delete_transcription
from transcription import transcribe_audio
from journal_storage import (
    create_folder, list_folders, get_folder, rename_folder, delete_folder,
    save_entry, list_entries, get_entry, delete_entry,
)
from pydantic import BaseModel

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
async def transcribe(file: UploadFile = File(...)):
    suffix = Path(file.filename).suffix.lower()
    if suffix not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{suffix}'. Supported: {', '.join(SUPPORTED_FORMATS)}"
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = os.path.join(tmpdir, file.filename)

        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        size = os.path.getsize(tmp_path)
        if size > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large (max 500MB)")
        if size == 0:
            raise HTTPException(status_code=400, detail="File is empty")

        try:
            text, duration = transcribe_audio(tmp_path, file.filename)
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

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
    name: str


@app.post("/journal/folders")
def journal_create_folder(body: FolderBody):
    return create_folder(body.name)


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
    if not get_folder(folder_id):
        raise HTTPException(status_code=404, detail="Folder not found")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in SUPPORTED_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{suffix}'. Supported: {', '.join(SUPPORTED_FORMATS)}"
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = os.path.join(tmpdir, file.filename)

        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        size = os.path.getsize(tmp_path)
        if size > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="File too large (max 500MB)")
        if size == 0:
            raise HTTPException(status_code=400, detail="File is empty")

        try:
            text, duration = transcribe_audio(tmp_path, file.filename)
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    record = save_entry(
        folder_id=folder_id,
        filename=file.filename,
        text=text,
        duration_seconds=duration,
    )
    return record


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
    return entry


@app.delete("/journal/entries/{entry_id}")
def journal_delete_entry(entry_id: str):
    ok = delete_entry(entry_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"deleted": True}
