export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'nokaddo-theme'

export const themeInitializationScript = `
  (() => {
    let theme

    try {
      theme = localStorage.getItem('${THEME_STORAGE_KEY}')
    } catch {}

    if (theme !== 'light' && theme !== 'dark') {
      theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }

    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.dataset.theme = theme
    root.style.colorScheme = theme
  })()
`

function applyTheme(theme: Theme) {
  const root = document.documentElement

  root.classList.toggle('dark', theme === 'dark')
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

export function toggleTheme() {
  const theme: Theme = document.documentElement.classList.contains('dark')
    ? 'light'
    : 'dark'

  applyTheme(theme)

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // The selected theme still applies for this page if storage is unavailable.
  }
}
