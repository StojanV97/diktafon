import os
import math


def _get_client():
    import assemblyai as aai
    key = (os.environ.get("ASSEMBLYAI_API_KEY") or "").strip()
    if not key or key == "your_assemblyai_api_key_here":
        raise RuntimeError("ASSEMBLYAI_API_KEY is not set in .env")
    aai.settings.api_key = key
    return aai


def submit_transcription(file_path: str) -> str:
    """
    Upload audio file and create an AssemblyAI transcription job.
    Returns the transcript ID immediately (non-blocking).
    """
    aai = _get_client()
    config = aai.TranscriptionConfig(
        speaker_labels=True,
        speech_models=["universal-3-pro", "universal-2"],
        language_code="sr",
    )
    transcriber = aai.Transcriber(config=config)
    transcript = transcriber.submit(file_path)
    return transcript.id


def check_transcription(transcript_id: str) -> dict | None:
    """
    Check the status of an AssemblyAI transcription job.
    Returns:
      {"text": str, "duration_seconds": float}  — if completed
      {"error": str}                             — if failed
      None                                       — if still processing
    """
    aai = _get_client()
    transcript = aai.Transcript.get_by_id(transcript_id)

    if transcript.status == aai.TranscriptStatus.completed:
        text, duration = _format_utterances(transcript)
        return {"text": text, "duration_seconds": duration}

    if transcript.status == aai.TranscriptStatus.error:
        return {"error": transcript.error or "Unknown AssemblyAI error"}

    # queued or processing
    return None


def _format_utterances(transcript) -> tuple[str, float]:
    """
    Format speaker-labeled utterances as:
      [Govornik A – 0:00] Zdravo, kako si?
      [Govornik B – 0:07] Dobro hvala.
    Falls back to plain text if no utterances.
    """
    duration = (transcript.audio_duration or 0.0)

    if not transcript.utterances:
        return (transcript.text or ""), duration

    lines = []
    for u in transcript.utterances:
        start_sec = (u.start or 0) / 1000
        m = math.floor(start_sec / 60)
        s = math.floor(start_sec % 60)
        timestamp = f"{m}:{s:02d}"
        lines.append(f"[Govornik {u.speaker} – {timestamp}] {u.text}")

    return "\n".join(lines), duration
