import { useEffect, useRef, useState } from 'react'

const VERSION = 1
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_DRAFT_BYTES = 250_000
const excludedKeys = new Set([
  'pin', 'password', 'token', 'accesstoken', 'refreshtoken', 'sessiontoken',
  'photodata', 'photo', 'photos', 'audio', 'audiodata', 'recording', 'blob',
])

export interface DraftRecoveryScope {
  employeeId: string
  aircraftId: string
  kind: 'inspection' | 'handoff'
  itemId?: string
}
interface StoredDraft<T> {
  version: number
  savedAt: number
  baseSignature: string
  omittedPhotos: boolean
  data: T
}
interface RecoveryState<T> {
  key: string
  pending: StoredDraft<T> | null
  storageError: string
  savedAt: number | null
}
interface Options<T> {
  scope: DraftRecoveryScope
  /** Pass only recoverable text/form data; never credentials, audio, or photos. */
  value: T
  dirty: boolean
  /** Enable after the current backend record has loaded. */
  enabled?: boolean
  /** A stable signature of the backend data the draft is based on. */
  baseSignature: string
  validate: (data: unknown) => data is T
  onRestore: (data: T) => void
  omittedPhotos?: boolean
}

function storageKey(scope: DraftRecoveryScope): string {
  return ['nimbus', 'draft', `v${VERSION}`, scope.employeeId, scope.aircraftId,
    scope.kind, scope.itemId ?? 'new'].map(encodeURIComponent).join(':')
}
function readDraft<T>(key: string, validate: Options<T>['validate']): RecoveryState<T> {
  const empty: RecoveryState<T> = { key, pending: null, storageError: '', savedAt: null }
  if (typeof window === 'undefined') return empty
  try {
    const text = localStorage.getItem(key)
    if (!text) return empty
    if (text.length > MAX_DRAFT_BYTES) {
      localStorage.removeItem(key)
      return { ...empty, storageError: 'An oversized local draft was removed. Your saved aircraft records are unchanged.' }
    }
    const entry: unknown = JSON.parse(text)
    if (!entry || typeof entry !== 'object') throw new Error('Invalid draft')
    const draft = entry as Partial<StoredDraft<T>>
    if (draft.version !== VERSION || typeof draft.savedAt !== 'number'
      || !Number.isFinite(draft.savedAt) || typeof draft.baseSignature !== 'string'
      || typeof draft.omittedPhotos !== 'boolean' || !validate(draft.data)) {
      throw new Error('Invalid draft')
    }
    if (Date.now() - draft.savedAt > MAX_AGE_MS || draft.savedAt > Date.now() + 60_000) {
      localStorage.removeItem(key)
      return empty
    }
    return { ...empty, pending: draft as StoredDraft<T>, savedAt: draft.savedAt }
  } catch {
    return { ...empty, storageError: 'The local draft could not be read. You can continue editing, but refresh recovery may be unavailable.' }
  }
}
function serialize<T>(value: T): string {
  return JSON.stringify(value, (key, entry: unknown) => {
    if (excludedKeys.has(key.toLowerCase())) return undefined
    if (typeof Blob !== 'undefined' && entry instanceof Blob) return undefined
    return entry
  })
}

/** Employee-scoped local drafts. Recovery is always an explicit user choice. */
export function useDraftRecovery<T>({
  scope, value, dirty, enabled = true, baseSignature, validate, onRestore,
  omittedPhotos = false,
}: Options<T>) {
  const key = storageKey(scope)
  const [state, setState] = useState<RecoveryState<T>>(() => readDraft(key, validate))
  // A changed employee/aircraft/task must never render the previous scope's draft.
  if (state.key !== key) setState(readDraft(key, validate))
  const current = state.key === key ? state : null
  const clearedValue = useRef<{ key: string; data: string } | null>(null)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  let serialized: string | null = null
  try { serialized = serialize(value) } catch { /* Report after commit below. */ }
  const pending = current?.pending ?? null
  const active = Boolean(enabled && current && !pending)

  useEffect(() => {
    if (!active || !dirty) return
    if (serialized === null) {
      const timer = window.setTimeout(() => setState((old) => old.key === key ? {
        ...old, storageError: 'This draft could not be stored locally. Keep this page open until you save.',
      } : old), 0)
      return () => window.clearTimeout(timer)
    }
    // A successful save/discard must not be undone by the previous render's timer.
    if (clearedValue.current?.key === key && clearedValue.current.data === serialized) return
    let stopped = false
    const persist = () => {
      if (stopped) return
      if (clearedValue.current?.key === key && clearedValue.current.data === serialized) return
      try {
        const savedAt = Date.now()
        const record: StoredDraft<T> = {
          version: VERSION, savedAt, baseSignature, omittedPhotos,
          data: JSON.parse(serialized) as T,
        }
        const text = JSON.stringify(record)
        if (text.length > MAX_DRAFT_BYTES) throw new Error('Draft too large')
        localStorage.setItem(key, text)
        if (mounted.current) setState((old) => old.key === key ? { ...old, savedAt, storageError: '' } : old)
      } catch {
        if (mounted.current) setState((old) => old.key === key ? {
          ...old, storageError: 'Your browser could not store this draft. Keep this page open until you save; refresh recovery is unavailable.',
        } : old)
      }
    }
    const timer = window.setTimeout(persist, 250)
    window.addEventListener('beforeunload', persist)
    return () => {
      // Flush the latest committed text when navigating away, without deleting it.
      persist()
      stopped = true
      window.clearTimeout(timer)
      window.removeEventListener('beforeunload', persist)
    }
  }, [active, dirty, key, serialized, baseSignature, omittedPhotos])

  function removeStored(): boolean {
    try {
      localStorage.removeItem(key)
      clearedValue.current = { key, data: serialized ?? '' }
      setState({ key, pending: null, savedAt: null, storageError: '' })
      return true
    } catch {
      setState((old) => old.key === key ? {
        ...old, storageError: 'The browser could not remove this local draft. Try discarding it again before leaving this shared station.',
      } : old)
      return false
    }
  }
  function restore() {
    if (!enabled || !pending) return
    onRestore(pending.data)
    clearedValue.current = null
    setState((old) => old.key === key ? { ...old, pending: null } : old)
  }
  return {
    pending: pending ? {
      savedAt: pending.savedAt,
      stale: enabled && pending.baseSignature !== baseSignature,
      omittedPhotos: pending.omittedPhotos,
    } : null,
    restore,
    discard: removeStored,
    /** Call only after the backend confirms the inspection/report was saved. */
    clear: removeStored,
    storageError: current?.storageError ?? '',
    savedAt: current?.savedAt ?? null,
  }
}
