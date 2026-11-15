import { AppearanceControl } from '@/components/AppearanceProvider'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import DraftRecoveryNotice from '@/components/DraftRecoveryNotice'
import { useDraftRecovery } from '@/hooks/useDraftRecovery'
import NimbusMascot from '@/components/NimbusMascot'
import { useNavigationGuard } from '@/routing/navigation'
import { api } from '@/api/client'
import type { HandoffRecord } from '@/api/client'
import type { Employee } from '@/data/employees'
import type { WorkStatus } from '@/data/board'
import styles from './HandOverTogetherPage.module.css'

const statusLabels: Record<WorkStatus, string> = {
  not_started: 'Not started', open: 'Needs follow-up', in_progress: 'In progress', blocked: 'Blocked', done: 'Done',
}

function displayTime(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function HandOverTogetherPage({ registration, employee, handoffId, onBack, onSignOut }: {
  registration: string; employee: Employee; handoffId: string; onBack: () => void; onSignOut: () => Promise<void>
}) {
  const [handoff, setHandoff] = useState<HandoffRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [incomingId, setIncomingId] = useState('')
  const [pin, setPin] = useState('')
  const [discussionTouched, setDiscussionTouched] = useState(false)
  const [askingQuestion, setAskingQuestion] = useState(false)
  const [question, setQuestion] = useState('')
  const [resolution, setResolution] = useState('')
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    let active = true
    api.getHandoff(registration, handoffId).then((record) => {
      if (!active) return
      setHandoff(record); setIncomingId(record.incoming?.id ?? ''); setError('')
    }).catch((failure) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to load this handoff. Please try again.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [registration, handoffId, attempt])

  const hasUnsavedQuestion = discussionTouched || Boolean(question.trim() || resolution.trim())
  useEffect(() => {
    if (!hasUnsavedQuestion) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [hasUnsavedQuestion])

  useNavigationGuard(hasUnsavedQuestion || busy, 'Leave this handover? An unsaved question or pending action may not be kept.')
  const acknowledged = new Set(handoff?.acknowledgedTaskIds ?? [])
  const required = handoff?.requiredTaskIds ?? []
  const remaining = required.filter((id) => !acknowledged.has(id))
  const currentItem = handoff?.items.find((item) => item.id === remaining[0])
  const verified = Boolean(handoff?.incoming && handoff.verifiedAt)
  const readOnly = Boolean(handoff && handoff.outgoing.id !== employee.id)
  const completed = handoff?.status === 'completed'
  const confirmed = handoff?.status === 'confirmed'
  const attentionCount = required.length
  const reviewedCount = required.filter((id) => acknowledged.has(id)).length
  const canConfirm = verified && remaining.length === 0 && handoff?.status === 'draft'
  const people = new Map(handoff?.employees.map((person) => [person.id, person.name]) ?? [])

  const discussionRecovery = useDraftRecovery({
    scope: { employeeId: employee.id, aircraftId: registration, kind: 'handoff', itemId: `${handoffId}-discussion` },
    value: { taskId: currentItem?.id ?? '', question, resolution }, dirty: hasUnsavedQuestion,
    enabled: Boolean(handoff) && !readOnly, baseSignature: currentItem?.id ?? '',
    validate: (value: unknown): value is { taskId: string; question: string; resolution: string } => Boolean(value && typeof value === 'object' && ['taskId', 'question', 'resolution'].every((key) => typeof (value as Record<string, unknown>)[key] === 'string')),
    onRestore: (data) => {
      if (data.taskId !== currentItem?.id) { setError('This discussion belongs to an item already acknowledged. Its saved record is unchanged.'); return }
      setQuestion(data.question); setResolution(data.resolution); setAskingQuestion(true); setDiscussionTouched(true)
    },
  })

  async function verifyIncoming(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !incomingId || !/^[0-9]{6}$/.test(pin)) return
    setBusy(true); setError('')
    try {
      const record = await api.verifyHandoff(registration, handoffId, incomingId, pin)
      if (alive.current) setHandoff(record)
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : 'Unable to verify the incoming employee. Please try again.')
    } finally { if (alive.current) { setPin(''); setBusy(false) } }
  }

  async function acknowledgeItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !currentItem || !verified || (askingQuestion && (!question.trim() || !resolution.trim()))) return
    setBusy(true); setError('')
    try {
      const record = await api.acknowledgeHandoff(registration, handoffId, currentItem.id, askingQuestion ? question.trim() : '', askingQuestion ? resolution.trim() : '')
      if (alive.current) {
        discussionRecovery.clear(); setDiscussionTouched(false)
        setHandoff(record); setAskingQuestion(false); setQuestion(''); setResolution('')
      }
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : 'Unable to save this acknowledgement. Your notes are kept; please try again.')
    } finally { if (alive.current) setBusy(false) }
  }

  async function confirmHandoff() {
    if (busy || readOnly || (!canConfirm && !confirmed)) return
    setBusy(true); setError('')
    let stage = 'confirm'
    try {
      if (!confirmed) {
        const record = await api.confirmHandoff(registration, handoffId)
        if (alive.current) setHandoff(record)
      }
      stage = 'complete'
      const completedRecord = await api.finishHandoff(registration, handoffId)
      if (alive.current) setHandoff(completedRecord)
      stage = 'log out'
      await onSignOut()
    } catch (failure) {
      if (alive.current) setError(failure instanceof Error ? failure.message : `Unable to ${stage}. Please try again.`)
    } finally { if (alive.current) setBusy(false) }
  }

  async function logOut() {
    if (busy) return
    setBusy(true); setError('')
    try { await onSignOut() }
    catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : 'Unable to log out. Please try again.') }
    finally { if (alive.current) setBusy(false) }
  }

  function back() {
    onBack()
  }

  function cancelQuestion() {
    if (hasUnsavedQuestion && !window.confirm('Discard this unsaved question and return to reviewing the item?')) return
    discussionRecovery.clear(); setDiscussionTouched(false)
    setAskingQuestion(false); setQuestion(''); setResolution('')
  }

  function downloadReport() {
    if (!handoff) return
    const url = URL.createObjectURL(new Blob([handoff.report], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `Nimbus-handoff-${registration}.txt`
    document.body.append(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const step = completed || confirmed || canConfirm ? 2 : verified ? 1 : 0
  return <div className={styles.page}>
    <header className={styles.header}>
      <button onClick={back} disabled={busy}><span aria-hidden="true">←</span> Shift board</button>
      <span className={styles.divider}>/</span><strong>{registration} · Hand over together</strong>
      <span className={styles.employee}>{employee.name} · Employee</span>
      <AppearanceControl />
    </header>
    {handoff && !readOnly && <DraftRecoveryNotice recovery={discussionRecovery} />}
    {loading ? <main className={styles.loading} role="status">Loading the saved handoff…</main> : !handoff ? <main className={styles.loading}><h1>Unable to load this handoff</h1><p role="alert">{error}</p><Button onClick={() => { setLoading(true); setError(''); setAttempt((value) => value + 1) }}>Try again</Button><Button onClick={onBack}>Back to shift board</Button></main> : <main className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.mascot}><NimbusMascot pose={completed ? "complete" : currentItem?.leftOpen && verified ? "attention" : verified ? "guide" : "wave"} /></div>
        <section className={styles.guide} aria-label="Handover walkthrough">
          <span className={styles.eyebrow}>NIMBUS</span>
          <h1>{readOnly ? 'Saved handoff record.' : completed ? 'Handoff complete.' : confirmed ? 'Handoff confirmed.' : verified ? currentItem ? 'Walk through this item together.' : 'Ready to confirm together.' : 'Let’s hand over together.'}</h1>
          <p>{readOnly ? 'Review the previous shift’s notes and acknowledgments below.' : completed ? 'Your handover record is saved. You can now log out of this shared station.' : confirmed ? 'The handover is confirmed. Complete the saved record and log out to end your shift.' : verified ? currentItem ? 'Discuss the current condition and next action. The incoming employee should confirm they understand.' : attentionCount ? 'All required items have been acknowledged. Review the report together, then confirm the handoff.' : 'There are no individual follow-up items to acknowledge. Review the report together before confirming.' : 'Ask the incoming employee to select their name and enter their six-digit PIN.'}</p>
          <ol className={styles.steps} aria-label="Handover progress">{['Verify incoming', 'Review together', 'Confirm & log out'].map((label, index) => <li key={label} className={index < step || completed ? styles.completedStep : index === step ? styles.currentStep : ''} aria-current={index === step && !completed ? 'step' : undefined}><span>{index < step || completed ? '✓' : index + 1}</span>{label}</li>)}</ol>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {!readOnly && !verified && handoff.status === 'draft' && <form className={styles.verifyForm} onSubmit={verifyIncoming}>
            <TextField select fullWidth label="Incoming employee" value={incomingId} onChange={(event) => { setIncomingId(event.target.value); setPin(''); setError('') }} disabled={busy || handoff.recipients.length === 0} required>
              {handoff.recipients.map((person) => <MenuItem key={person.id} value={person.id}>{person.name}</MenuItem>)}
            </TextField>
            <TextField label="6-digit PIN" type="password" fullWidth required value={pin} disabled={busy || !incomingId} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))} autoComplete="off" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6, pattern: '[0-9]{6}' } }} />
            {handoff.recipients.length === 0 && <p className={styles.note}>No other employee is assigned to this aircraft. Assign an incoming employee before continuing.</p>}
            <Button type="submit" variant="contained" fullWidth disabled={busy || !incomingId || pin.length !== 6}>{busy ? 'Verifying…' : 'Verify incoming employee'}</Button>
          </form>}
          {verified && <div className={styles.verified}><span aria-hidden="true">✓</span><div><strong>{handoff.incoming?.name} verified</strong><span>{displayTime(handoff.verifiedAt)}</span></div></div>}
          {!readOnly && verified && handoff.status === 'draft' && currentItem && <form className={styles.walkthrough} onSubmit={acknowledgeItem}>
            <span className={styles.eyebrow}>ITEM {reviewedCount + 1} OF {attentionCount}</span>
            <h2>{currentItem.title}</h2><p className={styles.location}>{currentItem.area}</p>
            <dl><div><dt>Stopped at</dt><dd>{currentItem.stoppedAt || 'Not recorded — discuss the current condition.'}</dd></div><div><dt>Next action</dt><dd>{currentItem.nextAction || 'Not recorded — clarify together.'}</dd></div></dl>
            {askingQuestion ? <div className={styles.questionForm}>
              <TextField autoFocus fullWidth multiline minRows={2} label="Question to discuss" required value={question} disabled={busy} onChange={(event) => { setDiscussionTouched(true); setQuestion(event.target.value) }} slotProps={{ htmlInput: { maxLength: 500 } }} />
              <TextField fullWidth multiline minRows={2} label="Agreed answer / resolution" required value={resolution} disabled={busy} onChange={(event) => { setDiscussionTouched(true); setResolution(event.target.value) }} helperText="Resolve this question together before acknowledging the item." slotProps={{ htmlInput: { maxLength: 2000 } }} />
              <Button type="submit" variant="contained" disabled={busy || !question.trim() || !resolution.trim()}>Resolved · I understand</Button>
              <Button type="button" onClick={cancelQuestion} disabled={busy}>Back to reviewing</Button>
            </div> : <div className={styles.sidebarActions}><Button type="submit" variant="contained" disabled={busy}>{busy ? 'Saving…' : 'I understand'}</Button><Button type="button" variant="outlined" disabled={busy} onClick={() => setAskingQuestion(true)}>I have a question</Button></div>}
            <p className={styles.note}>Acknowledging an item does not close the inspection or change its condition.</p>
          </form>}
          {!readOnly && verified && handoff.status === 'draft' && !currentItem && <div className={styles.sidebarActions}>
            <p className={styles.reviewed} role="status">{reviewedCount} of {attentionCount} follow-up items acknowledged</p>
            <Button variant="contained" disabled={busy || !canConfirm} onClick={confirmHandoff}>{busy ? 'Completing handover…' : 'Confirm handover & log out'}</Button>
          </div>}
          {!readOnly && confirmed && <div className={styles.sidebarActions}><p className={styles.note}>Confirmed {displayTime(handoff.confirmedAt)}</p><Button variant="contained" disabled={busy} onClick={confirmHandoff}>{busy ? 'Completing handover…' : 'Complete handover & log out'}</Button></div>}
          {completed && <div className={styles.sidebarActions}><p className={styles.note}>Completed {displayTime(handoff.completedAt)}</p><Button variant="contained" disabled={busy} onClick={logOut}>{busy ? 'Logging out…' : 'Log out'}</Button></div>}
        </section>
      </aside>
      <article className={styles.document} aria-labelledby="handoff-report-title">
        <div className={styles.documentHeader}><div><span className={styles.eyebrow}>SHIFT HANDOFF REPORT</span><h2 id="handoff-report-title">{registration}</h2><p>{handoff.aircraft.model} · {handoff.aircraft.location}</p></div><span className={`${styles.statusBadge} ${completed ? styles.completeBadge : ''}`}>{completed ? 'Completed' : confirmed ? 'Confirmed' : 'Ready for walkthrough'}</span></div>
        <section className={styles.summary} aria-label="Handoff details">
          <div><span>Work package</span><strong>{handoff.aircraft.work}</strong></div>
          <div><span>Due back in service</span><strong>{handoff.aircraft.due}</strong></div>
          <div><span>Outgoing employee</span><strong>{handoff.outgoing.name}</strong></div>
          <div><span>Incoming employee</span><strong>{handoff.incoming?.name ?? 'Awaiting PIN verification'}</strong></div>
          <div><span>Report prepared</span><strong>{displayTime(handoff.createdAt)}</strong></div>
          <div><span>Walkthrough progress</span><strong>{reviewedCount} of {attentionCount} follow-up items acknowledged</strong></div>
        </section>
        <section className={styles.workSection} aria-label="Work items in this handoff">
          {[true, false].map((followUp) => {
            const items = handoff.items.filter((item) => required.includes(item.id) === followUp)
            const cards = <>          {items.map((item) => {
            const requiresReview = required.includes(item.id)
            const acknowledgement = handoff.acknowledgements.find((entry) => entry.taskId === item.id)
            const answers = handoff.answers.filter((answer) => answer.taskId === item.id)
            return <section key={item.id} className={`${styles.task} ${requiresReview ? styles.attentionTask : ''} ${item.id === currentItem?.id && verified ? styles.currentTask : ''}`} aria-label={item.title}>
              <div className={styles.taskHeading}><h4>{item.title}</h4><span className={`${styles.taskStatus} ${styles[item.status]}`}>{statusLabels[item.status]}</span></div>
              <p className={styles.taskMeta}>{item.area} · {people.get(item.assigneeId ?? '') ?? 'Unassigned'}</p>
              <div className={styles.tags}>{item.leftOpen && <span className={styles.warningTag}>Physical condition left open</span>}{requiresReview && !acknowledged.has(item.id) && <span className={styles.warningTag}>{item.id === currentItem?.id && verified ? 'Reviewing now' : 'Awaiting acknowledgement'}</span>}{acknowledged.has(item.id) && <span className={styles.reviewedTag}>✓ Acknowledged by {handoff.incoming?.name ?? 'incoming employee'}</span>}</div>
              {acknowledgement && <p className={styles.acknowledgementTime}>Acknowledged {displayTime(acknowledgement.acknowledgedAt)}</p>}
              {requiresReview && <dl className={styles.priorityDetails}><div><dt>Current condition / stopping point</dt><dd>{item.stoppedAt || 'Not recorded'}</dd></div><div><dt>Next action</dt><dd>{item.nextAction || 'Not recorded'}</dd></div></dl>}
              <details className={styles.taskNotes}><summary>Inspection details</summary><dl className={styles.taskDetails}><div><dt>What was found</dt><dd>{item.found || 'Not recorded'}</dd></div><div><dt>What was done</dt><dd>{item.workDone || 'Not recorded'}</dd></div>{!requiresReview && <><div><dt>Exact stopping point</dt><dd>{item.stoppedAt || 'Not recorded'}</dd></div><div><dt>Next action</dt><dd>{item.nextAction || 'Not recorded'}</dd></div></>}<div><dt>Manual / checklist reference</dt><dd>{item.manualReference || 'Not recorded'}</dd></div></dl></details>
              {answers.length > 0 && <div className={styles.discussion}><strong>Clarified before handoff</strong>{answers.map((answer, index) => <div key={index}><p>{answer.question}</p><p className={styles.answer}>{answer.answer}</p></div>)}</div>}
              {acknowledgement?.question && <div className={styles.discussion}><strong>Discussed together</strong><p>{acknowledgement.question}</p><p className={styles.answer}>{acknowledgement.resolution}</p></div>}
            </section>
          })}</>
            return followUp ? <section key="follow-up"><div className={styles.sectionHeading}><h3>Needs follow-up · {items.length}</h3><span aria-live="polite">{reviewedCount} of {attentionCount} acknowledged</span></div>{items.length ? cards : <p className={styles.note}>No follow-up items in this handoff.</p>}</section> : items.length > 0 ? <details key="completed" className={styles.completedWork}><summary>Completed work · {items.length}</summary>{cards}</details> : null
          })}
        </section>
        <details className={styles.writtenReport}><summary>Read the written handoff summary</summary><div>{handoff.report}</div></details>
        <footer className={styles.documentFooter}><p>This report records the saved inspection notes and handover discussion. Missing details are shown as not recorded.</p><Button variant="outlined" onClick={downloadReport}>Download report</Button></footer>
      </article>
    </main>}
  </div>
}
