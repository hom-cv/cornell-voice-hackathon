import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const envFile = fileURLToPath(new URL('../../backend/.env', import.meta.url))
let server
let keepAlive
let stopping = false
let phase = 'configuration'

function fail(message) {
  throw new Error(message)
}

async function cleanup() {
  if (stopping) return
  stopping = true
  clearInterval(keepAlive)
  if (!server) return
  try { await server.shutdown() } catch { /* It may not have initialized yet. */ }
  try { await server.stopProcess() } catch { /* It may already have exited. */ }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(0))
  })
}

async function main() {
  if (typeof process.loadEnvFile !== 'function') {
    fail('Use Node.js 22.12 or newer to launch Argmax.')
  }
  try {
    process.loadEnvFile(envFile)
  } catch {
    fail('Cannot load backend/.env. Create it before starting Argmax.')
  }

  const apiKey = process.env.ARGMAX_TOKEN?.trim()
  if (!apiKey || !/^ax_[A-Za-z0-9_-]+$/.test(apiKey)) {
    fail('Set ARGMAX_TOKEN in backend/.env to an ax_ runtime API key. An axst_ registry token cannot enable transcription.')
  }
  const configuredBinary = process.env.ARGMAX_BINARY_PATH?.trim()
  if (!configuredBinary) {
    fail('Set ARGMAX_BINARY_PATH in backend/.env to the Argmax Pro local-server executable.')
  }
  const binaryPath = resolve(projectRoot, configuredBinary)
  try {
    if (!(await stat(binaryPath)).isFile()) throw new Error('Not a file')
    await access(binaryPath, constants.X_OK)
  } catch {
    fail('ARGMAX_BINARY_PATH must point to an existing executable file.')
  }

  phase = 'package loading'
  const { ArgmaxLocalServer } = await import('@argmaxinc/local-server')
  server = new ArgmaxLocalServer({
    binaryPath,
    host: '127.0.0.1',
    port: 50060,
    apiKey,
    autoRestart: false,
    verbose: false,
  })
  phase = 'server startup'
  await server.startProcess()
  if (stopping) return
  phase = 'model initialization'
  await server.init({
    apiKey,
    model: process.env.ARGMAX_MODEL?.trim() || 'parakeet-v3_494MB',
    modelRepo: process.env.ARGMAX_MODEL_REPO?.trim() || 'argmaxinc/parakeetkit-pro',
  })
  if (stopping) return
  phase = 'readiness check'
  await server.waitForReady(120_000)
  if (stopping) return
  console.log('Argmax Pro is ready at ws://127.0.0.1:50060. Press Ctrl+C to stop.')
  keepAlive = setInterval(() => {}, 60_000)
}

try {
  await main()
} catch (error) {
  // SDK errors may include request details. Never print them or the runtime key.
  if (phase === 'configuration') {
    console.error(error instanceof Error ? error.message : 'Argmax configuration is invalid.')
  } else if (phase === 'package loading') {
    console.error('Argmax wrapper is unavailable. Run npm install in tools/argmax first.')
  } else {
    console.error(`Argmax failed during ${phase}. Check the executable, runtime API key, model access, and whether port 50060 is already in use.`)
  }
  await cleanup()
  process.exitCode = 1
}
