"""Use the cached Apple Silicon WhisperKit model through our Swift executable."""

import asyncio
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import HTTPException

from app.core.settings import get_settings

_model_lock = asyncio.Semaphore(1)


async def transcribe_local(audio: bytes) -> str:
    settings = get_settings()
    binary = Path(settings.WHISPERKIT_BINARY_PATH).expanduser()
    model = Path(settings.WHISPERKIT_MODEL_PATH).expanduser()
    tokenizer = Path(settings.WHISPERKIT_TOKENIZER_PATH).expanduser()
    if not binary.is_file() or not os.access(binary, os.X_OK):
        raise HTTPException(
            503, "Build the local WhisperKit bridge in tools/whisperkit first."
        )
    if not settings.WHISPERKIT_MODEL_PATH or not model.is_dir():
        raise HTTPException(
            503, "Set WHISPERKIT_MODEL_PATH to the cached speech model."
        )
    if not settings.WHISPERKIT_TOKENIZER_PATH or not tokenizer.is_dir():
        raise HTTPException(
            503, "Set WHISPERKIT_TOKENIZER_PATH to the cached tokenizer."
        )
    process = None
    try:
        async with asyncio.timeout(240):
            async with _model_lock:
                with TemporaryDirectory(prefix="nimbus-audio-") as folder:
                    path = Path(folder) / "recording.wav"
                    path.write_bytes(audio)
                    process = await asyncio.create_subprocess_exec(
                        str(binary),
                        "--audio",
                        str(path),
                        "--model-folder",
                        str(model),
                        "--tokenizer-folder",
                        str(tokenizer),
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.DEVNULL,
                    )
                    output = await process.stdout.read(128 * 1024 + 1)
                    if len(output) > 128 * 1024:
                        raise HTTPException(502, "WhisperKit returned too much text.")
                    await process.wait()
                    if process.returncode:
                        raise HTTPException(
                            503,
                            "WhisperKit could not process this clip. "
                            "Check the local model and try again.",
                        )
        result = json.loads(output)
        transcript = result["text"].strip()
        if not transcript:
            raise HTTPException(422, "No speech was recognized. Try a short sentence.")
        if len(transcript) > 12000:
            raise HTTPException(
                422, "The transcript is too long. Record a shorter clip."
            )
        return transcript
    except HTTPException:
        raise
    except (TimeoutError, OSError):
        raise HTTPException(
            503, "Local WhisperKit is unavailable or timed out. Please try again."
        ) from None
    except (ValueError, KeyError, AttributeError, TypeError):
        raise HTTPException(
            502, "WhisperKit returned an unreadable transcript."
        ) from None
    finally:
        if process is not None and process.returncode is None:
            process.kill()
            await process.wait()
