"""Keep a local WhisperKit model resident in a private Swift worker process."""

import asyncio
import json
import logging
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from fastapi import HTTPException

from app.core.settings import get_settings

logger = logging.getLogger(__name__)
_model_lock = asyncio.Lock()
_worker: asyncio.subprocess.Process | None = None
_worker_config: tuple[str, ...] | None = None


def _configuration() -> tuple[str, ...]:
    settings = get_settings()
    binary = Path(settings.WHISPERKIT_BINARY_PATH).expanduser()
    model = Path(settings.WHISPERKIT_MODEL_PATH).expanduser()
    tokenizer = Path(settings.WHISPERKIT_TOKENIZER_PATH).expanduser()
    if not binary.is_file() or not os.access(binary, os.X_OK):
        raise HTTPException(503, "Build the local WhisperKit bridge first.")
    if not settings.WHISPERKIT_MODEL_PATH or not model.is_dir():
        raise HTTPException(503, "Set WHISPERKIT_MODEL_PATH to the cached model.")
    if not settings.WHISPERKIT_TOKENIZER_PATH or not tokenizer.is_dir():
        raise HTTPException(503, "Set WHISPERKIT_TOKENIZER_PATH to the tokenizer.")
    return str(binary), str(model), str(tokenizer)


async def _stop_worker() -> None:
    """Caller owns the model lock; discard a stream after cancellation or failure."""
    global _worker, _worker_config
    process, _worker = _worker, None
    _worker_config = None
    if process is None:
        return
    if process.stdin:
        process.stdin.close()
    if process.returncode is None:
        try:
            process.terminate()
        except ProcessLookupError:
            pass
        try:
            await asyncio.wait_for(process.wait(), timeout=5)
        except TimeoutError:
            try:
                process.kill()
            except ProcessLookupError:
                pass
            await process.wait()


async def _read_message() -> dict:
    assert _worker and _worker.stdout
    line = await _worker.stdout.readline()
    if not line or len(line) > 128 * 1024:
        raise ValueError("Worker closed or returned an oversized message")
    message = json.loads(line)
    if not isinstance(message, dict):
        raise ValueError("Worker message is not an object")
    return message


async def _ensure_worker() -> None:
    global _worker, _worker_config
    config = _configuration()
    if _worker and _worker.returncode is None and _worker_config == config:
        return
    await _stop_worker()
    binary, model, tokenizer = config
    _worker = await asyncio.create_subprocess_exec(
        binary, "--serve", "--model-folder", model, "--tokenizer-folder", tokenizer,
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL, limit=128 * 1024,
    )
    if (await _read_message()).get("ready") is not True:
        raise ValueError("WhisperKit worker did not become ready; rebuild the bridge")
    _worker_config = config
    logger.info("WhisperKit model loaded and ready for recordings")


async def warmup() -> None:
    """Startup runs in the background so normal API routes stay available."""
    async with _model_lock:
        try:
            async with asyncio.timeout(240):
                await _ensure_worker()
        except asyncio.CancelledError:
            await _stop_worker()
            raise
        except Exception:
            await _stop_worker()
            logger.warning("WhisperKit warmup failed; next recording will retry")


async def shutdown() -> None:
    async with _model_lock:
        await _stop_worker()


async def transcribe_local(audio: bytes) -> str:
    # A waiter timing out must never kill another recording's active worker.
    try:
        await asyncio.wait_for(_model_lock.acquire(), timeout=240)
    except TimeoutError:
        raise HTTPException(503, "WhisperKit is busy. Please try again.") from None
    try:
        async with asyncio.timeout(240):
            await _ensure_worker()
            assert _worker and _worker.stdin
            with TemporaryDirectory(prefix="nimbus-audio-") as folder:
                path = Path(folder) / "recording.wav"
                path.write_bytes(audio)
                request_id = uuid4().hex
                request = {"id": request_id, "audio": str(path)}
                _worker.stdin.write((json.dumps(request) + "\n").encode())
                await _worker.stdin.drain()
                result = await _read_message()
                if result.get("id") != request_id:
                    raise ValueError("WhisperKit response did not match the request")
                if result.get("error"):
                    raise RuntimeError("WhisperKit failed to transcribe")
                text = result.get("text")
                if not isinstance(text, str):
                    raise ValueError("WhisperKit transcript is not text")
                transcript = text.strip()
        if not transcript:
            raise HTTPException(422, "No speech was recognized. Try a short sentence.")
        if len(transcript) > 12000:
            raise HTTPException(
                422, "The transcript is too long. Record a shorter clip."
            )
        return transcript
    except HTTPException:
        raise
    except asyncio.CancelledError:
        await _stop_worker()
        raise
    except (TimeoutError, OSError, ValueError, RuntimeError):
        await _stop_worker()
        raise HTTPException(
            503, "Local WhisperKit is unavailable or timed out. Please try again."
        ) from None
    finally:
        _model_lock.release()
