import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import AppHeader from '@/components/AppHeader'
import NimbusMascot from '@/components/NimbusMascot'
import { api } from '@/api/client'
import type { Employee } from '@/data/employees'
import styles from './LoginPage.module.css'

export default function LoginPage({ onSignIn }: { onSignIn: (employee: Employee) => void }) {
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    api.employees().then((items) => {
      if (active) { setEmployees(items); setError('') }
    }).catch(() => {
      if (active) setError('Unable to load employees. Check that the API and database are running.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt])

  function reset() {
    setEmployee(null)
    setPin('')
    setError('')
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^\d{6}$/.test(pin)) {
      setError('Enter all six digits of your PIN.')
      return
    }
    if (!employee || busy) return
    setBusy(true)
    try {
      const verified = await api.login(employee.id, pin)
      setPin('')
      onSignIn(verified)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <AppHeader />
      <main className={styles.main}>
        <NimbusMascot />
        <div className={styles.greeting}>
          <span className={styles.eyebrow}>YOUR SHIFT STARTS HERE</span>
          <h1>{employee ? `Welcome, ${employee.name}.` : 'Hi, I’m Nimbus. Who’s starting?'}</h1>
          <p>{employee ? 'Enter your six-digit employee PIN to sign in.' : 'Choose your name to sign in to your station.'}</p>
        </div>
        {employee ? (
          <form className={styles.pinForm} onSubmit={signIn}>
            <TextField
              autoFocus
              fullWidth
              label="6-digit PIN"
              type="password"
              value={pin}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, '').slice(0, 6))
                setError('')
              }}
              error={Boolean(error)}
              helperText={error || 'Enter your employee PIN.'}
              slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]{6}', maxLength: 6, autoComplete: 'off', 'aria-label': '6-digit employee PIN' } }}
            />
            <Button type="submit" variant="contained" size="large" fullWidth disabled={pin.length !== 6 || busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
            <Button onClick={reset} fullWidth disabled={busy}>← Choose a different employee</Button>
          </form>
        ) : (
          <div className={styles.employees}>
            {loading && <p role="status">Loading employees…</p>}
            {!loading && error && <div role="alert"><p>{error}</p><Button onClick={() => { setLoading(true); setAttempt((value) => value + 1) }}>Retry</Button></div>}
            {!loading && !error && employees.length === 0 && <p>No employees are available. Contact your station administrator.</p>}
            {employees.map((person) => (
              <button className={styles.employee} key={person.id} onClick={() => setEmployee(person)}>
                <span className={`${styles.avatar} ${person.id === 'peach' ? styles.peach : ''}`}>{person.name.charAt(0)}</span>
                <span className={styles.employeeDetails}><strong>{person.name}</strong><span>Employee</span></span>
                <span className={styles.arrow} aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        )}
        <p className={styles.note}>{employee ? 'Shared station · Sign out when your shift is finished.' : 'Your name. Your six-digit PIN. Ready for your shift.'}</p>
      </main>
      <footer className={styles.footer}><span>Nimbus · A smoother shift handoff</span><span>Employee access</span></footer>
    </div>
  )
}
