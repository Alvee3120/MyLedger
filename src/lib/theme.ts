import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'myledger.theme'

export type Theme = 'light' | 'dark'

// Theme lives in a module-level store rather than component state: both the
// header toggle and the Settings page read it, and they must never disagree.
let current: Theme =
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'light'

const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function applyTheme(theme: Theme): void {
  current = theme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#020617' : '#f8fafc')

  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Private browsing can block storage; the theme still applies for this session.
  }

  for (const listener of listeners) listener()
}

export function toggleTheme(): void {
  applyTheme(current === 'dark' ? 'light' : 'dark')
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(
    subscribe,
    () => current,
    () => 'dark' as Theme,
  )
  return { theme, toggle: toggleTheme }
}
