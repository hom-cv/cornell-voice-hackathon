import { useEffect, useState } from 'react'
import { LoginPage } from '@/pages/public/Login'
import { AircraftSelectionPage } from '@/pages/protected/AircraftSelection'
import { ShiftBoardPage } from '@/pages/protected/ShiftBoard'
import { CapturePage } from '@/pages/protected/Capture'
import { HandOverTogetherPage } from '@/pages/protected/HandOverTogether'
import { PrepareHandoffPage } from '@/pages/protected/PrepareHandoff'
import type { WorkItem } from '@/data/board'
import { api } from '@/api/client'
import type { Employee } from '@/data/employees'

export default function App() {
  const [handoffId, setHandoffId] = useState<string | null>(null)
  const [preparingHandoff, setPreparingHandoff] = useState(false)
  const [employee, setEmployee] = useState<Employee | null>(null)

  const [aircraft, setAircraft] = useState<string | null>(null)

  const [capture, setCapture] = useState<{ item: WorkItem | null; ownerName: string } | null>(null)

  useEffect(() => {
    const expire = () => { setEmployee(null); setAircraft(null); setCapture(null); setPreparingHandoff(false); setHandoffId(null) }
    window.addEventListener('nimbus:session-expired', expire)
    return () => window.removeEventListener('nimbus:session-expired', expire)
  }, [])

  async function signOut() {
    try {
      await api.logout()
      setEmployee(null)
      setAircraft(null)
      setCapture(null)
      setPreparingHandoff(false)
      setHandoffId(null)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to sign out. Please try again.')
    }
  }

  if (!employee) return <LoginPage onSignIn={setEmployee} />
  if (aircraft && handoffId) return <HandOverTogetherPage registration={aircraft} employee={employee} handoffId={handoffId} onBack={() => { setHandoffId(null); setPreparingHandoff(false) }} onSignOut={signOut} />
  if (aircraft && preparingHandoff) return <PrepareHandoffPage registration={aircraft} employee={employee} onCreated={setHandoffId} onBack={() => setPreparingHandoff(false)} />
  if (aircraft && capture) return <CapturePage registration={aircraft} employee={employee} initialItem={capture.item} ownerName={capture.ownerName} onBack={() => setCapture(null)} />
  if (aircraft) return <ShiftBoardPage key={aircraft} registration={aircraft} employee={employee} onPrepareHandoff={() => setPreparingHandoff(true)} onSignOut={signOut} onSwitchAircraft={() => setAircraft(null)} onCapture={(item, ownerName) => setCapture({ item: item ?? null, ownerName: ownerName ?? employee.name })} />
  return <AircraftSelectionPage employee={employee} onSignOut={signOut} onSelectAircraft={setAircraft} />
}
