import {
  QueryClientProvider,
  QueryErrorResetBoundary,
} from '@tanstack/react-query'
import type { useQueryErrorResetBoundary } from '@tanstack/react-query'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NotionRouteErrorScreen from './notion-route-error-screen'
import { createTestQueryClient } from '../../../test/support/query-client'
import { AppError } from '#/lib/errors'

type QueryErrorResetBoundaryValue = ReturnType<
  typeof useQueryErrorResetBoundary
>

const boundaries = vi.hoisted(() => ({
  assignBrowserLocation: vi.fn(),
  reauthorize: vi.fn(),
  routeLoader: vi.fn(),
}))

vi.mock('#/lib/browser-navigation', () => ({
  assignBrowserLocation: boundaries.assignBrowserLocation,
}))

vi.mock('#/integrations/notion/auth-functions', () => ({
  disconnectNotion: vi.fn(),
  getAvailableDatasets: vi.fn(),
  getNotionViewer: vi.fn(),
  reauthorizeNotion: boundaries.reauthorize,
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

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  boundaries.routeLoader.mockResolvedValue(null)
  boundaries.reauthorize.mockResolvedValue({
    authorizationUrl: 'https://notion.example/authorize',
  })
})

describe('Notion route error recovery', () => {
  it('resets the query boundary and invalidates the route for a retryable error', async () => {
    const { boundary, user } = await renderErrorScreen(
      new AppError('rate_limited'),
    )

    await waitFor(() => expect(boundary().isReset()).toBe(true))
    expect(screen.getByRole('alert').textContent).toMatch(/too many requests/i)
    expect(
      screen.queryByRole('button', { name: /reconnect notion/i }),
    ).toBeNull()

    const initialLoads = boundaries.routeLoader.mock.calls.length
    await user.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() =>
      expect(boundaries.routeLoader).toHaveBeenCalledTimes(initialLoads + 1),
    )
  })

  it('uses reconnect for authentication errors, disables duplicate requests, and assigns the returned URL', async () => {
    const authorization = deferred<{ authorizationUrl: string }>()
    boundaries.reauthorize.mockReturnValue(authorization.promise)
    const { user } = await renderErrorScreen(new AppError('reauth_required'))

    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
    const reconnect = screen.getByRole('button', {
      name: /reconnect notion/i,
    })
    await user.click(reconnect)
    expect((reconnect as HTMLButtonElement).disabled).toBe(true)
    await user.click(reconnect)
    expect(boundaries.reauthorize).toHaveBeenCalledOnce()

    authorization.resolve({ authorizationUrl: 'https://safe.example/next' })
    await waitFor(() =>
      expect(boundaries.assignBrowserLocation).toHaveBeenCalledWith(
        'https://safe.example/next',
      ),
    )
  })

  it('keeps reconnect available after a safe authorization failure', async () => {
    boundaries.reauthorize.mockRejectedValueOnce(
      new AppError('temporarily_unavailable', {
        cause: new Error('SENTINEL provider response'),
      }),
    )
    const { user } = await renderErrorScreen(new AppError('unauthenticated'))

    await user.click(screen.getByRole('button', { name: /reconnect notion/i }))

    const alert = screen.getByRole('alert')
    await waitFor(() =>
      expect(alert.textContent).toMatch(/temporarily unavailable/i),
    )
    expect(alert.textContent).not.toContain('SENTINEL')
    expect(
      screen.getByRole('button', { name: /reconnect notion/i }),
    ).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /reconnect notion/i }))
    await waitFor(() =>
      expect(boundaries.assignBrowserLocation).toHaveBeenCalledWith(
        'https://notion.example/authorize',
      ),
    )
    expect(boundaries.reauthorize).toHaveBeenCalledTimes(2)
  })

  it('renders no recovery action for a non-retryable error', async () => {
    await renderErrorScreen(new AppError('validation'))

    expect(screen.getByRole('alert').textContent).toMatch(
      /request was invalid/i,
    )
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /reconnect notion/i }),
    ).toBeNull()
  })
})

async function renderErrorScreen(error: unknown) {
  const queryClient = createTestQueryClient()
  let boundaryValue: QueryErrorResetBoundaryValue | undefined
  const rootRoute = createRootRoute({
    loader: boundaries.routeLoader,
    component: () => (
      <QueryErrorResetBoundary>
        {(value) => {
          boundaryValue = value
          return <NotionRouteErrorScreen error={error} title="Could not load" />
        }}
      </QueryErrorResetBoundary>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  const user = userEvent.setup()

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await screen.findByRole('alert')

  return {
    boundary: () => {
      if (!boundaryValue) throw new Error('Query error boundary did not render')
      return boundaryValue
    },
    user,
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}
