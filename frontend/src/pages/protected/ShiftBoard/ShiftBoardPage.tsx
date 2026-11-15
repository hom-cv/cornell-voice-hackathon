import { useEffect, useState } from 'react'
import Button from '@mui/material/Button'
import HandoffHistory from '@/components/HandoffHistory'
import AppHeader from '@/components/AppHeader'
import NimbusMascot from '@/components/NimbusMascot'
import { api } from '@/api/client'
import type { Employee } from '@/data/employees'
import type { AircraftBoard, WorkStatus, WorkItem } from '@/data/board'
import { needsFollowUp } from '@/data/board'
import styles from './ShiftBoardPage.module.css'

const labels: Record<WorkStatus, string> = { not_started: 'Not started', open: 'Needs follow-up', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' }
const progressOrder: WorkStatus[] = ['done', 'in_progress', 'blocked', 'open', 'not_started']
const filterOrder: ('all' | WorkStatus)[] = ['all', 'open', 'not_started', 'in_progress', 'blocked', 'done']

export default function ShiftBoardPage({ registration, employee, onSignOut, onSwitchAircraft, onCapture, onPrepareHandoff, onOpenHandoff }: {
  onOpenHandoff: (id: string) => void; onPrepareHandoff: () => void; registration: string; employee: Employee; onSignOut: () => void; onSwitchAircraft: () => void; onCapture: (item?: WorkItem, ownerName?: string) => void
}) {
  const [board, setBoard] = useState<AircraftBoard | null>(null)
  const [filter, setFilter] = useState<'all' | WorkStatus>('all')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [reviewIndex, setReviewIndex] = useState(0)

  useEffect(() => {
    let active = true
    api.board(registration).then((result) => {
      if (active) { setBoard(result); setReviewIndex(0); setError('') }
    }).catch((failure) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to load the inspection board.')
    })
    return () => { active = false }
  }, [registration, attempt])

  const counts = { not_started: 0, open: 0, in_progress: 0, blocked: 0, done: 0 }
  board?.items.forEach((item) => counts[item.status]++)
  const reviewItems = board?.items.filter(needsFollowUp) ?? []
  const activeReviewIndex = reviewItems.length ? reviewIndex % reviewItems.length : 0
  const reviewItem = reviewItems[activeReviewIndex]
  const visibleItems = board?.items.filter((item) => filter === 'all' || item.status === filter) ?? []

  return (
    <div className={styles.page}>
      <AppHeader employee={employee} aircraft={registration} onSignOut={onSignOut} onSwitchAircraft={onSwitchAircraft} />
      <main className={styles.main}>
        {error ? <section className={styles.message} role="alert"><h1>Unable to load this aircraft</h1><p>{error}</p><Button onClick={() => { setError(''); setAttempt((value) => value + 1) }}>Retry</Button><Button onClick={onSwitchAircraft}>Choose another aircraft</Button></section> : !board ? <p role="status">Loading inspection board…</p> : <>
          <section className={styles.briefing} aria-label="Nimbus briefing">
            <div className={styles.mascot}><NimbusMascot /></div>
            <div className={`${styles.speech} ${reviewItem ? styles.caution : ''}`} role="region" aria-roledescription={reviewItem ? 'carousel' : undefined} aria-label="Tasks needing review">
              <span className={styles.eyebrow}>NIMBUS · {reviewItem ? 'NEEDS FOLLOW-UP' : 'INSPECTION BOARD'}</span>
              {reviewItem ? <>
                <div aria-live="polite" aria-atomic="true">
                  <div role="group" aria-roledescription="slide" aria-label={`${activeReviewIndex + 1} of ${reviewItems.length}`}>
                    <h1>{reviewItem.title}</h1>
                    <p>{reviewItem.area} · {board.employees.find((person) => person.id === reviewItem.assigneeId)?.name ?? 'Unassigned'}</p>
                    <div className={styles.reviewDetails}>
                      <span className={`${styles.badge} ${styles[`${reviewItem.status}Badge`]}`}>{labels[reviewItem.status]}</span>
                      {(reviewItem.stoppedAt || reviewItem.nextAction) && <p className={styles.reviewPreview} title={reviewItem.stoppedAt || reviewItem.nextAction}><strong>{reviewItem.stoppedAt ? 'Current condition:' : 'Next action:'}</strong> {reviewItem.stoppedAt || reviewItem.nextAction}</p>}
                    </div>
                  </div>
                </div>
                <div className={styles.reviewActions}>
                  <Button variant="contained" onClick={() => onCapture(reviewItem, board.employees.find((person) => person.id === reviewItem.assigneeId)?.name ?? 'Unassigned')}>Talk to Nimbus</Button>
                  <div className={styles.carouselControls}>
                    <Button aria-label="Previous task to review" disabled={reviewItems.length < 2} onClick={() => setReviewIndex((activeReviewIndex + reviewItems.length - 1) % reviewItems.length)}>←</Button>
                    <span>{activeReviewIndex + 1} of {reviewItems.length}</span>
                    <Button aria-label="Next task to review" disabled={reviewItems.length < 2} onClick={() => setReviewIndex((activeReviewIndex + 1) % reviewItems.length)}>→</Button>
                  </div>
                </div>
              </> : <>
                <h1>No tasks needing follow-up, {employee.name}.</h1>
                <p>{board.items.length ? `${counts.done} of ${board.items.length} work items are complete.` : 'No inspection work items have been added to this aircraft yet.'}</p>
                <Button variant="contained" onClick={() => onCapture()} sx={{ mt: 2 }}>Start an inspection</Button>
              </>}
            </div>
          </section>
          <section className={styles.summary} aria-label="Aircraft summary">
            <div><span className={styles.eyebrow}>AIRCRAFT</span><h2>{registration}</h2><p>{board.aircraft.model} · {board.aircraft.location}</p></div>
            <div><span className={styles.eyebrow}>WORK PACKAGE</span><h3>{board.aircraft.work}</h3><p>Due back in service <strong>{board.aircraft.due}</strong></p></div>
            <div><span className={styles.eyebrow}>SIGNED IN</span><h3>{employee.name}</h3><p>Inspection task board</p></div>
          </section>
          <section className={styles.progress} aria-label="Work progress">
            <div className={styles.progressHeading}><strong>{board.items.length} work items</strong><span>{counts.done} of {board.items.length} done</span></div>
            <div className={styles.progressBar} role="img" aria-label={progressOrder.map((status) => `${labels[status]}: ${counts[status]}`).join(', ')}>
              {progressOrder.map((status) => counts[status] > 0 && <span key={status} className={styles[status]} style={{ flex: counts[status] }} />)}
            </div>
            <div className={styles.legend}>{progressOrder.map((status) => <span key={status}><i className={styles[status]} />{labels[status]} <strong>{counts[status]}</strong></span>)}</div>
          </section>
          <HandoffHistory registration={registration} onOpen={onOpenHandoff} />
          <section className={styles.tasks} aria-label="Inspection work items">
            <div className={styles.taskHeader}><h2>Work items</h2><Button variant="contained" onClick={onPrepareHandoff}>Prepare handoff</Button><div className={styles.filters} aria-label="Filter by status">{filterOrder.map((status) => <button key={status} aria-pressed={filter === status} onClick={() => setFilter(status)} className={filter === status ? styles.activeFilter : ''}>{status === 'all' ? 'All' : labels[status]}</button>)}</div></div>
            <div aria-live="polite">
              {visibleItems.length === 0 && <p className={styles.empty}>{board.items.length === 0 ? 'No work items have been added yet.' : `No ${labels[filter as WorkStatus]?.toLowerCase()} work items.`}</p>}
              {visibleItems.map((item) => <article className={styles.task} key={item.id}>
                <span className={styles.taskIcon} aria-hidden="true">{item.leftOpen ? '⚠' : item.status === 'done' ? '✓' : '○'}</span>
                <div className={styles.taskContent}><h3><button className={styles.taskLink} onClick={() => onCapture(item, board.employees.find((person) => person.id === item.assigneeId)?.name ?? "Unassigned")}>{item.title}</button></h3><p>{item.area} · {board.employees.find((person) => person.id === item.assigneeId)?.name ?? 'Unassigned'}</p>{needsFollowUp(item) && <p className={styles.reviewLabel}>Needs follow-up by the next shift</p>}<p className={styles.taskNote}><strong>{item.status === 'done' ? 'Completed:' : 'Stopped at:'}</strong> {item.stoppedAt || 'No stopping point recorded.'}</p></div>
                <span className={`${styles.badge} ${styles[`${item.status}Badge`]}`}>{labels[item.status]}</span>
              </article>)}
            </div>
          </section>
        </>}
      </main>
    </div>
  )
}
