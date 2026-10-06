import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from './button'
import { toggleTheme } from '#/lib/theme'
import type { Theme } from '#/lib/theme'

const THEME_CHANGE_EVENT = 'nokaddo-theme-change'

function getThemeSnapshot(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function getServerThemeSnapshot(): Theme {
  return 'light'
}

function subscribeToThemeChange(onStoreChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange)

  return () => window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange)
}

function handleToggle() {
  toggleTheme()
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT))
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeToThemeChange,
    getThemeSnapshot,
    getServerThemeSnapshot,
  )

  const availableTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={handleToggle}
      aria-label={`Switch to ${availableTheme} mode`}
      title={`Switch to ${availableTheme} mode`}
    >
      <Moon aria-hidden="true" className="dark:hidden" />
      <Sun aria-hidden="true" className="hidden dark:block" />
    </Button>
  )
}
