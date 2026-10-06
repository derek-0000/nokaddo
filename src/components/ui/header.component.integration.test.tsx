import { QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Header from './header'
import ThemeToggle from './theme-toggle'
import { createTestQueryClient } from '../../../test/support/query-client'
import { workspaceRegistryKeys } from '#/integrations/kv/api'
import { notionKeys } from '#/integrations/notion/api'
import { AppError } from '#/lib/errors'

const boundaries = vi.hoisted(() => ({
  disconnect: vi.fn(),
  viewer: vi.fn(),
}))

vi.mock('#/integrations/notion/auth-functions', () => ({
  disconnectNotion: boundaries.disconnect,
  getAvailableDatasets: vi.fn(),
  getNotionViewer: boundaries.viewer,
  reauthorizeNotion: vi.fn(),
}))

vi.mock('#/integrations/notion/card-functions', () => ({
  deleteCardGroup: vi.fn(),
  getCardGroupConfig: vi.fn(),
  getCardGroups: vi.fn(),
  getCardGroupStudyData: vi.fn(),
}))

vi.mock('#/integrations/notion/dataset-functions', () => ({
  completeDatasetConnection: vi.fn(),
  getNotionDataset: vi.fn(),
  getNotionDatasetItems: vi.fn(),
}))

vi.mock('#/integrations/kv/workspace-registry-functions', () => ({
  getWorkspaceAppDatasetId: vi.fn(),
  setWorkspaceAppDatasetId: vi.fn(),
}))

const viewer = {
  workspaceId: 'workspace-a',
  workspaceName: 'Workspace',
  workspaceIcon: null,
  user: {
    id: 'user-a',
    name: 'Ada',
    email: 'ada@example.test',
    avatarUrl: null,
  },
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  document.documentElement.classList.remove('dark')
  document.documentElement.dataset.theme = 'light'
  document.documentElement.style.colorScheme = 'light'
  boundaries.viewer.mockResolvedValue(viewer)
  boundaries.disconnect.mockResolvedValue(undefined)
})

describe('authenticated header controls', () => {
  it('uses the light theme action for the server snapshot', () => {
    expect(renderToString(<ThemeToggle />)).toContain('Switch to dark mode')
  })

  it('reflects an initially dark theme in the available action name', async () => {
    document.documentElement.classList.add('dark')

    await renderHeader()

    expect(
      screen.getByRole('button', { name: 'Switch to light mode' }),
    ).toBeTruthy()
  })

  it('updates the theme action name and opens and dismisses the named user popover from the keyboard', async () => {
    const { user } = await renderHeader()
    const themeToggle = screen.getByRole('button', {
      name: 'Switch to dark mode',
    })

    themeToggle.focus()
    await user.keyboard('{Enter}')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Switch to light mode' }),
    ).toBeTruthy()

    const menuTrigger = screen.getByRole('button', { name: 'User menu' })
    menuTrigger.focus()
    await user.keyboard('{Enter}')

    expect(menuTrigger.getAttribute('aria-expanded')).toBe('true')
    expect(
      await screen.findByRole('dialog', { name: 'User actions' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(
      screen.getByText('Privacy Policy').closest('a')?.getAttribute('href'),
    ).toBe('/privacy')
    expect(
      screen.getByText('Terms of Use').closest('a')?.getAttribute('href'),
    ).toBe('/terms')

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'User actions' })).toBeNull(),
    )
    expect(menuTrigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(menuTrigger)
  })

  it('disables duplicate disconnect actions while pending', async () => {
    const pendingDisconnect = deferred<void>()
    boundaries.disconnect.mockReturnValue(pendingDisconnect.promise)
    const { user } = await renderHeader()

    await user.click(screen.getByRole('button', { name: 'User menu' }))
    const disconnect = screen.getByRole('button', { name: 'Sign out' })
    await user.click(disconnect)

    expect((disconnect as HTMLButtonElement).disabled).toBe(true)
    await user.click(disconnect)
    expect(boundaries.disconnect).toHaveBeenCalledOnce()

    pendingDisconnect.resolve()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull(),
    )
  })

  it('preserves the viewer, Notion cache, and current location after a safe disconnect failure', async () => {
    boundaries.disconnect.mockRejectedValue(
      new AppError('disconnect_failed', {
        cause: new Error('SENTINEL revocation response'),
      }),
    )
    const { queryClient, router, user } = await renderHeader()
    queryClient.setQueryData(notionKeys.dataset('kept-dataset'), {
      id: 'kept-dataset',
    })
    queryClient.setQueryData(
      workspaceRegistryKeys.appDatasetId('workspace-a'),
      'kept-app-dataset',
    )

    await user.click(screen.getByRole('button', { name: 'User menu' }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/could not disconnect notion/i)
    expect(alert.textContent).not.toContain('SENTINEL')
    expect(router.state.location.pathname).toBe('/app')
    expect(queryClient.getQueryData(notionKeys.viewer)).toEqual(viewer)
    expect(
      queryClient.getQueryData(notionKeys.dataset('kept-dataset')),
    ).toEqual({ id: 'kept-dataset' })
    expect(
      queryClient.getQueryData(
        workspaceRegistryKeys.appDatasetId('workspace-a'),
      ),
    ).toBe('kept-app-dataset')
  })

  it('clears every Notion cache, restores viewer null, preserves unrelated data, and navigates home after success', async () => {
    const { queryClient, router, user } = await renderHeader()
    queryClient.setQueryData(notionKeys.dataset('removed-dataset'), {
      id: 'removed-dataset',
    })
    queryClient.setQueryData(notionKeys.cardGroups('registry-a'), [
      { id: 'removed-deck' },
    ])
    queryClient.setQueryData(
      workspaceRegistryKeys.appDatasetId('workspace-a'),
      'removed-app-dataset',
    )
    queryClient.setQueryData(['unrelated'], { keep: true })

    await user.click(screen.getByRole('button', { name: 'User menu' }))
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(queryClient.getQueriesData({ queryKey: notionKeys.all })).toEqual([
      [notionKeys.viewer, null],
    ])
    expect(
      queryClient.getQueriesData({ queryKey: workspaceRegistryKeys.all }),
    ).toEqual([])
    expect(queryClient.getQueryData(['unrelated'])).toEqual({ keep: true })
    expect(boundaries.disconnect).toHaveBeenCalledOnce()
  })
})

async function renderHeader() {
  const queryClient = createTestQueryClient()
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: Header,
  })
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <p>Signed out</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([appRoute, homeRoute]),
    history: createMemoryHistory({ initialEntries: ['/app'] }),
  })
  await router.load()
  const user = userEvent.setup()

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await waitFor(() =>
    expect(queryClient.getQueryData(notionKeys.viewer)).toEqual(viewer),
  )

  return { queryClient, router, user }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}
