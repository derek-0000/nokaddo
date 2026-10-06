import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_STORAGE_KEY,
  themeInitializationScript,
  toggleTheme,
} from './theme'
import type { Theme } from './theme'
import ThemeToggle from '#/components/ui/theme-toggle'

const executeInitializationScript = () => {
  Function(themeInitializationScript)()
}

const expectRootTheme = (theme: Theme) => {
  const root = document.documentElement

  expect(root.classList.contains('dark')).toBe(theme === 'dark')
  expect(root.dataset.theme).toBe(theme)
  expect(root.style.colorScheme).toBe(theme)
}

describe('theme initialization', () => {
  beforeEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
  })

  it.each(['light', 'dark'] as const)('uses the stored %s theme', (theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: theme !== 'dark' })),
    )

    executeInitializationScript()

    expectRootTheme(theme)
  })

  it.each([
    { matches: true, expected: 'dark' },
    { matches: false, expected: 'light' },
  ] as const)(
    'uses system preference when storage is invalid (dark match: $matches)',
    ({ matches, expected }) => {
      localStorage.setItem(THEME_STORAGE_KEY, 'invalid')
      const matchMedia = vi.fn(() => ({ matches }))
      vi.stubGlobal('matchMedia', matchMedia)

      executeInitializationScript()

      expectRootTheme(expected)
      expect(matchMedia).toHaveBeenCalledOnce()
      expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
    },
  )

  it('defaults to light when no stored or system preference is available', () => {
    vi.stubGlobal('matchMedia', undefined)

    executeInitializationScript()

    expectRootTheme('light')
  })

  it('tolerates a storage read failure and uses system preference', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    )

    expect(executeInitializationScript).not.toThrow()
    expectRootTheme('dark')
  })
})

describe('theme toggle', () => {
  beforeEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
  })

  it.each([
    { startsDark: false, expected: 'dark' },
    { startsDark: true, expected: 'light' },
  ] as const)(
    'switches from the current root class (dark: $startsDark)',
    ({ startsDark, expected }) => {
      document.documentElement.classList.toggle('dark', startsDark)

      toggleTheme()

      expectRootTheme(expected)
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(expected)
    },
  )

  it('applies the next theme when the storage write fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage unavailable')
    })

    expect(toggleTheme).not.toThrow()
    expectRootTheme('dark')
  })

  it('reads the root theme before paint and publishes toggle changes', async () => {
    document.documentElement.classList.add('dark')
    const user = userEvent.setup()

    render(createElement(ThemeToggle))
    const toggle = screen.getByRole('button', {
      name: 'Switch to light mode',
    })

    await user.click(toggle)

    expectRootTheme('light')
    expect(
      screen.getByRole('button', { name: 'Switch to dark mode' }),
    ).toBeTruthy()
  })
})
