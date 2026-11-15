import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import AppHeader from '@/components/AppHeader'
import NimbusMascot from '@/components/NimbusMascot'
import type { Employee } from '@/data/employees'
import { api } from '@/api/client'
import type { AircraftVisit } from '@/data/aircraft'
import styles from './AircraftSelectionPage.module.css'

export default function AircraftSelectionPage({ employee, onSignOut, onSelectAircraft }: { employee: Employee; onSignOut: () => void; onSelectAircraft: (registration: string) => void }) {
  const [visits, setVisits] = useState<AircraftVisit[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [pageError, setPageError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    api.aircraft().then((items) => {
      if (active) { setVisits(items); setPageError('') }
    }).catch((failure) => {
      if (active) setPageError(failure instanceof Error ? failure.message : 'Unable to load aircraft.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt])

  async function selectAircraft(registration: string) {
    setBusy(true)
    try {
      const aircraft = await api.selectAircraft(registration)
      onSelectAircraft(aircraft.registration)
      setPageError('')
    } catch (failure) {
      setPageError(failure instanceof Error ? failure.message : 'Unable to select aircraft.')
    } finally {
      setBusy(false)
    }
  }

  async function openVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    const registration = String(data.get('registration')).trim().toUpperCase()
    if (visits.some((visit) => visit.registration === registration)) {
      setError('This aircraft already has a visit. Choose it from the list.')
      return
    }
    const visit = {
      registration,
      model: String(data.get('model')).trim(),
      location: String(data.get('location')).trim(),
      work: String(data.get('work')).trim(),
      due: String(data.get('due')).trim(),
    }
    if (Object.values(visit).some((value) => typeof value === 'string' && !value)) {
      setError('Complete each field to open a visit.')
      return
    }
    setBusy(true)
    try {
      const created = await api.createVisit(visit)
      setVisits((current) => [...current, created])
      setCreating(false)
      onSelectAircraft(created.registration)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to open visit.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <AppHeader employee={employee} onSignOut={onSignOut} />
      <main className={styles.main}>
        <NimbusMascot />
        <div className={styles.greeting}>
          <span>NIMBUS</span>
          <h1>Hi {employee.name}. Which aircraft are you on?</h1>
        </div>
        {loading && <p role="status">Loading your assigned aircraft…</p>}
        {pageError && <div role="alert"><p>{pageError}</p><Button onClick={() => { setLoading(true); setAttempt((value) => value + 1) }}>Retry</Button></div>}
        {!loading && !pageError && visits.length === 0 && <p>No aircraft are assigned to you. Contact your station administrator.</p>}
        <div className={styles.grid}>
          {visits.map((visit) => (
            <button
              key={visit.registration}
              className={`${styles.card} ${visit.openItems ? styles.warning : ''}`}
              onClick={() => selectAircraft(visit.registration)}
              disabled={busy}
            >
              <span className={styles.cardHeading}><strong>{visit.registration}</strong><span>{visit.model} · {visit.location}</span></span>
              <span className={styles.work}>{visit.work}</span>
              <span className={styles.due}>Due back in service <strong>{visit.due}</strong></span>
              <span className={styles.badges}>
                {visit.handoffItems > 0 && <span className={styles.alert}>{visit.handoffItems} need follow-up</span>}
                <span className={styles.progress}>{visit.completedItems} of {visit.totalItems} items done</span>
              </span>
            </button>
          ))}
          <section className={styles.newVisit}>
            <h2>New aircraft arrival</h2>
            <p>Open a visit when an aircraft comes in for a check or a fault.</p>
            <Button variant="contained" onClick={() => { setError(''); setCreating(true) }}>Open a visit</Button>
          </section>
        </div>
        <p className={styles.note}>Choose an aircraft to open its inspection board.</p>
      </main>
      <Dialog open={creating} onClose={() => { if (!busy) setCreating(false) }} fullWidth maxWidth="sm">
        <form onSubmit={openVisit}>
          <DialogTitle>Open an aircraft visit</DialogTitle>
          <DialogContent className={styles.fields}>
            <p className={styles.dialogNote}>Add this arrival to the station’s aircraft list. The new aircraft will be assigned to you.</p>
            <TextField autoFocus required label="Aircraft registration" name="registration" placeholder="N123HD" error={Boolean(error)} helperText={error || 'Use the aircraft’s tail number.'} slotProps={{ htmlInput: { maxLength: 20 } }} />
            <TextField required label="Aircraft model" name="model" placeholder="E175" />
            <TextField required label="Location" name="location" placeholder="Hangar 2, Bay 2" />
            <TextField required label="Check or fault" name="work" placeholder="A-check or reported fault" />
            <TextField required label="Due back in service" name="due" placeholder="Tomorrow 06:00" />
          </DialogContent>
          <DialogActions><Button disabled={busy} onClick={() => setCreating(false)}>Cancel</Button><Button disabled={busy} type="submit" variant="contained">Open visit</Button></DialogActions>
        </form>
      </Dialog>
    </div>
  )
}
