import { useEffect, useRef, useState } from 'react'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { LoginPage } from '@/pages/public/Login'
import { AircraftSelectionPage } from '@/pages/protected/AircraftSelection'
import { ShiftBoardPage } from '@/pages/protected/ShiftBoard'
import { CapturePage } from '@/pages/protected/Capture'
import { HandOverTogetherPage } from '@/pages/protected/HandOverTogether'
import { PrepareHandoffPage } from '@/pages/protected/PrepareHandoff'
import type { WorkItem } from '@/data/board'
import { api, hasSession } from '@/api/client'
import type { Employee } from '@/data/employees'
import { getLocation, loginPath, navigate, parseRoute, paths, safeReturnTo, useAppLocation } from '@/routing/navigation'

function Notice({ title, message, onRetry, onBack }: {
  title: string; message?: string; onRetry?: () => void; onBack?: () => void
}) {
  return <Container component="main" maxWidth="sm" sx={{ py: 8 }}><Stack spacing={2}>
    <Typography component="h1" variant="h5">{title}</Typography>
    {message && <Typography color="text.secondary" role={onRetry ? 'alert' : 'status'}>{message}</Typography>}
    <Stack direction="row" spacing={1}>{onRetry && <Button variant="contained" onClick={onRetry}>Try again</Button>}{onBack && <Button onClick={onBack}>Choose an aircraft</Button>}</Stack>
  </Stack></Container>
}

function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to, { replace: true, bypassGuard: true }) }, [to])
  return <Notice title="Opening Nimbus…" />
}

/** One mount per history entry. Replacing /new after save keeps Capture's modal/state. */
function InspectionRoute({ registration, itemId, employee }: {
  registration: string; itemId: string | null; employee: Employee
}) {
  const [initialItemId] = useState(itemId)
  const [loaded, setLoaded] = useState<{ item: WorkItem | null; ownerName: string } | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    // Fetch the board for both paths: new inspection URLs also need assignment checks.
    api.board(registration).then((board) => {
      if (!active) return
      const item = initialItemId ? board.items.find((candidate) => candidate.id === initialItemId) : null
      if (initialItemId && !item) {
        setError('This inspection was not found on the selected aircraft.')
        return
      }
      setLoaded({ item: item ?? null, ownerName: item ? board.employees.find((person) => person.id === item.assigneeId)?.name ?? 'Unassigned' : employee.name })
      setError('')
    }).catch((failure) => {
      if (active) setError(failure instanceof Error ? failure.message : 'Unable to load this inspection. Please try again.')
    })
    return () => { active = false }
  }, [registration, initialItemId, employee.name, attempt])

  if (error) return <Notice title="Unable to open this inspection" message={error} onRetry={() => { setError(''); setAttempt((value) => value + 1) }} onBack={() => navigate(paths.aircraft)} />
  if (!loaded) return <Notice title="Opening inspection…" message="Loading the saved aircraft notes." />
  return <CapturePage registration={registration} employee={employee} initialItem={loaded.item} ownerName={loaded.ownerName}
    onBack={() => navigate(paths.board(registration))}
    onSaved={(id) => { navigate(paths.inspection(registration, id), { replace: true, bypassGuard: true }) }} />
}

export default function App() {
  const location = useAppLocation()
  const route = parseRoute(location.pathname)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [authState, setAuthState] = useState<'checking' | 'guest' | 'ready' | 'error'>(() => hasSession() ? 'checking' : 'guest')
  const [authError, setAuthError] = useState('')
  const [restoreAttempt, setRestoreAttempt] = useState(0)
  const authGeneration = useRef(0)

  useEffect(() => {
    let active = true
    const sessionGone = () => {
      authGeneration.current++
      setEmployee(null); setAuthState('guest'); setAuthError('')
      const current = getLocation()
      if (parseRoute(current.pathname).kind !== 'login') {
        navigate(loginPath(current.pathname), { replace: true, bypassGuard: true })
      }
    }
    async function restore() {
      if (!hasSession()) { sessionGone(); return }
      const generation = ++authGeneration.current
      setAuthState('checking'); setAuthError('')
      try {
        const person = await api.me()
        if (active && generation === authGeneration.current) { setEmployee(person); setAuthState('ready') }
      } catch (failure) {
        if (!active || generation !== authGeneration.current) return
        if (!hasSession()) { sessionGone(); return }
        setAuthState('error')
        setAuthError(failure instanceof Error ? failure.message : 'Unable to reach the server. Your sign-in is kept; try again when it is available.')
      }
    }
    const changed = () => { void restore() }
    window.addEventListener('nimbus:session-expired', sessionGone)
    window.addEventListener('nimbus:session-changed', changed)
    if (hasSession()) void restore()
    return () => {
      active = false
      window.removeEventListener('nimbus:session-expired', sessionGone)
      window.removeEventListener('nimbus:session-changed', changed)
    }
  }, [restoreAttempt])

  function signedIn(person: Employee) {
    authGeneration.current++
    setEmployee(person); setAuthState('ready'); setAuthError('')
    const returnTo = new URLSearchParams(getLocation().search).get('returnTo')
    navigate(safeReturnTo(returnTo), { replace: true, bypassGuard: true })
  }

  async function signOut() {
    try {
      await api.logout()
      authGeneration.current++
      setEmployee(null); setAuthState('guest')
      navigate('/login', { replace: true, bypassGuard: true })
    } catch (failure) {
      window.alert(failure instanceof Error ? failure.message : 'Unable to sign out. Please try again.')
    }
  }

  if (authState === 'checking') return <Notice title="Restoring your sign-in…" message="Checking your employee session." />
  if (authState === 'error') return <Notice title="Unable to restore your sign-in" message={authError} onRetry={() => setRestoreAttempt((value) => value + 1)} />
  if (!employee || authState === 'guest') {
    return route.kind === 'login' ? <LoginPage onSignIn={signedIn} /> : <Redirect to={loginPath(location.pathname)} />
  }
  if (route.kind === 'login') return <Redirect to={safeReturnTo(new URLSearchParams(location.search).get('returnTo'))} />
  if (route.kind === 'index') return <Redirect to={paths.aircraft} />
  if (route.kind === 'notFound') return <Notice title="This page was not found" message="Choose an assigned aircraft to continue." onBack={() => navigate(paths.aircraft)} />
  if (route.kind === 'aircraft') return <AircraftSelectionPage key={`${employee.id}:${location.key}`} employee={employee} onSignOut={signOut} onSelectAircraft={(registration) => navigate(paths.board(registration))} />
  if (route.kind === 'inspection') return <InspectionRoute key={`${employee.id}:${location.key}`} registration={route.registration} itemId={route.itemId} employee={employee} />
  if (route.kind === 'prepare') return <PrepareHandoffPage key={`${employee.id}:${location.key}`} registration={route.registration} employee={employee}
    onCreated={(id) => navigate(paths.handoff(route.registration, id), { replace: true, bypassGuard: true })}
    onBack={() => navigate(paths.board(route.registration))} />
  if (route.kind === 'handoff') return <HandOverTogetherPage key={`${employee.id}:${location.key}`} registration={route.registration} employee={employee} handoffId={route.handoffId}
    onBack={() => navigate(paths.board(route.registration))} onSignOut={signOut} />
  return <ShiftBoardPage key={`${employee.id}:${location.key}`} registration={route.registration} employee={employee}
    onOpenHandoff={(id) => navigate(paths.handoff(route.registration, id))}
    onPrepareHandoff={() => navigate(paths.prepare(route.registration))} onSignOut={signOut}
    onSwitchAircraft={() => navigate(paths.aircraft)}
    onCapture={(item) => navigate(paths.inspection(route.registration, item?.id ?? null))} />
}
