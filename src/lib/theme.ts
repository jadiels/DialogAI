import type { Theme } from './types'

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Resolve 'auto' to the concrete scheme from the OS preference. */
export function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'auto') return media().matches ? 'dark' : 'light'
  return theme
}

/** Apply a theme by toggling the html class + color-scheme. */
export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.classList.toggle('light', resolved === 'light')
  root.style.colorScheme = resolved
}

/** While on 'auto', re-apply when the OS preference changes. Returns cleanup. */
export function watchSystemTheme(theme: Theme, onChange: () => void): () => void {
  if (theme !== 'auto') return () => {}
  const m = media()
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}
