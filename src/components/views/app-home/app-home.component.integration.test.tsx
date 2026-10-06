import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRouter } from '../../../../test/support/render'
import { createAppTestRouter } from '../../../../test/support/router'
import { AppError } from '#/lib/errors'

const boundaries = vi.hoisted(() => ({
  assignBrowserLocation: vi.fn(),
  availableDatasets: vi.fn(),
  cardGroups: vi.fn(),
  dataset: vi.fn(),
  getWorkspaceAppDatasetId: vi.fn(),
  reauthorize: vi.fn(),
  studyData: vi.fn(),
  viewer: vi.fn(),
}))

vi.mock('@paper-design/shaders-react', () => ({
  MeshGradient: () => <div data-testid="connection-background" />,
}))

vi.mock('@tanstack/react-devtools', () => ({
  TanStackDevtools: () => null,
}))

vi.mock('@tanstack/react-router-devtools', () => ({
  TanStackRouterDevtoolsPanel: () => null,
}))

vi.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtoolsPanel: () => null,
}))

vi.mock('#/lib/browser-navigation', () => ({
  assignBrowserLocation: boundaries.assignBrowserLocation,
}))

vi.mock('#/integrations/kv/workspace-registry-functions', () => ({
  getWorkspaceAppDatasetId: boundaries.getWorkspaceAppDatasetId,
  setWorkspaceAppDatasetId: vi.fn(),
}))

vi.mock('#/integrations/notion/auth-functions', () => ({
  disconnectNotion: vi.fn(),
  getAvailableDatasets: boundaries.availableDatasets,
  getNotionViewer: boundaries.viewer,
  reauthorizeNotion: boundaries.reauthorize,
}))

vi.mock('#/integrations/notion/card-functions', () => ({
  deleteCardGroup: vi.fn(),
  getCardGroupConfig: vi.fn(),
  getCardGroups: boundaries.cardGroups,
  getCardGroupStudyData: boundaries.studyData,
}))

vi.mock('#/integrations/notion/dataset-functions', () => ({
  completeDatasetConnection: vi.fn(),
  getNotionDataset: boundaries.dataset,
  getNotionDatasetItems: vi.fn(),
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

const groupedDeck = deck('grouped-deck', 'connected-later', 'Topic')
const singleDeck = deck('single-deck', 'single-source', null)

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
  boundaries.viewer.mockResolvedValue(viewer)
  boundaries.getWorkspaceAppDatasetId.mockResolvedValue(null)
  boundaries.availableDatasets.mockResolvedValue({
    datasets: [],
    nextCursor: null,
  })
  boundaries.cardGroups.mockResolvedValue([])
  boundaries.dataset.mockResolvedValue({
    ...dataset('available-source', 'Available source'),
    icon: null,
    properties: {},
  })
  boundaries.studyData.mockResolvedValue(createStudyData())
  boundaries.reauthorize.mockResolvedValue({
    authorizationUrl: 'https://notion.example/authorize?state=safe',
  })
})

describe('app home dataset discovery', () => {
  it('renders explicit empty states for both collections', async () => {
    await loadAndRender()

    expect(screen.getByText(/no decks yet/i)).toBeTruthy()
    expect(screen.getByText(/no authorized datasets available/i)).toBeTruthy()
  })

  it('loads every page from the keyboard-accessible fallback and keeps only visible unique datasets', async () => {
    boundaries.getWorkspaceAppDatasetId.mockResolvedValue('registry-a')
    boundaries.cardGroups.mockResolvedValue([groupedDeck])
    boundaries.availableDatasets.mockImplementation(
      async ({ data }: { data: { cursor: string | null } }) =>
        data.cursor === null
          ? {
              datasets: [
                dataset('first', 'First dataset', 'First description'),
                dataset('duplicate', 'First duplicate'),
              ],
              nextCursor: 'cursor-2',
            }
          : {
              datasets: [
                dataset('connected-later', 'Connected later'),
                dataset('duplicate', 'Later duplicate'),
                dataset('untitled', 'Untitled'),
                dataset('second', 'Second dataset'),
              ],
              nextCursor: null,
            },
    )

    const { user } = await loadAndRender()

    expect(screen.getByText('First dataset')).toBeTruthy()
    expect(screen.getByText('First description')).toBeTruthy()
    expect(screen.getByText('First duplicate')).toBeTruthy()

    const loadMore = screen.getByRole('button', { name: 'Load more' })
    loadMore.focus()
    await user.keyboard('{Enter}')

    expect(await screen.findByText('Second dataset')).toBeTruthy()
    expect(screen.getByText('Untitled')).toBeTruthy()
    expect(screen.queryByText('Connected later')).toBeNull()
    expect(screen.queryByText('Later duplicate')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
    expect(
      boundaries.availableDatasets.mock.calls.map(([input]) => input),
    ).toEqual([
      { data: { excludedDatasetId: 'registry-a', cursor: null } },
      {
        data: {
          excludedDatasetId: 'registry-a',
          cursor: 'cursor-2',
        },
      },
    ])
  })

  it('loads from the intersection sentinel without duplicating a pending request', async () => {
    const observer = installIntersectionObserver()
    const nextPage = deferred<{
      datasets: ReturnType<typeof dataset>[]
      nextCursor: null
    }>()
    boundaries.availableDatasets.mockImplementation(
      ({ data }: { data: { cursor: string | null } }) =>
        data.cursor === null
          ? Promise.resolve({
              datasets: [dataset('first', 'First dataset')],
              nextCursor: 'cursor-2',
            })
          : nextPage.promise,
    )

    const { user } = await loadAndRender()

    observer.intersect()
    await waitFor(() => {
      const loadingButton = screen.getByRole('button', { name: 'Loading…' })
      if (!(loadingButton instanceof HTMLButtonElement)) {
        throw new Error('The loading control is not a button')
      }
      expect(loadingButton.disabled).toBe(true)
    })
    await user.click(screen.getByRole('button', { name: 'Loading…' }))
    observer.intersect()
    expect(boundaries.availableDatasets).toHaveBeenCalledTimes(2)

    nextPage.resolve({
      datasets: [dataset('second', 'Second dataset')],
      nextCursor: null,
    })
    expect(await screen.findByText('Second dataset')).toBeTruthy()
    expect(boundaries.availableDatasets).toHaveBeenCalledTimes(2)
  })

  it('preserves loaded rows after a later-page failure and retries the same cursor safely', async () => {
    boundaries.availableDatasets.mockImplementation(
      async ({ data }: { data: { cursor: string | null } }) => {
        if (data.cursor === null) {
          return {
            datasets: [dataset('first', 'First dataset')],
            nextCursor: 'cursor-2',
          }
        }
        if (boundaries.availableDatasets.mock.calls.length === 2) {
          throw new Error('SENTINEL raw provider response')
        }
        return {
          datasets: [dataset('recovered', 'Recovered dataset')],
          nextCursor: null,
        }
      },
    )

    const { user } = await loadAndRender()
    await user.click(screen.getByRole('button', { name: 'Load more' }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/something went wrong/i)
    expect(alert.textContent).not.toContain('SENTINEL')
    expect(screen.getByText('First dataset')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Recovered dataset')).toBeTruthy()
    expect(
      boundaries.availableDatasets.mock.calls.map(
        ([input]) => input.data.cursor,
      ),
    ).toEqual([null, 'cursor-2', 'cursor-2'])
  })

  it('does not let a visible sentinel automatically retry a failed page', async () => {
    const observer = installIntersectionObserver({
      intersectOnReobserve: true,
    })
    const unexpectedRetry = deferred<{
      datasets: ReturnType<typeof dataset>[]
      nextCursor: null
    }>()
    boundaries.availableDatasets.mockImplementation(
      ({ data }: { data: { cursor: string | null } }) => {
        if (data.cursor === null) {
          return Promise.resolve({
            datasets: [dataset('first', 'First dataset')],
            nextCursor: 'cursor-2',
          })
        }
        if (boundaries.availableDatasets.mock.calls.length === 2) {
          return Promise.reject(new Error('later page failed'))
        }
        return unexpectedRetry.promise
      },
    )

    const { user } = await loadAndRender()
    await user.click(screen.getByRole('button', { name: 'Load more' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('First dataset')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    observer.intersect()
    expect(boundaries.availableDatasets).toHaveBeenCalledTimes(2)
  })
})

describe('app home actions and links', () => {
  it('exposes the intended grouped, single, and connection destinations', async () => {
    boundaries.getWorkspaceAppDatasetId.mockResolvedValue('registry-a')
    boundaries.cardGroups.mockResolvedValue([groupedDeck, singleDeck])
    boundaries.availableDatasets.mockResolvedValue({
      datasets: [
        {
          ...dataset('available-source', 'Available source'),
          iconUrl: 'https://images.example/dataset.png',
        },
      ],
      nextCursor: null,
    })

    await loadAndRender()

    expect(
      screen.getByRole('link', { name: /grouped-deck/i }).getAttribute('href'),
    ).toBe('/app/grouped-deck/groups')
    expect(
      screen.getByRole('link', { name: /single-deck/i }).getAttribute('href'),
    ).toBe('/app/single-deck/study')
    expect(
      screen
        .getByRole('link', { name: /available source/i })
        .getAttribute('href'),
    ).toBe('/app/available-source/connect')
    const datasetImage = document.querySelector<HTMLImageElement>(
      'img[src="https://images.example/dataset.png"]',
    )
    if (!datasetImage) throw new Error('The dataset image was not rendered')
    expect(datasetImage.alt).toBe('')
  })

  it('assigns the returned reauthorization URL and disables duplicate actions while pending', async () => {
    const authorization = deferred<{ authorizationUrl: string }>()
    boundaries.reauthorize.mockReturnValue(authorization.promise)
    const { user } = await loadAndRender()

    const button = screen.getByRole('button', {
      name: /authorize more datasets/i,
    })
    await user.click(button)
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await user.click(button)
    expect(boundaries.reauthorize).toHaveBeenCalledOnce()

    authorization.resolve({ authorizationUrl: 'https://safe.example/next' })
    await waitFor(() =>
      expect(boundaries.assignBrowserLocation).toHaveBeenCalledWith(
        'https://safe.example/next',
      ),
    )
  })

  it('renders a safe reauthorization alert and permits retry', async () => {
    boundaries.reauthorize.mockRejectedValueOnce(
      new AppError('temporarily_unavailable', {
        cause: new Error('SENTINEL provider body'),
      }),
    )
    const { user } = await loadAndRender()

    await user.click(
      screen.getByRole('button', { name: /authorize more datasets/i }),
    )
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/temporarily unavailable/i)
    expect(alert.textContent).not.toContain('SENTINEL')

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() =>
      expect(boundaries.assignBrowserLocation).toHaveBeenCalledWith(
        'https://notion.example/authorize?state=safe',
      ),
    )
    expect(boundaries.reauthorize).toHaveBeenCalledTimes(2)
  })
})

async function loadAndRender() {
  const result = createAppTestRouter('/app')
  await result.router.load()
  return { ...result, ...renderRouter(result.router) }
}

function dataset(id: string, title: string, description?: string) {
  return {
    id,
    title,
    description,
    icon: null,
    iconUrl: null,
    coverUrl: null,
  }
}

function deck(
  id: string,
  dataSetId: string,
  groupingColumnName: string | null,
) {
  return {
    id,
    dataSetId,
    datasetTitle: id,
    datasetIconUrl: null,
    groupingColumnName,
    groupingColumnId: groupingColumnName ? 'grouping-id' : null,
    groupKeys: [],
    frontColumnIds: ['front'],
    backColumnIds: ['back'],
  }
}

function createStudyData() {
  return {
    deckConfig: {},
    groupKeys: [],
    categoryStats: {
      overall: { total: 0, visited: 0, completed: 0 },
      byCategory: {},
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

function installIntersectionObserver({
  intersectOnReobserve = false,
}: {
  intersectOnReobserve?: boolean
} = {}) {
  let callback: IntersectionObserverCallback | undefined
  let observationCount = 0
  const intersect = () => {
    if (!callback) throw new Error('The load-more sentinel was not observed')
    callback(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  }
  const observe = vi.fn(() => {
    observationCount += 1
    if (intersectOnReobserve && observationCount > 1) intersect()
  })
  const disconnect = vi.fn()

  class TestIntersectionObserver {
    readonly root = null
    readonly rootMargin = '0px'
    readonly thresholds = [0]

    constructor(nextCallback: IntersectionObserverCallback) {
      callback = nextCallback
    }

    observe = observe
    unobserve = vi.fn()
    disconnect = disconnect
    takeRecords = () => []
  }

  vi.stubGlobal('IntersectionObserver', TestIntersectionObserver)

  return {
    intersect,
  }
}
