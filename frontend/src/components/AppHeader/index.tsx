import { useCurrentTime } from '@/hooks/useCurrentTime'
import Button from '@mui/material/Button'
import type { Employee } from '@/data/employees'
import styles from './AppHeader.module.css'

export default function AppHeader({ employee, onSignOut, aircraft, onSwitchAircraft }: { employee?: Employee; onSignOut?: () => void; aircraft?: string; onSwitchAircraft?: () => void }) {
  const now = useCurrentTime()

  return (
    <header className={`${styles.header} ${aircraft ? styles.dark : ""}`}>
      <a className={styles.brand} href="/" aria-label="Nimbus home">
        <span className={styles.mark} aria-hidden="true">☁</span>
        Nimbus
      </a>
      <span className={styles.station}>{aircraft ? `Shift board · ${aircraft}` : 'Hangar 2 station · Shared station'}</span>
      <time className={styles.clock} dateTime={now.toISOString()}>
        <span className={styles.date}>{now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        <span className={styles.time}>{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
      </time>
      {employee && <div className={styles.account}><span>{employee.name} · Employee</span>{onSwitchAircraft && <Button variant="outlined" onClick={onSwitchAircraft}>Switch aircraft</Button>}<Button variant="outlined" onClick={onSignOut}>Log out</Button></div>}
    </header>
  )
}
