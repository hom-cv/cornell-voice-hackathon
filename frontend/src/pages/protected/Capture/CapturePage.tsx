import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import NimbusMascot from '@/components/NimbusMascot'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { api, ApiError } from '@/api/client'
import type { Employee } from '@/data/employees'
import type { CaptureResult, InspectionDraft, WorkItem, ClarificationAnswer } from '@/data/board'
import styles from './CapturePage.module.css'

const emptyDraft = (): InspectionDraft => ({ title: '', area: '', status: 'not_started', stoppedAt: '', leftOpen: false, handoffReviewRequired: false, manualReference: '', found: '', workDone: '', nextAction: '', photoData: '' })
function itemDraft(item: WorkItem | null): InspectionDraft {
  if (!item) return emptyDraft()
  return { title: item.title, area: item.area, status: item.status, stoppedAt: item.stoppedAt, leftOpen: item.leftOpen, handoffReviewRequired: item.handoffReviewRequired, manualReference: item.manualReference, found: item.found, workDone: item.workDone, nextAction: item.nextAction, photoData: item.photoData }
}
const statuses = { not_started: 'Not started', open: 'Open · carried over', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' }
const newExample = 'I found a loose seat cover in the front row. I checked it and took a photo. The cover is still loose. Next, replace the cover. Keep this task open.'

export default function CapturePage({ registration, employee, initialItem, ownerName, onBack }: {
  registration: string; employee: Employee; initialItem: WorkItem | null; ownerName: string; onBack: () => void
}) {
  const [draft, setDraft] = useState<InspectionDraft>(() => itemDraft(initialItem))
  const [itemId, setItemId] = useState(initialItem?.id)
  const owner = ownerName
  const [transcript, setTranscript] = useState('')
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [readingPhoto, setReadingPhoto] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [filledByVoice, setFilledByVoice] = useState(false)
  const [updateSummary, setUpdateSummary] = useState('')
  const [clarification, setClarification] = useState<{
    transcript: string; draft: InspectionDraft; questions: string[]
  } | null>(null)
  const [answers, setAnswers] = useState<string[]>([])
  const [answerTarget, setAnswerTarget] = useState<number | null>(null)
  const answerTargetRef = useRef<number | null>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!dirty) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])

  function applyCapture(result: CaptureResult, answered = false) {
    setTranscript(result.transcript)
    setWarnings(result.warnings)
    setDirty(true); setSaved(false)
    const questions = result.questions ?? []
    if (questions.length > 0) {
      setUpdateSummary('Your form is unchanged while Nimbus clarifies your update.')
      if (answered) {
        setClarification(null); setAnswers([])
        setWarnings([...result.warnings, 'Some details remain unclear after your answers. Your form was kept unchanged; finish those edits manually.'])
        setUpdateSummary('Your form was kept unchanged.')
        return
      }
      // Keep the form untouched until the single clarification round is answered.
      setClarification({ transcript: result.transcript, draft: { ...draft }, questions: questions.slice(0, 2) })
      setAnswers(questions.slice(0, 2).map(() => ''))
      return
    }
    const labels: Partial<Record<keyof InspectionDraft, string>> = {
      title: 'title', area: 'location', status: 'status', found: 'findings',
      workDone: 'work done', stoppedAt: 'exact stopping point', nextAction: 'next action',
      leftOpen: 'physical condition', handoffReviewRequired: 'handoff review', manualReference: 'reference',
    }
    const changed = (Object.keys(labels) as (keyof InspectionDraft)[]).filter((key) => result.draft[key] !== draft[key])
    setUpdateSummary(changed.length ? `Updated: ${changed.map((key) => labels[key]).join(', ')}.` : 'No fields changed. Review Nimbus’s notes below.')
    setDraft((current) => ({ ...result.draft, photoData: current.photoData }))
    setClarification(null); setAnswers([])
    setFilledByVoice(true)
  }

  async function submitAnswers(pending: NonNullable<typeof clarification>, values: string[]) {
    answerTargetRef.current = null; setAnswerTarget(null)
    setProcessing(true); setError(''); setUpdateSummary('')
    const history: ClarificationAnswer[] = pending.questions.map((question, index) => ({ question, answer: values[index].trim() }))
    try {
      const result = await api.captureText(
        registration, pending.transcript,
        { ...pending.draft, photoData: '' }, history,
      )
      if (alive.current) applyCapture(result, true)
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : 'Unable to use those answers. Please try again.')
    } finally { if (alive.current) setProcessing(false) }
  }

  async function answerQuestions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!clarification || locked || answers.some((answer) => !answer.trim())) return
    await submitAnswers(clarification, answers)
  }

  function cancelQuestions() {
    answerTargetRef.current = null; setAnswerTarget(null)
    setClarification(null); setAnswers([]); setWarnings([]); setError(''); setUpdateSummary('')
  }

  async function processAudio(audio: Blob) {
    const target = answerTargetRef.current
    if (target !== null) {
      setProcessing(true); setError(''); setUpdateSummary('')
      try {
        const result = await api.transcribeAnswer(registration, audio)
        if (!alive.current) return
        const previous = answers[target]?.trim() ?? ''
        const combined = [previous, result.transcript.trim()].filter(Boolean).join(' ')
        if (combined.length > 2000) {
          setError('This answer is too long. Shorten the existing text or record a shorter answer. Your previous answer was kept.')
        } else {
          const updatedAnswers = answers.map((answer, index) => index === target ? combined : answer)
          setAnswers(updatedAnswers)
          setDirty(true)
          if (clarification && updatedAnswers.every((answer) => answer.trim())) {
            await submitAnswers(clarification, updatedAnswers)
          } else {
            const next = updatedAnswers.findIndex((answer) => !answer.trim())
            window.setTimeout(() => { if (alive.current) document.getElementById(`clarification-${next}`)?.focus() }, 0)
          }
        }
      } catch (failure) {
        if (alive.current) setError(failure instanceof Error ? failure.message : 'Unable to transcribe your answer. Please try again.')
      } finally {
        if (alive.current) { setProcessing(false); setAnswerTarget(null); answerTargetRef.current = null }
      }
      return
    }
    setProcessing(true); setError(''); setUpdateSummary('')
    try {
      const result = await api.captureAudio(registration, audio, { ...draft, photoData: '' })
      if (alive.current) applyCapture(result)
    } catch (failure) {
      if (alive.current) {
        setError(failure instanceof Error ? failure.message : 'Unable to process this recording.')
        if (failure instanceof ApiError && failure.transcript) setTranscript(failure.transcript)
      }
    } finally { if (alive.current) setProcessing(false) }
  }
  const recorder = useAudioRecorder(processAudio)
  const locked = processing || saving || readingPhoto || recorder.recording || recorder.preparing

  const formLocked = locked || clarification !== null

  function startAnswerRecording(index: number) {
    if (locked || !clarification) return
    setError('')
    answerTargetRef.current = index
    setAnswerTarget(index)
    void recorder.start()
  }

  function startUpdateRecording() {
    if (formLocked) return
    answerTargetRef.current = null
    setAnswerTarget(null)
    void recorder.start()
  }

  function cancelRecording() {
    recorder.cancel()
    answerTargetRef.current = null
    setAnswerTarget(null)
  }

  function change<K extends keyof InspectionDraft>(key: K, value: InspectionDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value, ...(key === 'status' && value === 'open' ? { handoffReviewRequired: true } : {}) }))
    setDirty(true); setSaved(false); setError('')
  }

  async function fillFromText() {
    if (!transcript.trim() || formLocked) return
    setProcessing(true); setError(''); setUpdateSummary('')
    try {
      const result = await api.captureText(registration, transcript, { ...draft, photoData: '' })
      if (alive.current) applyCapture(result)
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : 'Unable to fill this form.')
    } finally { if (alive.current) setProcessing(false) }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (formLocked) return
    if (draft.status === 'done' && draft.leftOpen) { setError('A task with something left open cannot be marked done. Review the status or open condition.'); return }
    setSaving(true); setError('')
    try {
      const item = await api.saveItem(registration, draft, itemId)
      if (alive.current) {
        setDraft(itemDraft(item)); setItemId(item.id)
        setSaved(true); setDirty(false)
        setSaveDialogOpen(true)
      }
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : 'Unable to save this inspection.')
    } finally { if (alive.current) setSaving(false) }
  }

  function back() {
    if ((dirty || recorder.recording) && !window.confirm('Leave this draft? Unsaved changes will be lost.')) return
    cancelRecording(); onBack()
  }

  function addPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Choose a JPEG, PNG, or WebP photo smaller than 2 MB.'); return
    }
    setReadingPhoto(true)
    const reader = new FileReader()
    reader.onload = () => { if (alive.current) { change('photoData', String(reader.result)); setReadingPhoto(false) } }
    reader.onerror = () => { if (alive.current) { setError('Could not read that photo. Try another file.'); setReadingPhoto(false) } }
    reader.readAsDataURL(file)
  }

  const example = itemId && initialItem ? [initialItem.found, initialItem.workDone, initialItem.stoppedAt, initialItem.nextAction].filter(Boolean).join(' ') : newExample
  const needs = [!draft.manualReference && 'Add the checklist or manual reference, if required.', !draft.nextAction && draft.status !== 'done' && 'Record what should happen next.', draft.leftOpen && !draft.stoppedAt && 'Describe exactly what is still open.'].filter(Boolean)

  return <div className={styles.page}>
    <header className={styles.header}>
      <button onClick={back} disabled={processing || saving || readingPhoto}><span aria-hidden="true">←</span> Shift board</button>
      <span className={styles.divider}>/</span><strong>{registration} · Talk to Nimbus</strong>
      <span className={styles.employee}>{employee.name} · Employee</span>
    </header>
    <main className={styles.layout}>
      <aside className={styles.assistant}>
        <NimbusMascot />
        <section className={`${styles.conversation} ${saved ? styles.saved : ''}`} aria-label="Talk to Nimbus">
          <span className={styles.eyebrow}>NIMBUS</span>
          <h1>{clarification ? (processing ? (answerTarget !== null ? 'Transcribing your answer…' : 'Reviewing your handoff…') : recorder.recording ? 'I’m listening to your answer.' : 'Let’s make this handoff clear.') : saved ? `Saved to ${registration}.` : recorder.recording ? 'I’m listening. Tell me what happened.' : processing ? 'Turning your update into a draft…' : 'Tell me what you found.'}</h1>
          <p>{clarification ? 'Your form hasn’t changed yet. Speak your answers and I’ll update the draft once every question is answered. You can also type. Review the form before saving.' : saved ? 'Your inspection is saved. You can continue editing this card whenever you need to.' : 'A few short sentences are enough. What did you find, what did you do, and where did you stop?'}</p>
          {clarification && <form className={styles.clarifications} onSubmit={answerQuestions} aria-label="Nimbus clarification questions">
            {clarification.questions.map((question, index) => <div key={question}>
              <label className={styles.questionLabel} htmlFor={`clarification-${index}`}>{question}</label>
              <TextField
                id={`clarification-${index}`} autoFocus={index === 0} required
                fullWidth multiline minRows={2} disabled={locked}
                value={answers[index] ?? ''} placeholder="Record or type a short answer"
                onChange={(event) => setAnswers((current) => current.map((answer, position) => position === index ? event.target.value : answer))}
                slotProps={{ htmlInput: { maxLength: 2000 } }}
              />
              <div className={styles.answerVoiceActions}>
                {answerTarget === index && recorder.recording ? <>
                  <Button type="button" variant="contained" color="error" onClick={recorder.stop}>Stop & use answer · {recorder.seconds}s</Button>
                  <Button type="button" onClick={cancelRecording}>Cancel recording</Button>
                </> : <Button
                  type="button" variant="outlined"
                  disabled={locked || !recorder.supported}
                  onClick={() => startAnswerRecording(index)}
                  aria-label={`Record answer to question ${index + 1}`}
                >{answerTarget === index && processing ? 'Transcribing answer…' : answerTarget === index && recorder.preparing ? 'Preparing audio…' : answers[index]?.trim() ? 'Record more' : 'Record answer'}</Button>}
              </div>
              {answerTarget === index && (processing || recorder.preparing) && <p className={styles.note} role="status">{processing ? 'WhisperKit is transcribing this answer.' : 'Preparing microphone audio…'}</p>}
            </div>)}
            <Button type="submit" variant="contained" disabled={locked || answers.some((answer) => !answer.trim())}>
              {processing ? 'Filling form…' : 'Use answers & fill form'}
            </Button>
            <Button disabled={locked} onClick={cancelQuestions}>Keep editing manually</Button>
          </form>}
          {!clarification && <div className={styles.voiceActions}>
            {recorder.recording ? <Button variant="contained" color="error" onClick={recorder.stop}>Stop & fill form · {recorder.seconds}s</Button> : <Button variant="contained" onClick={startUpdateRecording} disabled={formLocked || !recorder.supported}>{recorder.preparing ? 'Preparing audio…' : '● Start recording'}</Button>}
            {recorder.recording && <Button onClick={cancelRecording}>Cancel recording</Button>}
          </div>}
          {!recorder.supported && <p className={styles.note}>Microphone recording isn’t available in this browser. Type your update below.</p>}
          <details className={styles.example}><summary>Try a short demo update</summary><p>{example}</p><Button size="small" disabled={formLocked} onClick={() => { setTranscript(example); setSaved(false); setDirty(true) }}>Use as typed update</Button></details>
          <TextField className={styles.transcript} label="Your spoken or typed update" multiline minRows={3} fullWidth value={transcript} disabled={formLocked} onChange={(event) => { setTranscript(event.target.value); setDirty(true); setSaved(false) }} slotProps={{ htmlInput: { maxLength: 12000 } }} />
          <Button variant="outlined" fullWidth disabled={formLocked || !transcript.trim()} onClick={fillFromText}>Fill form with Bonsai</Button>
          {(error || recorder.error) && <p className={styles.error} role="alert">{error || recorder.error}</p>}
          {processing && answerTarget === null && <p role="status" className={styles.note}>Processing locally with Argmax and Bonsai. Your current form is kept until a draft is ready.</p>}
          {updateSummary && !clarification && <p className={styles.note} role="status">{updateSummary}</p>}
          {warnings.length > 0 && <div className={styles.reviewNotes}><strong>Review notes</strong><ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          {saved && needs.length > 0 && <div className={styles.reviewNotes}><strong>Still to clarify</strong><ul>{needs.map((need) => <li key={String(need)}>{need}</li>)}</ul></div>}
        </section>
        <p className={styles.privacy}>WhisperKit transcribes your audio locally. Bonsai drafts the fields. Review everything before saving.</p>
      </aside>
      <form className={styles.form} onSubmit={save}>
        <div className={styles.formHeader}><div><h2>{itemId ? 'Inspection card' : 'New inspection card'}</h2><span className={styles.tag}>{saved ? 'Saved' : filledByVoice ? 'Drafted by Bonsai · review before saving' : 'Draft · ready for your notes'}</span></div>{draft.leftOpen && <span className={styles.warningTag}>Something is left open on the aircraft</span>}</div>
        <fieldset disabled={formLocked} className={styles.fields}>
          <TextField required fullWidth label="Inspection title" value={draft.title} onChange={(event) => change('title', event.target.value)} placeholder="For example, loose seat cover" slotProps={{ htmlInput: { maxLength: 300 } }} />
          <div className={styles.twoColumns}>
            <TextField required label="Location / area" value={draft.area} onChange={(event) => change('area', event.target.value)} placeholder="For example, front row" slotProps={{ htmlInput: { maxLength: 160 } }} />
            <TextField disabled={formLocked} select label="Status" value={draft.status} onChange={(event) => change('status', event.target.value as InspectionDraft['status'])}>{Object.entries(statuses).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
            <TextField label="Owner" value={owner} slotProps={{ input: { readOnly: true } }} />
            <TextField label="Manual / checklist reference" value={draft.manualReference} onChange={(event) => change('manualReference', event.target.value)} placeholder="Leave blank if you don’t know yet" slotProps={{ htmlInput: { maxLength: 300 } }} />
          </div>
          <TextField multiline minRows={2} label="What was found" value={draft.found} onChange={(event) => change('found', event.target.value)} placeholder="What did you notice?" slotProps={{ htmlInput: { maxLength: 2000 } }} />
          <TextField multiline minRows={2} label="What was done" value={draft.workDone} onChange={(event) => change('workDone', event.target.value)} placeholder="What have you checked or changed so far?" slotProps={{ htmlInput: { maxLength: 2000 } }} />
          <TextField multiline minRows={2} label="Exact stopping point" value={draft.stoppedAt} onChange={(event) => change('stoppedAt', event.target.value)} placeholder="What state did you leave it in?" className={draft.leftOpen ? styles.stoppingPoint : ''} slotProps={{ htmlInput: { maxLength: 1000 } }} />
          <TextField multiline minRows={2} label="Next action" value={draft.nextAction} onChange={(event) => change('nextAction', event.target.value)} placeholder="What should happen next?" slotProps={{ htmlInput: { maxLength: 1000 } }} />
          <FormControlLabel control={<Checkbox checked={draft.leftOpen} onChange={(event) => change('leftOpen', event.target.checked)} />} label="A physical condition is unresolved (for example, a cover is off)" />
          <div>
            <FormControlLabel control={<Checkbox disabled={formLocked || draft.status === 'open'} checked={draft.handoffReviewRequired} onChange={(event) => change('handoffReviewRequired', event.target.checked)} />} label="Carried over · review before the next handoff" />
            <p className={styles.note}>{draft.status === 'open' ? 'Open means carried over from the last handoff. After reviewing it, set its current work status and clear this reminder.' : 'Keep this reminder until you have reviewed the carried-over item for the next handoff.'}</p>
          </div>
          <div className={styles.photos}><strong>Photo <span>(optional)</span></strong>{draft.photoData ? <div className={styles.photoPreview}><img src={draft.photoData} alt="Inspection attachment" /><Button onClick={() => change('photoData', '')}>Remove photo</Button></div> : <label className={styles.photoUpload}><span aria-hidden="true">＋</span>Add a photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={addPhoto} disabled={formLocked} /></label>}<small>One photo, up to 2 MB.</small></div>
        </fieldset>
        <footer className={styles.formFooter}><p>Edit any field, or record another update to correct the draft.</p><Button type="submit" variant="contained" disabled={formLocked || (saved && !dirty)}>{saving ? 'Saving…' : 'Save inspection'}</Button></footer>
      </form>
    </main>
    <Dialog
      open={saveDialogOpen}
      onClose={() => setSaveDialogOpen(false)}
      aria-labelledby="inspection-saved-title"
      aria-describedby="inspection-saved-description"
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id="inspection-saved-title">Inspection saved</DialogTitle>
      <DialogContent>
        <DialogContentText id="inspection-saved-description">
          Your inspection has been saved to {registration}. Return to the shift board or continue editing this inspection.
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1, flexWrap: 'wrap' }}>
        <Button onClick={() => setSaveDialogOpen(false)}>Continue editing</Button>
        <Button variant="contained" onClick={back}>Back to shift board</Button>
      </DialogActions>
    </Dialog>
  </div>
}
