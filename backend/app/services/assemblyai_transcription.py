"""
AssemblyAI transcription + speaker diarization for meeting recordings.
"""
from __future__ import annotations
import asyncio
import re

import httpx

from app.core.config import settings

BASE_URL = "https://api.assemblyai.com/v2"
UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024  # 5MB — stream the file instead of loading it whole into memory


def _format_ms(ms: int) -> str:
    """12345 (ms) -> 'MM:SS' (or 'H:MM:SS' past the first hour)."""
    total = ms // 1000
    hh, mm, ss = total // 3600, (total % 3600) // 60, total % 60
    return f"{hh}:{mm:02d}:{ss:02d}" if hh else f"{mm:02d}:{ss:02d}"


def _collapse_char_runs(text: str) -> str:
    """AssemblyAI occasionally gets stuck on a held/filler sound (silence, hums,
    hold music) and transcribes it as the same character repeated hundreds of
    times (e.g. a single "Мммммм...ммм" utterance). Collapse any character
    repeated 7+ times in a row down to 3 — keeps the "filler sound" meaning
    without the wall of text."""
    return re.sub(r"(\S)\1{6,}", lambda m: m.group(1) * 3, text)


def _collapse_repeated_phrases(text: str) -> str:
    """Same failure mode, but at the word level: AssemblyAI repeats the same
    word or short phrase dozens of times in a row (e.g. "так, так, так, так...").
    Collapse any 1-3 word phrase repeated 3+ times consecutively down to 2
    occurrences."""
    words = text.split(" ")
    n = len(words)

    def norm(w: str) -> str:
        return w.strip(".,!?;:—-").lower()

    result: list[str] = []
    i = 0
    while i < n:
        collapsed = False
        for phrase_len in (1, 2, 3):
            if i + phrase_len > n:
                continue
            phrase = [norm(w) for w in words[i:i + phrase_len]]
            if not any(phrase):
                continue
            repeats = 1
            j = i + phrase_len
            while j + phrase_len <= n and [norm(w) for w in words[j:j + phrase_len]] == phrase:
                repeats += 1
                j += phrase_len
            if repeats >= 3:
                keep = min(repeats, 2) * phrase_len
                result.extend(words[i:i + keep])
                i = j
                collapsed = True
                break
        if not collapsed:
            result.append(words[i])
            i += 1
    return " ".join(result)


def _clean_utterance_text(text: str) -> str:
    return _collapse_repeated_phrases(_collapse_char_runs(text))


async def _read_in_chunks(local_path: str):
    # httpx.AsyncClient requires an async iterable for streamed request bodies —
    # a plain sync generator raises "Attempted to send a sync request with an
    # AsyncClient instance."
    with open(local_path, "rb") as f:
        while chunk := f.read(UPLOAD_CHUNK_SIZE):
            yield chunk


async def transcribe_meeting(local_path: str) -> dict:
    """
    Upload a local recording to AssemblyAI, transcribe it with speaker
    labels (Ukrainian), and return {"transcript": str, "duration_seconds": int, "speaker_count": int}.
    """
    headers = {"authorization": settings.ASSEMBLYAI_API_KEY}

    async with httpx.AsyncClient(timeout=600) as client:
        upload_resp = await client.post(f"{BASE_URL}/upload", headers=headers, content=_read_in_chunks(local_path))
        upload_resp.raise_for_status()
        audio_url = upload_resp.json()["upload_url"]

        transcript_resp = await client.post(
            f"{BASE_URL}/transcript",
            headers=headers,
            json={"audio_url": audio_url, "speaker_labels": True, "language_code": "uk"},
        )
        transcript_resp.raise_for_status()
        transcript_id = transcript_resp.json()["id"]

        poll_url = f"{BASE_URL}/transcript/{transcript_id}"
        while True:
            result = (await client.get(poll_url, headers=headers)).json()
            status = result["status"]
            if status == "completed":
                break
            if status == "error":
                raise RuntimeError(f"AssemblyAI transcription failed: {result.get('error')}")
            await asyncio.sleep(10)

    utterances = result.get("utterances", []) or []
    cleaned = [_clean_utterance_text(u["text"]) for u in utterances]
    lines = [f"[{_format_ms(u['start'])}] Спікер {u['speaker']}: {text}" for u, text in zip(utterances, cleaned)]
    speakers = {u["speaker"] for u in utterances}

    # Per-speaker talk time from utterance start/end — used only for the talk/listen
    # ratio stat, never sent to Claude, so it cannot influence score/criteria.
    talk_seconds: dict[str, float] = {}
    for u in utterances:
        duration = (u["end"] - u["start"]) / 1000
        if duration > 0:
            talk_seconds[u["speaker"]] = talk_seconds.get(u["speaker"], 0.0) + duration

    # Word count AFTER collapsing filler/stuck-sound artifacts — a recording that's
    # mostly silence, hold music, or a hum gets almost entirely collapsed by
    # _clean_utterance_text, so what's left is a reliable signal of real, usable
    # content (as opposed to the raw transcript length, which a stuck "Мммм..."
    # can inflate to hundreds of characters despite carrying zero information).
    word_count = sum(len(text.split()) for text in cleaned)

    return {
        "transcript": "\n".join(lines),
        "duration_seconds": int(result.get("audio_duration") or 0),
        "speaker_count": len(speakers),
        "word_count": word_count,
        "speaker_talk_seconds": talk_seconds,
    }
