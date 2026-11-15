import { AppearanceControl } from '@/components/AppearanceProvider'
import { useCurrentTime } from '@/hooks/useCurrentTime'
import Button from '@mui/material/Button'
import type { Employee } from '@/data/employees'
import styles from './AppHeader.module.css'

export default function AppHeader({ employee, onSignOut, aircraft, onSwitchAircraft }: { employee?: Employee; onSignOut?: () => void; aircraft?: string; onSwitchAircraft?: () => void }) {
  const now = useCurrentTime()

  return (
    <header className={styles.header}>
      <a className={styles.brand} href="/" aria-label="Nimbus home">
        <span className={styles.mark} aria-hidden="true">☁</span>
        Nimbus
      </a>
      <span className={styles.station}>{aircraft ? `Shift board · ${aircraft}` : 'Hangar 2'}</span>
      <div className={styles.utilities}>
      <time className={styles.clock} dateTime={now.toISOString()}>
        <span className={styles.date}>{now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        <span className={styles.time}>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
      </time>
      {employee && <div className={styles.account}><span>{employee.name}</span>{onSwitchAircraft && <Button size="small" variant="text" onClick={onSwitchAircraft}>Switch aircraft</Button>}<Button size="small" variant="text" onClick={onSignOut}>Log out</Button></div>}
      <AppearanceControl />
      </div>
    </header>
  )
}
