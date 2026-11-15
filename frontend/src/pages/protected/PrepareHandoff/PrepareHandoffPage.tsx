import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import NimbusMascot from '@/components/NimbusMascot'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { api } from '@/api/client'
import type { HandoffReview } from '@/api/client'
import type { Employee } from '@/data/employees'
import styles from './PrepareHandoffPage.module.css'

export default function PrepareHandoffPage({ registration, employee, onBack, onCreated }: {
  registration: string; employee: Employee; onBack: () => void; onCreated: (id: string) => void
}) {
  const [review, setReview] = useState<HandoffReview | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [taskTitles, setTaskTitles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [building, setBuilding] = useState(false)
  const [spokenAnswers, setSpokenAnswers] = useState('')
  const [voiceStatus, setVoiceStatus] = useState('')
  const answersRef = useRef<string[]>([])
  const [error, setError] = useState('')
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([api.reviewHandoff(registration), api.board(registration)]).then(([result, board]) => {
      if (!active) return
      setTaskTitles(Object.fromEntries(board.items.map((item) => [item.id, item.title])))
      const questions = result.questions.slice(0, 3)
      setReview({ ...result, questions })
      const emptyAnswers = questions.map(() => '')
      setAnswers(emptyAnswers); answersRef.current = emptyAnswers
      setError('')
    }).catch((failure) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to review the inspection notes. Please try again.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [registration, attempt])

  const hasUnsavedWork = Boolean(spokenAnswers.trim()) || answers.some((answer) => answer.trim())
  useEffect(() => {
    if (!hasUnsavedWork) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [hasUnsavedWork])

  async function distributeAnswers(transcript: string) {
    if (!review) return
    setVoiceStatus('Matching your recording to the questions…')
    const result = await api.fillHandoffAnswers(registration, transcript, review.questions.map((question, index) => ({ ...question, answer: answersRef.current[index] ?? '' })))
    if (!alive.current) return
    answersRef.current = result.answers; setAnswers(result.answers)
    const missing = result.answers.filter((answer) => !answer.trim()).length
    setVoiceStatus(missing ? `Answers filled. ${missing} still need an answer; record more or type below.` : 'All answers filled. Review them before saving the task updates and building the report.')
  }

  async function transcribeAnswer(audio: Blob) {
    if (!review) return
    setTranscribing(true); setError(''); setVoiceStatus('Transcribing your answers…')
    try {
      const result = await api.transcribeAnswer(registration, audio)
      if (!alive.current) return
      setSpokenAnswers(result.transcript)
      await distributeAnswers(result.transcript)
    } catch (failure) {
      if (alive.current) { setVoiceStatus(''); setError(failure instanceof Error ? failure.message : 'Unable to fill the answers. Your existing answers are kept; retry or type below.') }
    } finally { if (alive.current) setTranscribing(false) }
  }

  async function retrySpokenAnswers() {
    if (locked || !spokenAnswers.trim()) return
    setTranscribing(true); setError('')
    try { await distributeAnswers(spokenAnswers.trim()) }
    catch (failure) { if (alive.current) { setVoiceStatus(''); setError(failure instanceof Error ? failure.message : 'Unable to fill the answers. Please try again.') } }
    finally { if (alive.current) setTranscribing(false) }
  }

  const recorder = useAudioRecorder(transcribeAnswer)
  const locked = loading || building || transcribing || recorder.recording || recorder.preparing
  const answered = answers.filter((answer) => answer.trim()).length
  const questionCount = review?.questions.length ?? 0
  const complete = Boolean(review) && answered === questionCount

  function changeAnswer(index: number, value: string) {
    const next = answersRef.current.map((answer, position) => position === index ? value : answer)
    answersRef.current = next; setAnswers(next); setError('')
  }

  function record() {
    if (locked) return
    setError(''); setVoiceStatus('')
    void recorder.start()
  }

  function cancelRecording() {
    recorder.cancel()
  }

  function back() {
    if ((hasUnsavedWork || recorder.recording) && !window.confirm('Return to the shift board? Your answers on this page have not been saved yet.')) return
    cancelRecording(); onBack()
  }

  async function buildReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked || !review || !complete) return
    setBuilding(true); setError('')
    const entries = review.questions.map((question, index) => ({ ...question, answer: answersRef.current[index].trim() }))
    try {
      const result = await api.startHandoff(registration, entries)
      if (alive.current) {
        onCreated(result.id)
      }
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : 'Unable to build the report. Your answers are kept; please try again.')
    } finally { if (alive.current) setBuilding(false) }
  }

  const warnings = review?.warnings ?? []

  return <div className={styles.page}>
    <header className={styles.header}>
      <button onClick={back} disabled={building || transcribing} aria-label="Back to shift board"><span aria-hidden="true">←</span> Shift board</button>
      <span className={styles.divider}>/</span>
      <strong>{registration} · Prepare handoff</strong>
      <span className={styles.employee}>{employee.name} · Employee</span>
    </header>
    <main className={styles.main}>
      <div className={styles.mascot}><NimbusMascot /></div>
      <div className={styles.intro}>
        <span className={styles.eyebrow}>NIMBUS</span>
        <h1>{loading ? 'Reviewing your inspection notes…' : questionCount ? 'A few details before you hand over.' : review ? 'Let’s prepare your handoff report.' : 'Let’s prepare your handoff.'}</h1>
        <p>{loading ? 'Checking the aircraft’s saved work items for anything the next shift needs to know.' : review ? `${review.reviewedTaskCount} work ${review.reviewedTaskCount === 1 ? 'item' : 'items'} reviewed for ${registration}. ${questionCount ? 'Short answers are enough. If you don’t know, say so.' : 'No follow-up questions were returned.'}` : 'Nimbus uses the aircraft’s saved notes to help the next shift pick up where you stopped.'}</p>
      </div>
      <ol className={styles.steps} aria-label="Handoff progress">
        <li className={review ? styles.completed : styles.current} aria-current={!review ? 'step' : undefined}><span>{review ? '✓' : '1'}</span>Notes captured</li>
        <li className={review ? styles.current : ''} aria-current={review ? 'step' : undefined}><span>2</span>Fill gaps</li>
        <li><span>3</span>Hand over together</li>
      </ol>
      {loading && <section className={styles.loading} role="status"><span className={styles.loadingDot} /> Reviewing saved notes. This may take a moment.</section>}
      {error && <section className={styles.error} role="alert"><p>{error}</p>{!review && !loading && <Button onClick={() => { setLoading(true); setError(''); setAttempt((value) => value + 1) }}>Try again</Button>}</section>}
      {review && <form className={styles.card} onSubmit={buildReport}>
        <div className={styles.cardHeader}><div><span className={styles.eyebrow}>FILL THE GAPS</span><h2>{questionCount ? 'Before the next shift starts' : 'Ready to build your report'}</h2></div>{questionCount > 0 && <span className={styles.answerCount} aria-live="polite">{answered} of {questionCount} answered</span>}</div>
        {questionCount === 0 ? <div className={styles.noQuestions}><span aria-hidden="true">✓</span><p>No follow-up questions were returned. Nimbus will use the saved inspection notes. Review the report for missing details before sharing it.</p></div> : <div className={styles.questions}>
          <div className={styles.voiceActions}>
            {recorder.recording ? <><Button type="button" variant="contained" color="error" onClick={recorder.stop}>Stop & fill answers · {recorder.seconds}s</Button><Button type="button" onClick={cancelRecording}>Cancel recording</Button></> : <Button type="button" variant="contained" disabled={locked || !recorder.supported} onClick={record}>{recorder.preparing ? 'Preparing audio…' : transcribing ? 'Filling answers…' : 'Record answers to all questions'}</Button>}
            <p className={styles.note}>Answer the questions in one recording. You can say “question one”, “question two”, or mention the task. Nimbus will place each answer below.</p>
          </div>
          {voiceStatus && <p className={styles.note} role="status">{voiceStatus}</p>}
          {spokenAnswers && <details><summary>Review recording transcript</summary><TextField fullWidth multiline minRows={2} label="Your recorded answers" value={spokenAnswers} disabled={locked} onChange={(event) => setSpokenAnswers(event.target.value)} slotProps={{ htmlInput: { maxLength: 12000 } }} /><Button type="button" onClick={retrySpokenAnswers} disabled={locked || !spokenAnswers.trim()}>Use transcript to fill answers</Button></details>}

          {review.questions.map((question, index) => <section className={styles.question} key={`${question.taskId}-${index}`}>
            <div className={styles.taskContext}>{taskTitles[question.taskId] ?? 'Inspection note'}</div>
            <div className={styles.questionHeading}><span className={styles.number}>{index + 1}</span><label htmlFor={`handoff-answer-${index}`}>{question.question}</label></div>
            <TextField id={`handoff-answer-${index}`} fullWidth multiline minRows={2} required disabled={locked} value={answers[index] ?? ''} placeholder="Speak or type a short answer" onChange={(event) => changeAnswer(index, event.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />

          </section>)}
          {!recorder.supported && <p className={styles.note}>Recording isn’t available in this browser. Type your answers above.</p>}
          {recorder.error && <p className={styles.voiceError} role="alert">{recorder.error}</p>}
        </div>}
        <div className={styles.cardFooter}><p>{building ? 'Updating the associated tasks and building your report…' : questionCount ? 'Review your answers. Building the report saves them to the associated tasks, then opens the updated handoff for review together.' : 'Build the report, then review it together with the incoming employee.'}</p><Button type="submit" variant="contained" size="large" disabled={locked || !complete}>{building ? 'Building report…' : questionCount ? 'Update tasks & build report' : 'Build handoff report'}</Button></div>
      </form>}
      {warnings.length > 0 && <aside className={styles.warnings} aria-label="Review notes"><strong>Review notes</strong><ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></aside>}
    </main>
  </div>
}
