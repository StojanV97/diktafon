import os
import math
import subprocess
import tempfile

_openai_client = None
_local_model = None

MODEL = "whisper-1"
MAX_CHUNK_BYTES = 24 * 1024 * 1024  # 24MB to stay under API limit
CHUNK_DURATION_SECONDS = 600  # 10-minute chunks for large files

# Prompt hint — include Serbian words/phrases that Whisper commonly gets wrong.
# The more domain-specific terms you add here, the better results you'll get.
PROMPT = (
    "Ovo je transkript na srpskom jeziku. "
    "Koristi pravilnu srpsku gramatiku, interpunkciju i dijakritičke znakove: č, ć, š, ž, đ. "
    "Rečenice završavaj tačkom. Imena piši velikim slovom."
)


def _get_openai_client():
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI
        key = (os.environ.get("OPENAI_API_KEY") or "").strip()
        if not key or key == "your_openai_api_key_here":
            raise RuntimeError("OPENAI_API_KEY is not set in .env")
        _openai_client = OpenAI(api_key=key)
    return _openai_client


def _get_local_model():
    global _local_model
    if _local_model is None:
        from faster_whisper import WhisperModel
        size = os.environ.get("WHISPER_MODEL_SIZE", "small")
        _local_model = WhisperModel(size, device="cpu", compute_type="int8")
    return _local_model


def _preprocess_audio(input_path: str, output_path: str):
    """
    Preprocess audio with ffmpeg for optimal Whisper accuracy:
    - Convert to 16kHz mono WAV (Whisper's native format)
    - Apply high-pass filter to remove low rumble
    - Apply noise reduction (afftdn)
    - Normalize volume
    """
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", input_path,
            "-vn",                  # strip video
            "-ac", "1",             # mono
            "-ar", "16000",         # 16kHz (Whisper's training sample rate)
            "-af", ",".join([
                "highpass=f=80",            # remove low-frequency rumble
                "afftdn=nf=-20",            # FFT-based noise reduction
                "loudnorm=I=-16:TP=-1.5",   # normalize loudness (EBU R128)
            ]),
            "-c:a", "pcm_s16le",   # 16-bit PCM WAV — lossless, no compression artifacts
            output_path,
        ],
        check=True,
        capture_output=True,
    )


def _get_duration(file_path: str) -> float:
    """Get audio duration in seconds using ffprobe."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path,
        ],
        capture_output=True,
        text=True,
    )
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


# ---------------------------------------------------------------------------
# OpenAI engine
# ---------------------------------------------------------------------------

def _transcribe_single_openai(file_path: str, context: str = "") -> tuple[str, float]:
    duration = _get_duration(file_path)
    prompt = context[-200:] if context else PROMPT
    with open(file_path, "rb") as f:
        response = _get_openai_client().audio.transcriptions.create(
            model=MODEL,
            file=f,
            language="sr",
            temperature=0,
            prompt=prompt,
        )
    return response.text, duration


def _transcribe_chunked_openai(file_path: str) -> tuple[str, float]:
    total_duration = _get_duration(file_path)
    num_chunks = math.ceil(total_duration / CHUNK_DURATION_SECONDS)

    texts = []
    with tempfile.TemporaryDirectory() as tmpdir:
        for i in range(num_chunks):
            start = i * CHUNK_DURATION_SECONDS
            chunk_path = os.path.join(tmpdir, f"chunk_{i:03d}.wav")

            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-ss", str(start),
                    "-i", file_path,
                    "-t", str(CHUNK_DURATION_SECONDS),
                    "-c:a", "pcm_s16le",
                    "-ar", "16000",
                    "-ac", "1",
                    chunk_path,
                ],
                check=True,
                capture_output=True,
            )

            if not os.path.exists(chunk_path) or os.path.getsize(chunk_path) == 0:
                continue

            # For continuity, use the end of the previous chunk's text as prompt
            chunk_prompt = PROMPT
            if texts:
                # Last 200 chars of previous chunk helps Whisper maintain context
                chunk_prompt = texts[-1][-200:]

            with open(chunk_path, "rb") as f:
                response = _get_openai_client().audio.transcriptions.create(
                    model=MODEL,
                    file=f,
                    language="sr",
                    temperature=0,
                    prompt=chunk_prompt,
                )
            texts.append(response.text.strip())

    return " ".join(texts), total_duration


# ---------------------------------------------------------------------------
# Local engine (faster-whisper)
# ---------------------------------------------------------------------------

def _transcribe_single_local(file_path: str, context: str = "") -> tuple[str, float]:
    duration = _get_duration(file_path)
    prompt = context[-200:] if context else PROMPT
    model = _get_local_model()
    segments, _ = model.transcribe(
        file_path, language="sr", initial_prompt=prompt, temperature=0,
        vad_filter=True,
    )
    text = " ".join(seg.text.strip() for seg in segments)
    return text, duration


def _transcribe_chunked_local(file_path: str) -> tuple[str, float]:
    total_duration = _get_duration(file_path)
    num_chunks = math.ceil(total_duration / CHUNK_DURATION_SECONDS)

    texts = []
    with tempfile.TemporaryDirectory() as tmpdir:
        for i in range(num_chunks):
            start = i * CHUNK_DURATION_SECONDS
            chunk_path = os.path.join(tmpdir, f"chunk_{i:03d}.wav")

            subprocess.run(
                [
                    "ffmpeg", "-y",
                    "-ss", str(start),
                    "-i", file_path,
                    "-t", str(CHUNK_DURATION_SECONDS),
                    "-c:a", "pcm_s16le",
                    "-ar", "16000",
                    "-ac", "1",
                    chunk_path,
                ],
                check=True,
                capture_output=True,
            )

            if not os.path.exists(chunk_path) or os.path.getsize(chunk_path) == 0:
                continue

            model = _get_local_model()
            chunk_prompt = PROMPT
            if texts:
                chunk_prompt = texts[-1][-200:]

            segments, _ = model.transcribe(
                chunk_path, language="sr", initial_prompt=chunk_prompt, temperature=0,
                vad_filter=True,
            )
            texts.append(" ".join(seg.text.strip() for seg in segments))

    return " ".join(texts), total_duration


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def transcribe_audio(file_path: str, original_filename: str, context: str = "") -> tuple[str, float]:
    """
    Transcribe an audio file using local faster-whisper or OpenAI Whisper API.
    Preprocesses audio for quality, then chunks if needed.
    When context is provided, uses last 200 chars as the Whisper prompt
    for cross-segment continuity.
    Returns (transcription_text, duration_seconds).
    """
    engine = os.environ.get("TRANSCRIPTION_ENGINE", "local").strip().lower()

    with tempfile.TemporaryDirectory() as tmpdir:
        # Step 1: preprocess for optimal quality
        cleaned_path = os.path.join(tmpdir, "cleaned.wav")
        _preprocess_audio(file_path, cleaned_path)

        cleaned_size = os.path.getsize(cleaned_path)

        if engine == "openai":
            if cleaned_size <= MAX_CHUNK_BYTES:
                return _transcribe_single_openai(cleaned_path, context)
            else:
                return _transcribe_chunked_openai(cleaned_path)
        else:
            if cleaned_size <= MAX_CHUNK_BYTES:
                return _transcribe_single_local(cleaned_path, context)
            else:
                return _transcribe_chunked_local(cleaned_path)
