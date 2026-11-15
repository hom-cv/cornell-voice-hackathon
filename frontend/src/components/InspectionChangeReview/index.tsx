import { needsFollowUp } from '@/data/board'
import type { InspectionDraft } from '@/data/board'
import styles from './InspectionChangeReview.module.css'

export interface InspectionChange {
  taskId: string
  title: string
  before: InspectionDraft
  after: InspectionDraft
}

const fields: { key: keyof InspectionDraft; label: string }[] = [
  { key: 'title', label: 'Inspection title' },
  { key: 'area', label: 'Location / area' },
  { key: 'status', label: 'Status' },
  { key: 'found', label: 'What was found' },
  { key: 'workDone', label: 'What was done' },
  { key: 'stoppedAt', label: 'Exact stopping point' },
  { key: 'nextAction', label: 'Next action' },
  { key: 'manualReference', label: 'Manual / checklist reference' },
  { key: 'leftOpen', label: 'Unresolved physical condition' },
  { key: 'handoffReviewRequired', label: 'Needs follow-up by the next shift' },
  { key: 'photoData', label: 'Photo' },
]
const statusLabels: Record<InspectionDraft['status'], string> = {
  not_started: 'Not started', open: 'Needs follow-up', in_progress: 'In progress', blocked: 'Blocked', done: 'Done',
}

function valueText(draft: InspectionDraft, key: keyof InspectionDraft): string {
  if (key === 'status') return statusLabels[draft.status] ?? String(draft.status)
  if (key === 'leftOpen') return draft.leftOpen ? 'Marked as unresolved' : 'Not marked as unresolved'
  if (key === 'handoffReviewRequired') return needsFollowUp(draft) ? 'Yes' : 'No'
  if (key === 'photoData') return draft.photoData ? 'Photo attached' : 'No photo'
  const value = draft[key]
  return typeof value === 'string' && value.trim() ? value : 'Not recorded'
}

export function InspectionChangeReview({ changes, emptyMessage = 'No field changes are proposed.' }: {
  changes: InspectionChange[]; emptyMessage?: string
}) {
  const changedItems = changes.map((change) => ({
    ...change, fields: fields.filter(({ key }) => key === 'handoffReviewRequired' ? needsFollowUp(change.before) !== needsFollowUp(change.after) : change.before[key] !== change.after[key]),
  })).filter((change) => change.fields.length > 0)

  if (changedItems.length === 0) return <p className={styles.empty}>{emptyMessage}</p>
  return <div className={styles.changes}>
    {changedItems.map((change) => <section className={styles.task} key={change.taskId} aria-label={`Proposed changes to ${change.title}`}>
      <div className={styles.taskHeader}><h3>{change.title || 'Inspection'}</h3><span>{change.fields.length} {change.fields.length === 1 ? 'change' : 'changes'}</span></div>
      <table className={styles.table}>
        <caption className={styles.srOnly}>Before and after values for {change.title || 'this inspection'}</caption>
        <thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">Proposed</th></tr></thead>
        <tbody>{change.fields.map(({ key, label }) => <tr key={key}>
          <th scope="row">{label}</th>
          <td data-label="Before">{valueText(change.before, key)}</td>
          <td className={styles.proposed} data-label="Proposed">{valueText(change.after, key)}</td>
        </tr>)}</tbody>
      </table>
    </section>)}
  </div>
}
