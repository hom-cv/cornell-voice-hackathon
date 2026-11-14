# Handoff

A small native macOS note-taking app for inspection workers. Create a note, type or record an observation, and keep editing. Notes save on this Mac.

## Run

Requires macOS 14+, Swift 6, and Apple Silicon for the intended local speech setup.

```sh
zsh scripts/run.sh
```

The script builds and signs a local `.build/Handoff.app` with a microphone permission description, then opens it. The normal build downloads the pinned Argmax OSS WhisperKit dependency. The first transcription downloads the `base.en` speech model; subsequent transcription runs locally with cached model assets. Allow microphone access when prompted.

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

The text-only build and persistence checks can run without network access. The full WhisperKit build and microphone-to-transcript flow require dependency/model downloads and a local microphone permission grant; those have not been validated in the restricted development environment.

## Checks

```sh
zsh scripts/test.sh
```

Checks cover note persistence, search, delete/undo, transcript routing, legacy workspace migration, and preservation of malformed files. No XCTest installation is required.

See [PROJECT.md](PROJECT.md) for the shared product direction.
