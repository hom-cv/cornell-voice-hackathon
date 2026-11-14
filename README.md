# Handoff

A small native macOS note-taking app for inspection workers. Create a note, type or record an observation, and keep editing. Notes save on this Mac.

## Run

Requires macOS 14+, Swift 6, and Apple Silicon for the intended local speech setup.

```sh
zsh scripts/run.sh
```

The script builds and signs a local `.build/Handoff.app` with a microphone permission description, then opens it. The normal build downloads the pinned Argmax OSS WhisperKit dependency. The first transcription downloads the public `openai_whisper-base.en` speech model and its tokenizer without authentication; subsequent transcription runs locally with cached model assets. Allow microphone access when prompted.

To try only the editor without downloading speech dependencies:

```sh
HANDOFF_TEXT_ONLY=1 zsh scripts/run.sh
```

That build explicitly disables recording. It does not substitute another speech provider.

## Note-taking

- Create notes with the compose button or **⌘N**; edit the title and body directly.
- Search titles and text, copy a note, or delete it and use **Undo delete**. Delete undo lasts for the current session and covers the most recent deletion.
- **Record note** starts microphone capture. **Stop & transcribe** appends the result to the original note, even if you have switched notes. Existing text is preserved.
- If transcription fails, retry or discard the audio. The original note cannot be deleted while audio is pending. Review transcribed text for recognition mistakes.
- First launch starts empty. Existing prototype notes are preserved, with their earlier structured fields shown in the note body.

Notes are stored as plaintext JSON at `~/Library/Application Support/InspectionHandoff/workspace.json`. Save failures are shown in the UI; malformed workspaces are preserved and editing is disabled. Pending recordings use temporary WAV files and can be retried during the current session. They are removed after successful transcription or explicit discard. Quit/crash recovery for pending recordings is not implemented; finish transcription before quitting.

## Scope

This iteration focuses on note-taking. It has no review panel, RAG workflow, handoff generation, or AI rewriting. Future text-model integration must use Bonsai 2B, 4B, or 9B per `PROJECT.md`.

Voice is wired to [Argmax OSS WhisperKit](https://github.com/argmaxinc/argmax-oss-swift/tree/v0.18.0). No API key is used by this implementation. Argmax Pro is not configured yet; keep any key out of chat, source code, and Git.

Public speech assets are cached under `~/Library/Application Support/InspectionHandoff/SpeechAssets`. Downloads do not read Hugging Face tokens or send an Authorization header, so unrelated cached credentials cannot cause authentication failures. The model source is [Argmax's public Core ML repository](https://huggingface.co/argmaxinc/whisperkit-coreml/tree/main/openai_whisper-base.en); the tokenizer comes from `openai/whisper-base.en`. HTTP failures are reported with their status code. Completed caches are usable offline; incomplete caches are downloaded again. This path has mock-network coverage; a live download is not verified in the restricted development environment.

The text-only and full WhisperKit builds compile, and the note persistence checks pass. The bare executable passed a launch smoke test; launching the packaged `.app` failed in the restricted development environment. The microphone-to-transcript flow still needs a local permission grant and model download to validate end to end.

## Checks

```sh
zsh scripts/test.sh
```

Checks cover note persistence, search, delete/undo, transcript routing, legacy workspace migration, preservation of malformed files, credential-free asset requests, offline caching, partial-download recovery, and HTTP error reporting. No XCTest installation is required.

See [PROJECT.md](PROJECT.md) for the shared product direction.
