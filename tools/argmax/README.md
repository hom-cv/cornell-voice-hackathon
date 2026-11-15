# Argmax Pro local server

Requires macOS with Apple Silicon, Node.js 22.12+, an Argmax Pro runtime API key,
and the `argmax-local-server` executable supplied by Argmax. Obtain the binary
following the [official local-server guide](https://app.argmaxinc.com/docs/guides/using-local-server).
This launcher does not download the executable.

Add these settings to `backend/.env`:

```dotenv
ARGMAX_TOKEN=your_ax_runtime_api_key
ARGMAX_BINARY_PATH=/absolute/path/to/argmax-local-server
ARGMAX_MODEL=parakeet-v3_494MB
ARGMAX_MODEL_REPO=argmaxinc/parakeetkit-pro
```

`ARGMAX_TOKEN` must contain the runtime key beginning `ax_`, not the secret
registry credential beginning `axst_`. See [Argmax's credential documentation](https://app.argmaxinc.com/docs/guides/upgrading-to-pro-sdk).
Do not commit either credential. Relative executable paths resolve from the
Nimbus repository root.

From the repository root:

```sh
cd tools/argmax
npm install
npm start
```

The launcher loads `backend/.env`, starts the supplied binary, initializes the
model, and waits for readiness. Model initialization may need network access for
its first model download and runtime-key verification. The local WebSocket
endpoint is `ws://127.0.0.1:50060`. Keep this process running alongside the backend;
Ctrl+C shuts down the server and child process.

The runtime API uses Argmax Pro's Deepgram-compatible WebSocket protocol. It is
separate from the open-source WhisperKit HTTP transcription server.
