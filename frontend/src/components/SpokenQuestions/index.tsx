import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '@mui/material/Button'
import styles from './SpokenQuestions.module.css'

/** Uses only on-device voices; never sends inspection questions to a TTS service. */
export default function SpokenQuestions({ text, paused = false }: { text: string; paused?: boolean }) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const [message, setMessage] = useState('')
  const attempted = useRef('')
  const utterance = useRef<SpeechSynthesisUtterance | null>(null)

  const stop = useCallback(() => {
    const current = utterance.current
    utterance.current = null
    if (current) { current.onend = null; current.onerror = null; window.speechSynthesis.cancel() }
    setSpeaking(false)
  }, [])

  useEffect(() => {
    if (!supported) return
    const synthesis = window.speechSynthesis
    const update = () => {
      const voices = synthesis.getVoices().filter((item) => item.localService && item.lang.toLowerCase().startsWith('en'))
      setVoice(voices.find((item) => item.default) ?? voices[0] ?? null)
    }
    update(); synthesis.addEventListener('voiceschanged', update)
    return () => { synthesis.removeEventListener('voiceschanged', update) }
  }, [supported])

  const speak = useCallback(() => {
    if (!supported || !voice || !text || paused) return
    stop(); setMessage('')
    const current = new SpeechSynthesisUtterance(text)
    current.voice = voice; current.lang = voice.lang; current.rate = 0.95
    current.onend = () => { if (utterance.current === current) { utterance.current = null; setSpeaking(false) } }
    current.onerror = (event) => {
      if (utterance.current !== current) return
      utterance.current = null; setSpeaking(false)
      if (event.error !== 'canceled' && event.error !== 'interrupted') setMessage('Automatic playback was unavailable. Press Read questions to try again.')
    }
    utterance.current = current; setSpeaking(true)
    window.speechSynthesis.speak(current)
  }, [supported, voice, text, paused, stop])

  useEffect(() => {
    if (paused || !text) {
      const current = utterance.current
      utterance.current = null
      if (current) { current.onend = null; current.onerror = null; window.speechSynthesis.cancel() }
      const timer = window.setTimeout(() => setSpeaking(false), 0)
      return () => window.clearTimeout(timer)
    }
    if (!voice || attempted.current === text) return
    const timer = window.setTimeout(() => { attempted.current = text; speak() }, 250)
    return () => window.clearTimeout(timer)
  }, [text, paused, voice, speak, stop])

  useEffect(() => () => { const current = utterance.current; utterance.current = null; if (current) { current.onend = null; current.onerror = null; window.speechSynthesis.cancel() } }, [])

  if (!text) return null
  return <div className={styles.controls}>
    {supported && voice ? <>
      <Button type="button" size="small" variant="outlined" disabled={paused} onClick={speaking ? stop : speak}>{speaking ? 'Stop reading' : 'Read questions'}</Button>
      <span role="status">{speaking ? 'Nimbus is reading the questions…' : message || 'Questions are read aloud using a local voice.'}</span>
    </> : <span>Read-aloud needs a local English voice in your browser. You can read and answer the questions below.</span>}
  </div>
}
