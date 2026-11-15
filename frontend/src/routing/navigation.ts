import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'

interface Entry { index: number; key: string }
export interface AppLocation extends Entry { pathname: string; search: string; hash: string; href: string }
interface NavigateOptions { replace?: boolean; bypassGuard?: boolean }
const stateKey = '__nimbusNavigation'
const listeners = new Set<() => void>()
const guards = new Map<symbol, string>()
let restoring: Entry | null = null

function entryFromState(state: unknown): Entry | null {
  if (!state || typeof state !== 'object') return null
  const entry = (state as Record<string, unknown>)[stateKey]
  if (!entry || typeof entry !== 'object') return null
  const value = entry as Partial<Entry>
  return Number.isInteger(value.index) && typeof value.key === 'string'
    ? { index: value.index as number, key: value.key } : null
}

function newKey() { return window.crypto.randomUUID() }
function historyState(entry: Entry) {
  const previous = window.history.state
  return { ...(previous && typeof previous === 'object' ? previous : {}), [stateKey]: entry }
}
function readLocation(entry: Entry): AppLocation {
  return { ...entry, pathname: window.location.pathname, search: window.location.search, hash: window.location.hash, href: window.location.pathname + window.location.search + window.location.hash }
}

const initialEntry = entryFromState(window.history.state) ?? { index: 0, key: newKey() }
window.history.replaceState(historyState(initialEntry), '', window.location.href)
let location = readLocation(initialEntry)

function publish(next: AppLocation) {
  location = next
  listeners.forEach((listener) => listener())
}
function mayLeave() {
  const messages = [...guards.values()]
  return messages.length === 0 || window.confirm(messages[messages.length - 1])
}

window.addEventListener('popstate', () => {
  const target = entryFromState(window.history.state)
  if (restoring) {
    // An earlier blocked Back/Forward is being undone. Keep the mounted page.
    if (target?.key === restoring.key) restoring = null
    return
  }
  if (!mayLeave()) {
    if (target && target.index !== location.index) {
      restoring = { index: location.index, key: location.key }
      window.history.go(location.index - target.index)
    } else {
      // Handle same-document entries created outside this router (for example hashes).
      window.history.pushState(historyState(location), '', location.href)
    }
    return
  }
  const entry = target ?? { index: location.index + 1, key: newKey() }
  if (!target) window.history.replaceState(historyState(entry), '', window.location.href)
  publish(readLocation(entry))
})

/** Navigate within Nimbus. Successful saved-state transitions can bypass guards. */
export function navigate(path: string, options: NavigateOptions = {}): boolean {
  const url = new URL(path, window.location.origin)
  if (url.origin !== window.location.origin) throw new Error('Nimbus navigation must stay on this site.')
  const href = url.pathname + url.search + url.hash
  if (href === location.href) return true
  if (restoring) return false
  if (!options.bypassGuard && !mayLeave()) return false
  const entry = options.replace
    ? { index: location.index, key: location.key }
    : { index: location.index + 1, key: newKey() }
  if (options.replace) window.history.replaceState(historyState(entry), '', href)
  else window.history.pushState(historyState(entry), '', href)
  publish(readLocation(entry))
  return true
}

export function getLocation() { return location }
export function useAppLocation() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    getLocation,
  )
}

/** Guards in-app navigation and Back/Forward. Pages retain their beforeunload guard. */
export function useNavigationGuard(enabled: boolean, message: string) {
  const id = useRef(Symbol('navigation-guard'))
  useLayoutEffect(() => {
    const key = id.current
    if (enabled) guards.set(key, message)
    else guards.delete(key)
    return () => { guards.delete(key) }
  }, [enabled, message])
}

export type AppRoute =
  | { kind: 'index' }
  | { kind: 'login' }
  | { kind: 'aircraft' }
  | { kind: 'notFound' }
  | { kind: 'board'; registration: string }
  | { kind: 'inspection'; registration: string; itemId: string | null }
  | { kind: 'prepare'; registration: string }
  | { kind: 'handoff'; registration: string; handoffId: string }

function decodePart(part: string): string | null {
  try { return decodeURIComponent(part) } catch { return null }
}

export function parseRoute(pathname: string): AppRoute {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return { kind: 'index' }
  if (path === '/login') return { kind: 'login' }
  if (path === '/aircraft') return { kind: 'aircraft' }
  const parts = path.split('/').slice(1)
  if (parts[0] !== 'aircraft' || !parts[1]) return { kind: 'notFound' }
  const registration = decodePart(parts[1])
  if (!registration || !/^[A-Z0-9-]{1,20}$/.test(registration)) return { kind: 'notFound' }
  if (parts.length === 2) return { kind: 'board', registration }
  if (parts.length !== 4) return { kind: 'notFound' }
  const id = decodePart(parts[3])
  if (!id || !/^[a-zA-Z0-9-]{1,100}$/.test(id)) return { kind: 'notFound' }
  if (parts[2] === 'inspection') return { kind: 'inspection', registration, itemId: id === 'new' ? null : id }
  if (parts[2] === 'handoff') return id === 'prepare'
    ? { kind: 'prepare', registration } : { kind: 'handoff', registration, handoffId: id }
  return { kind: 'notFound' }
}

export const paths = {
  aircraft: '/aircraft',
  board: (registration: string) => `/aircraft/${encodeURIComponent(registration)}`,
  inspection: (registration: string, id: string | null) => `/aircraft/${encodeURIComponent(registration)}/inspection/${id ? encodeURIComponent(id) : 'new'}`,
  prepare: (registration: string) => `/aircraft/${encodeURIComponent(registration)}/handoff/prepare`,
  handoff: (registration: string, id: string) => `/aircraft/${encodeURIComponent(registration)}/handoff/${encodeURIComponent(id)}`,
}

export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return paths.aircraft
  const url = new URL(value, window.location.origin)
  const route = parseRoute(url.pathname)
  if (url.origin !== window.location.origin || route.kind === 'login' || route.kind === 'index' || route.kind === 'notFound') return paths.aircraft
  return url.pathname
}

export function loginPath(returnTo?: string) {
  return returnTo && parseRoute(returnTo.split('?')[0]).kind !== 'login'
    ? `/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}` : '/login'
}
