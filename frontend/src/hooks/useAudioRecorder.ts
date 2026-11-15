import { useEffect, useRef, useState } from 'react'

async function toWav(blob: Blob): Promise<Blob> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const frames = Math.max(1, Math.min(90 * 16000, Math.ceil(decoded.duration * 16000)))
    const offline = new OfflineAudioContext(1, frames, 16000)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const audio = await offline.startRendering()
    const samples = audio.getChannelData(0)
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)
    const write = (offset: number, text: string) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)))
    write(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); write(8, 'WAVE')
    write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
    view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true)
    view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data')
    view.setUint32(40, samples.length * 2, true)
    samples.forEach((value, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, value)) * (value < 0 ? 32768 : 32767), true))
    return new Blob([buffer], { type: 'audio/wav' })
  } finally { await context.close() }
}

export function useAudioRecorder(onAudio: (audio: Blob) => void) {
  const [recording, setRecording] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const active = useRef(true)
  const version = useRef(0)
  const callback = useRef(onAudio)
  useEffect(() => { callback.current = onAudio }, [onAudio])

  function release() {
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    if (timer.current) clearInterval(timer.current)
    timer.current = null
  }

  function cancel() {
    version.current++
    if (recorder.current?.state === 'recording') recorder.current.stop()
    release()
    setRecording(false)
    setPreparing(false)
  }

  useEffect(() => {
    active.current = true
    const generation = version
    return () => {
      active.current = false
      generation.current++
      if (recorder.current?.state === 'recording') recorder.current.stop()
      stream.current?.getTracks().forEach((track) => track.stop())
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  async function start() {
    if (preparing || recording) return
    const current = ++version.current
    setError(''); setPreparing(true); setSeconds(0)
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!active.current || current !== version.current) { media.getTracks().forEach((track) => track.stop()); return }
      stream.current = media
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((mime) => MediaRecorder.isTypeSupported(mime))
      const instance = new MediaRecorder(media, type ? { mimeType: type } : undefined)
      recorder.current = instance
      const chunks: Blob[] = []
      instance.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      instance.onerror = () => { if (active.current && current === version.current) { setError('Recording failed. Please try again.'); cancel() } }
      instance.onstop = async () => {
        if (!active.current || current !== version.current) return
        release()
        setRecording(false); setPreparing(true)
        try {
          const audio = await toWav(new Blob(chunks, { type: instance.mimeType }))
          if (active.current && current === version.current) callback.current(audio)
        } catch {
          if (active.current && current === version.current) setError('Could not read this recording. Please try again or type your update.')
        } finally { if (active.current && current === version.current) setPreparing(false) }
      }
      instance.start(1000)
      setRecording(true); setPreparing(false)
      let elapsed = 0
      timer.current = setInterval(() => {
        elapsed++
        setSeconds(elapsed)
        if (elapsed >= 90 && instance.state === 'recording') instance.stop()
      }, 1000)
    } catch {
      if (active.current && current === version.current) {
        release()
        setPreparing(false)
        setError('Microphone access is unavailable. Allow access in your browser or type your update below.')
      }
    }
  }

  function stop() { if (recorder.current?.state === 'recording') recorder.current.stop() }
  const supported = typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  return { recording, preparing, seconds, error, supported, start, stop, cancel }
}
