import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { createAppTheme } from '@/theme'

type Preference = 'light' | 'dark' | 'system'
const key = 'nimbus.appearance'
const valid = (value: unknown): value is Preference => ['light', 'dark', 'system'].includes(String(value))
const AppearanceContext = createContext<{ preference: Preference; change: (value: Preference) => void }>({ preference: 'system', change: () => {} })
export default function AppearanceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Preference>(() => {
    try { const saved = localStorage.getItem(key); return valid(saved) ? saved : 'system' } catch { return 'system' }
  })
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setSystemDark(media.matches)
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) setPreference(valid(event.newValue) ? event.newValue : 'system') }
    media.addEventListener('change', sync); window.addEventListener('storage', storage)
    sync()
    return () => { media.removeEventListener('change', sync); window.removeEventListener('storage', storage) }
  }, [])
  const mode = preference === 'system' ? systemDark ? 'dark' : 'light' : preference
  useLayoutEffect(() => { document.documentElement.dataset.theme = mode }, [mode])
  const theme = useMemo(() => createAppTheme(mode), [mode])
  const change = (value: Preference) => { setPreference(value); try { localStorage.setItem(key, value) } catch { /* Keep the preference for this visit. */ } }
  return <AppearanceContext.Provider value={{ preference, change }}><ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider></AppearanceContext.Provider>
}
export function AppearanceControl() {
  const { preference, change } = useContext(AppearanceContext)
  return <label className="themeControl"><span>Theme</span><select value={preference} onChange={(event) => { if (valid(event.target.value)) change(event.target.value) }} aria-label="Color theme"><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>
}
