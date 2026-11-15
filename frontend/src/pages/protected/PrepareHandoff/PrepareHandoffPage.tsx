import { AppearanceControl } from '@/components/AppearanceProvider'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import DraftRecoveryNotice from '@/components/DraftRecoveryNotice'
import { useDraftRecovery } from '@/hooks/useDraftRecovery'
import NimbusMascot from '@/components/NimbusMascot'
import { InspectionChangeReview } from '@/components/InspectionChangeReview'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { useNavigationGuard } from '@/routing/navigation'
import { api, ApiError } from '@/api/client'
import type { HandoffAnswer, HandoffPreview, HandoffReview } from '@/api/client'
import type { WorkItem } from '@/data/board'
import type { Employee } from '@/data/employees'
import styles from './PrepareHandoffPage.module.css'

type RecoveredHandoff = { review: HandoffReview | null; answers: string[]; spokenAnswers: string }
function validRecoveredHandoff(value: unknown): value is RecoveredHandoff {
  if (!value || typeof value !== 'object') return false
  const data = value as RecoveredHandoff
  return Boolean(data.review && Array.isArray(data.review.questions) && data.review.questions.length <= 3 &&
    data.review.questions.every((q) => typeof q.taskId === 'string' && typeof q.question === 'string') &&
    Array.isArray(data.review.warnings) && typeof data.review.reviewedTaskCount === 'number' &&
    Array.isArray(data.answers) && data.answers.length === data.review.questions.length && data.answers.every((answer) => typeof answer === 'string') && typeof data.spokenAnswers === 'string')
}

function spokenQuestion(question: string): string {
  // Older recovered questions can contain a long field comparison before the ask.
  if (question.length > 140 && /What was done|Exact stopping point|workDone|The notes say/i.test(question)) {
    const ask = question.match(/[.!]\s+((?:What|Which|Where|How|When|Is|Are|Has|Have|Did|Do|Does|Can)\b[^?]*\?)$/)
    if (ask) return ask[1]
  }
  return question
}

export default function PrepareHandoffPage({ registration, employee, onBack, onCreated }: {
  registration: string; employee: Employee; onBack: () => void; onCreated: (id: string) => void
}) {
  const [draftTouched, setDraftTouched] = useState(false)
  const [draftBase, setDraftBase] = useState('')
  const [review, setReview] = useState<HandoffReview | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [taskDetails, setTaskDetails] = useState<Record<string, WorkItem>>({})
  const [taskTitles, setTaskTitles] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [operation, setOperation] = useState<'preview' | 'commit' | null>(null)
  const building = operation !== null
  const [pendingPreview, setPendingPreview] = useState<{ result: HandoffPreview; answers: HandoffAnswer[] } | null>(null)
  const [previewStale, setPreviewStale] = useState(false)
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
    async function load() {
      try {
        const board = await api.board(registration)
        if (!active) return
        setTaskDetails(Object.fromEntries(board.items.map((item) => [item.id, item])))
        setTaskTitles(Object.fromEntries(board.items.map((item) => [item.id, item.title])))
        setDraftBase(JSON.stringify(board.items.map(({ photoData, ...item }) => { void photoData; return item })))
        if (!recoveringAtLoad.current) {
          const result = await api.reviewHandoff(registration)
          if (!active) return
          const questions = result.questions.slice(0, 3)
          setReview({ ...result, questions })
          const emptyAnswers = questions.map(() => '')
          setAnswers(emptyAnswers); answersRef.current = emptyAnswers
        }
        setError('')
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Unable to review the inspection notes. Please try again.')
      } finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [registration, attempt])

  const hasUnsavedWork = draftTouched || Boolean(spokenAnswers.trim()) || answers.some((answer) => answer.trim())
  useEffect(() => {
    if (!hasUnsavedWork) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [hasUnsavedWork])

  const recovery = useDraftRecovery<RecoveredHandoff>({
    scope: { employeeId: employee.id, aircraftId: registration, kind: 'handoff' },
    value: { review, answers, spokenAnswers }, dirty: hasUnsavedWork, enabled: !loading,
    baseSignature: draftBase, validate: validRecoveredHandoff,
    onRestore: (data) => {
      setDraftTouched(true)
      setReview(data.review); setAnswers(data.answers); answersRef.current = data.answers
      setSpokenAnswers(data.spokenAnswers); setPendingPreview(null); setPreviewStale(false)
    },
  })
  const recoveringAtLoad = useRef(Boolean(recovery.pending))
  function discardRecoveredDraft() {
    if (!recovery.discard()) return false
    recoveringAtLoad.current = false
    if (!review) { setLoading(true); setAttempt((value) => value + 1) }
    return true
  }

  async function distributeAnswers(transcript: string) {
    if (!review) return
    setVoiceStatus('Matching your recording to the questions…')
    const result = await api.fillHandoffAnswers(registration, transcript, review.questions.map((question, index) => ({ ...question, answer: answersRef.current[index] ?? '' })))
    if (!alive.current) return
    answersRef.current = result.answers; setAnswers(result.answers)
    const missing = result.answers.filter((answer) => !answer.trim()).length
    setVoiceStatus(missing ? `Answers filled. ${missing} still need an answer; record more or type below.` : 'Answers ready to review.')
  }

  async function transcribeAnswer(audio: Blob) {
    if (!review) return
    setTranscribing(true); setError(''); setVoiceStatus('Transcribing your answers…')
    try {
      const result = await api.transcribeAnswer(registration, audio)
      if (!alive.current) return
      setDraftTouched(true); setSpokenAnswers(result.transcript)
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
  const locked = loading || building || transcribing || recorder.recording || recorder.preparing || recovery.pending !== null
  useNavigationGuard(hasUnsavedWork || recorder.recording || recorder.preparing || transcribing || building, 'Return to another page? Unsaved handoff answers or recordings will be lost.')
  const answered = answers.filter((answer) => answer.trim()).length
  const questionCount = review?.questions.length ?? 0
  const complete = Boolean(review) && answered === questionCount

  function changeAnswer(index: number, value: string) {
    const next = answersRef.current.map((answer, position) => position === index ? value : answer)
    setDraftTouched(true)
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
    onBack()
  }

  async function requestPreview(entries: HandoffAnswer[]) {
    setOperation('preview'); setError('')
    try {
      const result = await api.previewHandoff(registration, entries)
      if (alive.current) { setPendingPreview({ result, answers: entries }); setPreviewStale(false) }
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : 'Unable to prepare the proposed changes. Your answers are kept; please try again.')
    } finally { if (alive.current) setOperation(null) }
  }

  async function approvePreview() {
    if (locked || !pendingPreview || previewStale) return
    setOperation('commit'); setError('')
    try {
      const result = await api.startHandoff(registration, pendingPreview.answers, pendingPreview.result.previewId)
      if (alive.current) { recovery.clear(); onCreated(result.id) }
    } catch (failure) {
      if (!alive.current) return
      if (failure instanceof ApiError && (failure.status === 409 || failure.status === 410)) {
        setPreviewStale(true)
        setError(`${failure.message} Regenerate the preview to review the latest task changes.`)
      } else {
        setError(failure instanceof Error ? failure.message : 'Unable to build the report. Your reviewed preview is kept; please try again.')
      }
    } finally { if (alive.current) setOperation(null) }
  }

  function backToAnswers() {
    if (locked) return
    setPendingPreview(null); setPreviewStale(false); setError('')
  }

  async function buildReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (locked || !review || !complete) return
    const entries = review.questions.map((question, index) => ({ ...question, answer: answersRef.current[index].trim() }))
    if (entries.length > 0) { await requestPreview(entries); return }
    setOperation('commit'); setError('')
    try {
      const result = await api.startHandoff(registration, entries)
      if (alive.current) {
        recovery.clear(); onCreated(result.id)
      }
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : 'Unable to build the report. Your answers are kept; please try again.')
    } finally { if (alive.current) setOperation(null) }
  }

  const warnings = review?.warnings ?? []

  return <div className={styles.page}>
    <header className={styles.header}>
      <button onClick={back} disabled={building || transcribing} aria-label="Back to shift board"><span aria-hidden="true">←</span> Shift board</button>
      <span className={styles.divider}>/</span>
      <strong>{registration} · Prepare handoff</strong>
      <span className={styles.employee}>{employee.name} · Employee</span>
      <AppearanceControl />
    </header>
    {!loading && <DraftRecoveryNotice recovery={{ ...recovery, discard: discardRecoveredDraft }} />}
    <main className={styles.main}>
      <div className={styles.mascot}><NimbusMascot /></div>
      <div className={styles.intro}>
        <span className={styles.eyebrow}>NIMBUS</span>
        <h1>{pendingPreview ? 'Review the proposed task updates.' : loading ? 'Reviewing your inspection notes…' : questionCount === 1 ? 'One quick check before handoff.' : questionCount ? 'A few quick checks before handoff.' : review ? 'Let’s prepare your handoff report.' : 'Let’s prepare your handoff.'}</h1>
        <p>{pendingPreview ? 'Compare the saved notes with the proposed changes. Nothing is saved until you approve.' : loading ? 'Checking the aircraft’s saved work items for anything the next shift needs to know.' : review ? `${review.reviewedTaskCount} work ${review.reviewedTaskCount === 1 ? 'item' : 'items'} reviewed for ${registration}. ${questionCount ? 'Short answers are enough. If you don’t know, say so.' : 'No follow-up questions were returned.'}` : 'Nimbus uses the aircraft’s saved notes to help the next shift pick up where you stopped.'}</p>
      </div>
      <ol className={styles.steps} aria-label="Handoff progress">
        <li className={review ? styles.completed : styles.current} aria-current={!review ? 'step' : undefined}><span>{review ? '✓' : '1'}</span>Notes captured</li>
        <li className={review ? styles.current : ''} aria-current={review ? 'step' : undefined}><span>2</span>Fill gaps</li>
        <li><span>3</span>Hand over together</li>
      </ol>
      {loading && <section className={styles.loading} role="status"><span className={styles.loadingDot} /> Reviewing saved notes. This may take a moment.</section>}
      {error && <section className={styles.error} role="alert"><p>{error}</p>{!review && !loading && <Button onClick={() => { setLoading(true); setError(''); setAttempt((value) => value + 1) }}>Try again</Button>}</section>}
      {pendingPreview ? <section className={styles.card} aria-labelledby="handoff-changes-title">
        <div className={styles.cardHeader}><div><span className={styles.eyebrow}>REVIEW BEFORE SAVING</span><h2 id="handoff-changes-title">Proposed inspection changes</h2></div><span className={styles.answerCount}>{pendingPreview.result.changes.length} {pendingPreview.result.changes.length === 1 ? 'task' : 'tasks'}</span></div>
        <div className={styles.changePreview}>
          <p className={styles.previewExplanation}>Only the fields shown below will change. Check the status, stopping point, next action, and handoff reminders before continuing.</p>
          <InspectionChangeReview changes={pendingPreview.result.changes} emptyMessage="No task fields will change. Your answers will still be included in the handoff report." />
        </div>
        <div className={styles.cardFooter}><p>{operation === 'preview' ? 'Preparing an updated preview…' : operation === 'commit' ? 'Saving the approved task changes and building your report…' : previewStale ? 'This preview can no longer be approved. Regenerate it to review the latest task records.' : 'Approve these changes to save them to the tasks and build the handoff report.'}</p><div className={styles.actions}>
          <Button type="button" variant="outlined" disabled={locked} onClick={backToAnswers}>Back to answers</Button>
          {previewStale ? <Button type="button" variant="contained" disabled={locked} onClick={() => requestPreview(pendingPreview.answers)}>{building ? 'Preparing preview…' : 'Regenerate preview'}</Button> : <Button type="button" variant="contained" disabled={locked} onClick={approvePreview}>{building ? 'Building report…' : 'Approve changes & build report'}</Button>}
        </div></div>
      </section> : review && <form className={styles.card} onSubmit={buildReport}>
        <div className={styles.cardHeader}><div><h2>{questionCount === 1 ? 'Quick check' : questionCount ? `${questionCount} quick checks` : 'Ready for handoff'}</h2></div>{questionCount > 0 && <span className={styles.answerCount} aria-live="polite">{answered}/{questionCount} answered</span>}</div>
        {questionCount === 0 ? <div className={styles.noQuestions}><span aria-hidden="true">✓</span><p>No follow-up questions were returned. Nimbus will use the saved inspection notes. Review the report for missing details before sharing it.</p></div> : <div className={styles.questions}>
          {review.questions.map((question, index) => <section className={styles.question} key={`${question.taskId}-${index}`}>
            <div className={styles.taskContext}>{taskTitles[question.taskId] ?? 'Inspection note'}</div>
            <div className={styles.questionHeading}><span className={styles.number}>{index + 1}</span><label htmlFor={`handoff-answer-${index}`}>{spokenQuestion(question.question)}</label></div>
            <TextField id={`handoff-answer-${index}`} fullWidth multiline minRows={1} maxRows={4} required disabled={locked} value={answers[index] ?? ''} placeholder="Type here, or use Record answer below" onChange={(event) => changeAnswer(index, event.target.value)} slotProps={{ htmlInput: { maxLength: 2000 } }} />

            <details className={styles.sourceDetails}><summary>View saved notes</summary>
              {taskDetails[question.taskId] && <dl>{[
                ['What was found', taskDetails[question.taskId].found],
                ['What was done', taskDetails[question.taskId].workDone],
                ['Exact stopping point', taskDetails[question.taskId].stoppedAt],
                ['Next action', taskDetails[question.taskId].nextAction],
              ].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
              {spokenQuestion(question.question) !== question.question && <p>{question.question}</p>}
            </details>

          </section>)}
          <div className={styles.voiceActions}>
            {recorder.recording ? <><Button type="button" variant="contained" color="error" onClick={recorder.stop}>Stop & fill answers · {recorder.seconds}s</Button><Button type="button" onClick={cancelRecording}>Cancel recording</Button></> : <Button type="button" variant="contained" disabled={locked || !recorder.supported} onClick={record}>{recorder.preparing ? 'Preparing audio…' : transcribing ? 'Filling answers…' : questionCount === 1 ? 'Record answer' : 'Record answers'}</Button>}
            <p className={styles.note}>One recording is enough. Your answers stay editable.</p>
          </div>
          {voiceStatus && <p className={styles.note} role="status">{voiceStatus}</p>}
          {spokenAnswers && <details className={styles.transcriptReview}><summary>Recording transcript</summary><TextField size="small" fullWidth multiline minRows={1} maxRows={4} label="Your recorded answers" value={spokenAnswers} disabled={locked} onChange={(event) => { setDraftTouched(true); setSpokenAnswers(event.target.value) }} slotProps={{ htmlInput: { maxLength: 12000 } }} /><Button size="small" type="button" onClick={retrySpokenAnswers} disabled={locked || !spokenAnswers.trim()}>Update answers</Button></details>}


          {!recorder.supported && <p className={styles.note}>Recording isn’t available in this browser. Type your answers above.</p>}
          {recorder.error && <p className={styles.voiceError} role="alert">{recorder.error}</p>}
        </div>}
        <div className={styles.cardFooter}><p>{building ? questionCount ? 'Preparing proposed task changes for you to review…' : 'Building your report…' : questionCount ? 'You’ll review any changes before saving.' : 'Build the report, then review it together with the incoming employee.'}</p><Button type="submit" variant="contained" size="large" disabled={locked || !complete}>{building ? questionCount ? 'Preparing preview…' : 'Building report…' : questionCount ? 'Review changes' : 'Build handoff report'}</Button></div>
      </form>}
      {warnings.length > 0 && <details className={styles.reviewNotes}><summary>About this review</summary><ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
    </main>
  </div>
}
