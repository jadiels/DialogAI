import type { Theme } from './types'

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Resolve 'auto' to the concrete scheme from the OS preference. */
export function resolveTheme(theme: Theme): 'dark' | 'light' | 'nebula' {
  if (theme === 'auto') return media().matches ? 'dark' : 'light'
  return theme
}

/** Apply a theme by toggling the html class + color-scheme. */
export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.classList.toggle('light', resolved === 'light')
  // Nebula is a dark-based accent theme: it keeps the dark color-scheme for
  // native controls but swaps the palette tokens via its own html class.
  root.classList.toggle('nebula', resolved === 'nebula')
  root.style.colorScheme = resolved === 'light' ? 'light' : 'dark'
}

/** While on 'auto', re-apply when the OS preference changes. Returns cleanup. */
export function watchSystemTheme(theme: Theme, onChange: () => void): () => void {
  if (theme !== 'auto') return () => {}
  const m = media()
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}
