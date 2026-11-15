import { useEffect, useState } from 'react'
import Button from '@mui/material/Button'
import { api } from '@/api/client'
import type { HandoffSummary } from '@/api/client'

export default function HandoffHistory({ registration, onOpen }: { registration: string; onOpen: (id: string) => void }) {
  const [records, setRecords] = useState<HandoffSummary[] | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    api.handoffHistory(registration).then((result) => { if (active) { setRecords(result); setError('') } }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Unable to load handoff history.') })
    return () => { active = false }
  }, [registration, attempt])
  return <section aria-label="Handoff history" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, padding: 20, marginBottom: 20 }}>
    <h2 style={{ fontSize: 18, marginTop: 0 }}>Handoff history</h2>
    {error ? <p role="alert">{error} <Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button></p> : !records ? <p role="status">Loading handoffs…</p> : records.length === 0 ? <p>No handoffs recorded for this aircraft yet.</p> : <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{records.map((record) => <li key={record.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTop: '1px solid var(--border)', padding: '12px 0' }}>
      <div><strong>{record.outgoing.name} → {record.incoming?.name ?? 'Incoming employee not verified'}</strong><p style={{ margin: '4px 0', color: 'var(--muted)', fontSize: 13 }}>{new Date(record.completedAt ?? record.createdAt).toLocaleString()} · {record.status === 'completed' ? 'Completed' : record.status === 'confirmed' ? 'Confirmed · awaiting finish' : 'Draft'}</p></div>
      <Button variant="outlined" onClick={() => onOpen(record.id)}>{record.status === 'completed' ? 'View handoff' : 'Open handoff'}</Button>
    </li>)}</ul>}
  </section>
}
