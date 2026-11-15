import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'

export default function DraftRecoveryNotice({ recovery }: { recovery: {
  pending: { savedAt: number; stale: boolean; omittedPhotos: boolean } | null
  restore: () => void; discard: () => boolean; storageError: string
} }) {
  return <><Dialog open={Boolean(recovery.pending)} aria-labelledby="restore-draft-title" maxWidth="sm" fullWidth>
    <DialogTitle id="restore-draft-title">Restore your unsaved draft?</DialogTitle>
    <DialogContent><p>A draft for your employee account was saved on this browser {recovery.pending && new Date(recovery.pending.savedAt).toLocaleString()}.</p>
      {recovery.pending?.stale && <p role="alert">The saved aircraft notes have changed since this draft. If you restore it, check your answers and fields against the current task before saving.</p>}
      {recovery.pending?.omittedPhotos && <p>Unsaved photos are not stored in browser drafts. Attach them again if needed.</p>}
      {recovery.storageError && <p role="alert">{recovery.storageError}</p>}
    </DialogContent>
    <DialogActions><Button onClick={() => recovery.discard()}>Discard draft</Button><Button variant="contained" onClick={recovery.restore}>Restore draft</Button></DialogActions>
  </Dialog>{!recovery.pending && recovery.storageError && <p role="alert">{recovery.storageError}</p>}</>
}
