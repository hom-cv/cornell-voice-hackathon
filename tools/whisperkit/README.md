# Local WhisperKit transcription bridge

A small macOS command-line adapter around Argmax OSS WhisperKit 0.18.0. It uses
local Core ML speech models and tokenizer files. It needs no Pro runtime key and
does not call browser speech recognition or a cloud transcription service.

## Build from cached sources

Requires Apple Silicon, the Swift toolchain, and these local SwiftPM checkouts:
`argmax-oss-swift`, `swift-transformers`, `swift-argument-parser`, `swift-jinja`,
`swift-collections`, `swift-crypto`, `swift-asn1`, and `yyjson`.
All checkouts must be siblings in the same directory. No original checkout is
modified; build output and compiler caches stay under this tool directory.

From the Nimbus repository root:

```sh
export WHISPERKIT_SOURCE_PATH="$HOME/Desktop/local-ai-hackathon/native-application/.build/checkouts/argmax-oss-swift"
./tools/whisperkit/build.sh
```

That path is also the default when `WHISPERKIT_SOURCE_PATH` is unset. The build
uses local path dependencies, including overrides for the SDK's transitive
packages. SwiftPM may warn that these replace upstream remote package identities;
this is intentional to reuse cached packages offline.

## Transcribe

```sh
./tools/whisperkit/.build/release/nimbus-whisperkit \
  --audio /absolute/path/to/recording.wav \
  --model-folder "$HOME/Library/Application Support/InspectionHandoff/SpeechAssets/openai_whisper-base.en" \
  --tokenizer-folder "$HOME/Library/Application Support/InspectionHandoff/SpeechAssets/tokenizer-base.en"
```

The last two arguments may instead be supplied as `WHISPERKIT_MODEL_FOLDER` and
`WHISPERKIT_TOKENIZER_FOLDER` environment variables. The bridge does not load
`.env` itself; the Nimbus backend loads its configuration and passes these paths.

Successful stdout contains one JSON object: `{"text":"recognized speech"}`.
Library diagnostics and failures go to stderr; failure exits with code 1.
Missing assets are rejected before loading, model downloading is disabled, and
unexpected HTTP(S) tokenizer fallbacks are blocked. The process loads the model
for each call, so the first call can take longer while Core ML prepares it.

For CPU-only execution, set `WHISPERKIT_COMPUTE_UNITS=cpu`; otherwise WhisperKit
uses its default Apple Silicon acceleration. This option does not change model
or tokenizer paths.

Validation in this workspace: the release executable built successfully from
cached sources; help and missing-asset handling passed. A real 11-second bundled
speech WAV reached Core ML, but transcription was blocked by the execution
sandbox's IOSurface/cache restrictions, including in CPU mode. Run the bridge
from your normal Terminal to verify recognition on this Mac. The macOS `say`
command produced an empty recording in this sandbox, so no synthetic-speech
success is claimed.
