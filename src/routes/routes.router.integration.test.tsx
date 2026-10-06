import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { QueryClient } from '@tanstack/react-query'
import { isRedirect } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderRouter } from '../../test/support/render'
import { createAppTestRouter } from '../../test/support/router'
import {
  createQueryFingerprint,
  createStudyQuery,
} from '#/features/study/query'
import {
  getStudyCardPosition,
  setStudyCardPosition,
} from '#/integrations/indexDB/handlers'
import type { StudyCardPosition } from '#/integrations/indexDB/handlers'
import { workspaceRegistryKeys } from '#/integrations/kv/api'
import { notionKeys } from '#/integrations/notion/api'
import { AppError } from '#/lib/errors'
import { createTestQueryClient } from '../../test/support/query-client'

const boundaries = vi.hoisted(() => ({
  beginAuthorization: vi.fn(),
  cardGroups: vi.fn(),
  completeAuthorization: vi.fn(),
  completeConnection: vi.fn(),
  dataset: vi.fn(),
  datasetItems: vi.fn(),
  deleteCardGroup: vi.fn(),
  disconnect: vi.fn(),
  availableDatasets: vi.fn(),
  getWorkspaceAppDatasetId: vi.fn(),
  reauthorize: vi.fn(),
  studyData: vi.fn(),
  studyWindow: vi.fn(),
  saveProgress: vi.fn(),
  viewer: vi.fn(),
  failStudyPositionWrites: false,
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

vi.mock('#/integrations/kv/workspace-registry-functions', () => ({
  getWorkspaceAppDatasetId: boundaries.getWorkspaceAppDatasetId,
  setWorkspaceAppDatasetId: vi.fn(),
}))

vi.mock('#/integrations/notion/auth-functions', () => ({
  disconnectNotion: boundaries.disconnect,
  getAvailableDatasets: boundaries.availableDatasets,
  getNotionViewer: boundaries.viewer,
  reauthorizeNotion: boundaries.reauthorize,
}))

vi.mock('#/integrations/notion/card-functions', () => ({
  deleteCardGroup: boundaries.deleteCardGroup,
  getCardGroupConfig: vi.fn(),
  getCardGroups: boundaries.cardGroups,
  getCardGroupStudyData: boundaries.studyData,
}))

vi.mock('#/integrations/notion/dataset-functions', () => ({
  completeDatasetConnection: boundaries.completeConnection,
  getNotionDataset: boundaries.dataset,
  getNotionDatasetItems: boundaries.datasetItems,
}))

vi.mock('#/integrations/notion/study-functions', () => ({
  saveStudyProgress: boundaries.saveProgress,
}))

vi.mock('#/integrations/notion/study-source', () => ({
  notionStudySource: {
    fetchWindow: boundaries.studyWindow,
  },
}))

vi.mock('#/integrations/indexDB/handlers', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const writePosition = actual.setStudyCardPosition as (
    workspaceId: string,
    deckId: string,
    queryFingerprint: string,
    position: StudyCardPosition,
  ) => Promise<void>

  return {
    ...actual,
    setStudyCardPosition: (
      workspaceId: string,
      deckId: string,
      queryFingerprint: string,
      position: StudyCardPosition,
    ) => {
      if (boundaries.failStudyPositionWrites) {
        return Promise.reject(new Error('IndexedDB write failed'))
      }

      return writePosition(workspaceId, deckId, queryFingerprint, position)
    },
  }
})

vi.mock('#/integrations/notion/oauth-server', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()

  return {
    ...actual,
    beginNotionAuthorization: boundaries.beginAuthorization,
    completeNotionAuthorization: boundaries.completeAuthorization,
  }
})

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

const datasets = [
  {
    id: 'connected-source',
    title: 'Already connected',
    description: undefined,
    icon: null,
    iconUrl: null,
    coverUrl: null,
  },
  {
    id: 'available-source',
    title: 'Available source',
    description: 'Ready to connect',
    icon: null,
    iconUrl: null,
    coverUrl: null,
  },
]

const cardGroups = [
  {
    id: 'deck-a',
    dataSetId: 'connected-source',
    datasetTitle: 'Languages',
    datasetIconUrl: null,
    groupingColumnName: 'Topic',
    groupingColumnId: 'topic-id',
    groupKeys: ['Grammar', 'Vocabulary'],
    frontColumnIds: ['front'],
    backColumnIds: ['back'],
  },
]

function richTextProperty(type: 'rich_text' | 'title', value: string) {
  return {
    id: type,
    type,
    [type]: value
      ? [
          {
            type: 'text',
            plain_text: value,
            href: null,
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: 'default',
            },
            text: { content: value, link: null },
          },
        ]
      : [],
  }
}

function createStudyData(
  groups = ['Grammar', 'Vocabulary'],
  title = 'Languages',
  storedGroups = groups,
  groupingColumnName = 'Topic',
) {
  return {
    deckConfig: {
      dataset_id: richTextProperty('rich_text', 'connected-source'),
      dataset_title: richTextProperty('rich_text', title),
      dataset_icon: { id: 'icon', type: 'files', files: [] },
      grouper_column: richTextProperty('title', groupingColumnName),
      grouper_column_id: richTextProperty(
        'rich_text',
        groupingColumnName ? 'topic-id' : '',
      ),
      group_keys: richTextProperty('rich_text', JSON.stringify(storedGroups)),
      front: richTextProperty('rich_text', '["front"]'),
      back: richTextProperty('rich_text', '["back"]'),
    },
    groupKeys: groups,
    groupingColumnType: groupingColumnName ? ('select' as const) : null,
    categoryStats: {
      overall: { total: 9, visited: 7, completed: 4 },
      byCategory: {
        Grammar: { total: 5, visited: 4, completed: 3 },
      },
    },
  }
}

async function loadAndRender(initialEntry: string, queryClient?: QueryClient) {
  const result = createAppTestRouter(initialEntry, queryClient)
  await result.router.load()
  return { ...result, ...renderRouter(result.router) }
}

function getRouteGetHandler(route: unknown) {
  const handlers = (
    route as {
      options: { server?: { handlers?: unknown } }
    }
  ).options.server?.handlers

  if (!handlers || typeof handlers !== 'object' || !('GET' in handlers)) {
    throw new Error('Route does not declare a static GET handler')
  }

  return handlers.GET as (context: never) => Promise<unknown>
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: unknown) => void = () => undefined
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn())
  boundaries.viewer.mockResolvedValue(null)
  boundaries.availableDatasets.mockResolvedValue({
    datasets: [],
    nextCursor: null,
  })
  boundaries.cardGroups.mockResolvedValue([])
  boundaries.getWorkspaceAppDatasetId.mockResolvedValue(null)
  boundaries.datasetItems.mockResolvedValue([])
  boundaries.dataset.mockResolvedValue({
    id: 'connected-source',
    properties: {
      Front: { id: 'front', name: 'Front', type: 'title' },
      Back: { id: 'back', name: 'Back', type: 'rich_text' },
      Topic: { id: 'topic-id', name: 'Topic', type: 'select' },
    },
  })
  boundaries.reauthorize.mockResolvedValue({ authorizationUrl: '/authorize' })
  boundaries.disconnect.mockResolvedValue(undefined)
  boundaries.deleteCardGroup.mockResolvedValue(undefined)
  boundaries.completeConnection.mockResolvedValue({ nokaddoDatasetId: 'local' })
  boundaries.saveProgress.mockImplementation(async ({ data }) => ({
    pageId: data.pageId,
    completed: data.action === 'learn',
  }))
  boundaries.studyWindow.mockResolvedValue({
    cards: [
      {
        id: 'card-1',
        front: ['Study prompt'],
        back: ['Study answer'],
        groupKey: 'Grammar',
      },
    ],
    nextCursor: null,
  })
  boundaries.failStudyPositionWrites = false
})

describe('public and authenticated route boundaries', () => {
  it('renders the connection route only for unauthenticated viewers and accepts only public OAuth codes', async () => {
    const connection = await loadAndRender('/?oauthResult=oauth_cancelled')

    expect(screen.getByText(/authorization was cancelled/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /add connection/i })).toBeTruthy()
    connection.unmount()

    for (const [name, pathname] of [
      ['Privacy Policy', '/privacy'],
      ['Terms of Use', '/terms'],
    ]) {
      const page = await loadAndRender('/')
      await page.user.click(screen.getByText(name))
      await waitFor(() =>
        expect(page.router.state.location.pathname).toBe(pathname),
      )
      expect(screen.getByRole('heading', { name })).toBeTruthy()
      page.unmount()
    }

    for (const code of [
      'oauth_cancelled',
      'oauth_state_invalid',
      'oauth_exchange_failed',
      'configuration_error',
    ]) {
      const known = createAppTestRouter(`/?oauthResult=${code}`)
      await known.router.load()
      expect(
        known.router.state.matches.find((match) => match.routeId === '/')
          ?.search,
      ).toEqual({ oauthResult: code })
    }

    const invalid = createAppTestRouter('/?oauthResult=provider-secret')
    await invalid.router.load()
    expect(
      invalid.router.state.matches.find((match) => match.routeId === '/')
        ?.search,
    ).toEqual({ oauthResult: undefined })
  })

  it('redirects authenticated viewers away from public pages', async () => {
    boundaries.viewer.mockResolvedValue(viewer)
    boundaries.getWorkspaceAppDatasetId.mockResolvedValue(null)

    const { router } = await loadAndRender('/')

    expect(router.state.location.pathname).toBe('/app')
    expect(screen.getByText(/no decks yet/i)).toBeTruthy()
  })

  it('redirects unauthenticated viewers home and clears OAuth search state', async () => {
    const { router } = await loadAndRender('/app?oauthResult=oauth_cancelled')

    expect(router.state.location.pathname).toBe('/')
    expect(router.state.location.search).toEqual({ oauthResult: undefined })
  })

  it('permits authenticated viewers to enter nested routes', async () => {
    boundaries.viewer.mockResolvedValue(viewer)
    boundaries.studyData.mockResolvedValue(
      createStudyData([], 'Languages', [], ''),
    )

    const { router } = await loadAndRender('/app/deck-a/study')

    expect(router.state.location.pathname).toBe('/app/deck-a/study')
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy()
    expect(await screen.findByText('Study prompt')).toBeTruthy()
  })
})

describe('app, connect, deck, and study routes', () => {
  beforeEach(() => boundaries.viewer.mockResolvedValue(viewer))

  it('loads registry state by workspace and skips deck retrieval without a registry ID', async () => {
    boundaries.getWorkspaceAppDatasetId.mockResolvedValueOnce(null)
    boundaries.availableDatasets.mockResolvedValueOnce({
      datasets,
      nextCursor: 'next-page',
    })

    const { queryClient } = await loadAndRender('/app')

    expect(boundaries.getWorkspaceAppDatasetId).toHaveBeenCalledWith()
    expect(boundaries.availableDatasets).toHaveBeenCalledWith({
      data: { excludedDatasetId: null, cursor: null },
    })
    expect(boundaries.cardGroups).not.toHaveBeenCalled()
    expect(screen.getByText('Available source')).toBeTruthy()
    expect(
      queryClient.getQueryData(notionKeys.availableDatasetPages(null)),
    ).toMatchObject({
      pages: [{ datasets, nextCursor: 'next-page' }],
      pageParams: [null],
    })
  })

  it('loads registered card groups and filters their connected source', async () => {
    boundaries.getWorkspaceAppDatasetId.mockResolvedValue('registry-a')
    boundaries.availableDatasets.mockResolvedValue({
      datasets,
      nextCursor: null,
    })
    boundaries.cardGroups.mockResolvedValue(cardGroups)

    await loadAndRender('/app')

    expect(boundaries.cardGroups).toHaveBeenCalledWith({
      data: { dataSetId: 'registry-a' },
    })
    expect(boundaries.availableDatasets).toHaveBeenCalledWith({
      data: { excludedDatasetId: 'registry-a', cursor: null },
    })
    expect(screen.queryByText('Already connected')).toBeNull()
    expect(screen.getByText('Available source')).toBeTruthy()
    expect(screen.getByText('Languages')).toBeTruthy()
  })

  it('refreshes an invalidated home list and links an edited single deck to study', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(notionKeys.cardGroups('registry-a'), cardGroups)
    await queryClient.invalidateQueries({ queryKey: notionKeys.cardGroupsAll })
    boundaries.getWorkspaceAppDatasetId.mockResolvedValue('registry-a')
    boundaries.cardGroups.mockResolvedValue(
      cardGroups.map((group) => ({
        ...group,
        groupingColumnName: null,
        groupingColumnId: null,
        groupKeys: [],
      })),
    )
    await loadAndRender('/app', queryClient)
    expect(boundaries.cardGroups).toHaveBeenCalledWith({
      data: { dataSetId: 'registry-a' },
    })
    expect(
      screen.getByRole('link', { name: /Languages/ }).getAttribute('href'),
    ).toBe('/app/deck-a/study')
    expect(screen.getByText('Single card deck')).toBeTruthy()
  })

  it('redirects an old groups URL to study after changing to a single deck', async () => {
    boundaries.studyData.mockResolvedValue(
      createStudyData([], 'Languages', [], ''),
    )
    const { router } = await loadAndRender('/app/deck-a/groups?group=Grammar')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/app/deck-a/study'),
    )
    expect(router.state.location.search.group).toBeUndefined()
    expect(
      await screen.findByRole('heading', { name: 'All cards' }),
    ).toBeTruthy()
  })

  it('revalidates a cached missing registry mapping before loading the app', async () => {
    boundaries.getWorkspaceAppDatasetId.mockResolvedValue('registry-a')
    boundaries.availableDatasets.mockResolvedValue({
      datasets,
      nextCursor: null,
    })
    boundaries.cardGroups.mockResolvedValue(cardGroups)
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(
      workspaceRegistryKeys.appDatasetId(viewer.workspaceId),
      null,
    )

    const result = await loadAndRender('/app', queryClient)

    expect(boundaries.getWorkspaceAppDatasetId).toHaveBeenCalledOnce()
    expect(
      result.queryClient.getQueryData(
        workspaceRegistryKeys.appDatasetId(viewer.workspaceId),
      ),
    ).toBe('registry-a')
    expect(boundaries.cardGroups).toHaveBeenCalledWith({
      data: { dataSetId: 'registry-a' },
    })
  })

  it('ensures the requested dataset and renders its title', async () => {
    boundaries.dataset.mockResolvedValue({
      id: 'available-source',
      title: 'Available source',
      description: undefined,
      icon: null,
      iconUrl: null,
      coverUrl: null,
      properties: {},
    })

    const { queryClient } = await loadAndRender('/app/available-source/connect')

    expect(boundaries.dataset).toHaveBeenCalledOnce()
    expect(boundaries.dataset).toHaveBeenCalledWith({
      data: { dataSetId: 'available-source' },
    })
    expect(boundaries.getWorkspaceAppDatasetId).toHaveBeenCalledWith()
    expect(
      queryClient.getQueryData(notionKeys.dataset('available-source')),
    ).toMatchObject({ id: 'available-source', title: 'Available source' })
    expect(screen.getByText('Available source')).toBeTruthy()
  })

  it('revalidates a cached missing registry mapping before loading the connect route', async () => {
    boundaries.dataset.mockResolvedValue({
      id: 'available-source',
      title: 'Available source',
      description: undefined,
      icon: null,
      iconUrl: null,
      coverUrl: null,
      properties: {},
    })
    boundaries.getWorkspaceAppDatasetId.mockResolvedValue('registry-a')
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(
      workspaceRegistryKeys.appDatasetId(viewer.workspaceId),
      null,
    )

    const result = await loadAndRender(
      '/app/available-source/connect',
      queryClient,
    )

    expect(boundaries.getWorkspaceAppDatasetId).toHaveBeenCalledOnce()
    expect(
      result.queryClient.getQueryData(
        workspaceRegistryKeys.appDatasetId(viewer.workspaceId),
      ),
    ).toBe('registry-a')
  })

  it('blocks connection rendering and Notion mutation when the registry preflight fails', async () => {
    boundaries.dataset.mockResolvedValue({
      id: 'available-source',
      title: 'Available source',
      description: undefined,
      icon: null,
      iconUrl: null,
      coverUrl: null,
      properties: {},
    })
    boundaries.getWorkspaceAppDatasetId.mockRejectedValueOnce(
      new Error('SENTINEL Cloudflare KV unavailable'),
    )

    const { user } = await loadAndRender('/app/available-source/connect')

    expect(screen.getByText(/couldn't load this dataset/i)).toBeTruthy()
    expect(screen.queryByText(/SENTINEL/i)).toBeNull()
    expect(boundaries.completeConnection).not.toHaveBeenCalled()

    boundaries.getWorkspaceAppDatasetId.mockResolvedValue(null)
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(
      await screen.findByRole('heading', {
        name: /configure your dataset connection/i,
      }),
    ).toBeTruthy()
    expect(boundaries.getWorkspaceAppDatasetId).toHaveBeenCalledTimes(2)
    expect(boundaries.completeConnection).not.toHaveBeenCalled()
  })

  it('records visits, retries learning, and updates progress when learning and unlearning', async () => {
    boundaries.studyData.mockResolvedValue(
      createStudyData([], 'Languages', [], ''),
    )
    boundaries.studyWindow.mockResolvedValue({
      cards: [0, 1].map((index) => ({
        id: `progress-${index}`,
        visited: false,
        front: [`Progress ${index}`],
        back: ['Answer'],
        completed: false,
      })),
      nextCursor: null,
    })
    const initialVisit = deferred<{ pageId: string; completed: boolean }>()
    boundaries.saveProgress.mockReturnValueOnce(initialVisit.promise)
    const { user } = await loadAndRender('/app/deck-a/study')
    expect(await screen.findByText('Progress 0')).toBeTruthy()
    expect(screen.getByText('1/9')).toBeTruthy()
    await waitFor(() =>
      expect(boundaries.saveProgress).toHaveBeenCalledWith({
        data: { pageId: 'progress-0', action: 'visit' },
      }),
    )
    expect(
      screen
        .getByRole('button', { name: 'Mark learned' })
        .hasAttribute('disabled'),
    ).toBe(false)
    initialVisit.resolve({ pageId: 'progress-0', completed: false })
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Mark learned' })
          .hasAttribute('disabled'),
      ).toBe(false),
    )
    boundaries.saveProgress.mockRejectedValueOnce(new Error('write failed'))
    await user.click(screen.getByRole('button', { name: 'Mark learned' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    await user.click(
      screen.getByRole('button', { name: 'Retry saving progress' }),
    )
    expect(
      await screen.findByRole('button', { name: 'Mark unlearned' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('img', {
        name: '8 of 9 cards visited; 5 of 9 learned',
      }),
    ).toBeTruthy()
    expect(boundaries.studyData).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(boundaries.saveProgress).toHaveBeenLastCalledWith({
      data: { pageId: 'progress-0', action: 'learn' },
    })
    await advanceStudyCard(user)
    expect(await screen.findByText('Progress 1')).toBeTruthy()
    expect(screen.getByText('2/9')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(
      await screen.findByRole('button', { name: 'Mark unlearned' }),
    ).toBeTruthy()
    expect(
      boundaries.saveProgress.mock.calls.filter(
        ([input]) =>
          input.data.pageId === 'progress-0' && input.data.action === 'visit',
      ),
    ).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Mark unlearned' }))
    expect(
      await screen.findByRole('button', { name: 'Mark learned' }),
    ).toBeTruthy()
    expect(boundaries.saveProgress).toHaveBeenLastCalledWith({
      data: { pageId: 'progress-0', action: 'unlearn' },
    })
    expect(
      screen.getByRole('img', {
        name: '9 of 9 cards visited; 4 of 9 learned',
      }),
    ).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Mark learned' }))
    expect(
      await screen.findByRole('button', { name: 'Mark unlearned' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('img', {
        name: '9 of 9 cards visited; 5 of 9 learned',
      }),
    ).toBeTruthy()
  })

  it('prepares unlearned destinations without moving the current card and refills after navigation', async () => {
    boundaries.studyData.mockResolvedValue(
      createStudyData([], 'Languages', [], ''),
    )
    const card = (id: string, completed: boolean) => ({
      id,
      completed,
      front: [id],
      back: [`${id} answer`],
    })
    const second = {
      cards: [card('learned-second', true)],
      nextCursor: 'third',
    }
    const last = { cards: [card('learned-last', true)], nextCursor: null }
    const secondRequest = deferred<typeof second>()
    const lastRequest = deferred<typeof last>()
    boundaries.studyWindow.mockImplementation(
      (_query, cursor: string | null) => {
        if (cursor === null)
          return Promise.resolve({
            cards: [card('current', false), card('learned-first', true)],
            nextCursor: 'second',
          })
        if (cursor === 'second') return secondRequest.promise
        if (cursor === 'third')
          return Promise.resolve({
            cards: [card('destination', false)],
            nextCursor: 'last',
          })
        return lastRequest.promise
      },
    )
    const { user } = await loadAndRender('/app/deck-a/study')
    expect(await screen.findByText('current')).toBeTruthy()
    await user.click(screen.getByRole('switch', { name: 'Skip learned' }))
    await waitFor(() =>
      expect(boundaries.studyWindow).toHaveBeenCalledWith(
        expect.anything(),
        'second',
      ),
    )
    expect(screen.getByText('current')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Flip' }).hasAttribute('disabled'),
    ).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Flip' }))
    fireEvent(
      screen.getByRole('group', { name: 'Flashcard front' }),
      new Event('webkitAnimationEnd', { bubbles: true }),
    )
    fireEvent(
      screen.getByRole('group', { name: 'Flashcard back' }),
      new Event('webkitAnimationEnd', { bubbles: true }),
    )
    expect(
      await screen.findByRole('button', { name: 'Finding next…' }),
    ).toBeTruthy()
    secondRequest.resolve(second)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled'),
      ).toBe(false),
    )
    expect(screen.getByText('current answer')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('destination')).toBeTruthy()
    await waitFor(() =>
      expect(boundaries.studyWindow).toHaveBeenCalledWith(
        expect.anything(),
        'last',
      ),
    )
    lastRequest.resolve(last)
    await user.click(screen.getByRole('button', { name: 'Flip' }))
    fireEvent(
      screen.getByRole('group', { name: 'Flashcard front' }),
      new Event('webkitAnimationEnd', { bubbles: true }),
    )
    fireEvent(
      screen.getByRole('group', { name: 'Flashcard back' }),
      new Event('webkitAnimationEnd', { bubbles: true }),
    )
    await waitFor(() =>
      expect(
        screen
          .getByRole('button', { name: 'Back to start' })
          .hasAttribute('disabled'),
      ).toBe(false),
    )
    await user.click(screen.getByRole('button', { name: 'Back to start' }))
    expect(await screen.findByText('current')).toBeTruthy()
    await user.click(screen.getByRole('switch', { name: 'Skip learned' }))
    expect(screen.getByText('current')).toBeTruthy()
    await advanceStudyCard(user)
    expect(await screen.findByText('learned-first')).toBeTruthy()
  })

  it.each([false, true])(
    'reviews all learned cards without writes, initially learned: %s',
    async (initiallyLearned) => {
      const data = createStudyData([], 'Languages', [], '')
      data.categoryStats.overall = {
        total: 2,
        visited: 2,
        completed: initiallyLearned ? 2 : 1,
      }
      boundaries.studyData.mockResolvedValue(data)
      boundaries.studyWindow.mockImplementation(async (_query, cursor) => ({
        cards: [
          {
            id: cursor === null ? 'first' : 'last',
            front: [cursor === null ? 'First card' : 'Last card'],
            back: ['Answer'],
            visited: true,
            completed: cursor === null || initiallyLearned,
          },
        ],
        nextCursor: cursor === null ? 'last-page' : null,
      }))
      const { user } = await loadAndRender('/app/deck-a/study')
      expect(await screen.findByText('First card')).toBeTruthy()
      const toggle = screen.getByRole('switch', {
        name: initiallyLearned ? 'All Learned' : 'Skip learned',
      })
      if (!initiallyLearned) {
        await user.click(toggle)
        await advanceStudyCard(user)
        expect(await screen.findByText('Last card')).toBeTruthy()
        await user.click(screen.getByRole('button', { name: 'Mark learned' }))
        await screen.findByRole('button', { name: 'Mark unlearned' })
        expect(boundaries.saveProgress).toHaveBeenCalledTimes(2)
        expect(boundaries.saveProgress).toHaveBeenNthCalledWith(1, {
          data: { pageId: 'last', action: 'visit' },
        })
        expect(boundaries.saveProgress).toHaveBeenLastCalledWith({
          data: { pageId: 'last', action: 'learn' },
        })
      } else {
        expect(boundaries.saveProgress).not.toHaveBeenCalled()
      }
      await waitFor(() => expect(toggle.hasAttribute('disabled')).toBe(true))
      expect(screen.getByRole('switch', { name: 'All Learned' })).toBe(toggle)
      expect(toggle).toHaveProperty('checked', false)
      boundaries.saveProgress.mockClear()
      if (!initiallyLearned) {
        await user.click(screen.getByRole('button', { name: 'Flip' }))
        const surface = screen.getByRole('group', { name: 'Flashcard front' })
        fireEvent(surface, new Event('webkitAnimationEnd', { bubbles: true }))
        fireEvent(surface, new Event('webkitAnimationEnd', { bubbles: true }))
        await user.click(screen.getByRole('button', { name: 'Back to start' }))
        expect(await screen.findByText('First card')).toBeTruthy()
      }
      await advanceStudyCard(user)
      expect(await screen.findByText('Last card')).toBeTruthy()
      await user.click(screen.getByRole('button', { name: 'Previous' }))
      expect(await screen.findByText('First card')).toBeTruthy()
      expect(boundaries.studyWindow).toHaveBeenCalledWith(
        expect.anything(),
        'last-page',
      )
      expect(boundaries.saveProgress).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: 'Mark unlearned' }))
      await screen.findByRole('button', { name: 'Mark learned' })
      expect(toggle.hasAttribute('disabled')).toBe(false)
      expect(screen.getByRole('switch', { name: 'Skip learned' })).toBe(toggle)
      expect(toggle).toHaveProperty('checked', false)
      expect(boundaries.saveProgress).toHaveBeenCalledExactlyOnceWith({
        data: { pageId: 'first', action: 'unlearn' },
      })
    },
  )

  it.each([false, true])(
    'prepares a previous destination across learned pages, predecessor exists: %s',
    async (hasPredecessor) => {
      const data = createStudyData([], 'Languages', [], '')
      data.categoryStats.overall = {
        total: 4,
        visited: 4,
        completed: hasPredecessor ? 2 : 3,
      }
      boundaries.studyData.mockResolvedValue(data)
      const query = createStudyQuery({
        ...cardGroups[0],
        groupingColumnId: null,
      })
      const queryFingerprint = createQueryFingerprint(query)
      await setStudyCardPosition(
        viewer.workspaceId,
        'deck-a',
        queryFingerprint,
        {
          version: 1,
          query,
          queryFingerprint,
          pageIndex: 2,
          cardIndex: 0,
          cursors: [null, 'middle', 'last'],
          pageOffsets: [0, 2, 3],
        },
      )
      const card = (id: string, completed: boolean) => ({
        id,
        completed,
        visited: true,
        front: [id],
        back: ['Answer'],
      })
      const firstPage = {
        cards: [
          card('First card', !hasPredecessor),
          card('Learned first', true),
        ],
        nextCursor: 'middle',
      }
      const middlePage = {
        cards: [card('Learned middle', true)],
        nextCursor: 'last',
      }
      const firstRequest = deferred<typeof firstPage>()
      const middleRequest = deferred<typeof middlePage>()
      boundaries.studyWindow.mockImplementation(async (_query, cursor) => {
        if (cursor === null) return firstRequest.promise
        if (cursor === 'middle') return middleRequest.promise
        return { cards: [card('Current card', false)], nextCursor: null }
      })
      const { user } = await loadAndRender('/app/deck-a/study')
      await screen.findByText('Current card')
      await user.click(screen.getByRole('switch', { name: 'Skip learned' }))
      const preparing = await screen.findByRole('button', {
        name: 'Finding previous…',
      })
      expect(preparing.hasAttribute('disabled')).toBe(true)
      expect(screen.getByText('Current card')).toBeTruthy()
      expect(
        screen.getByRole('button', { name: 'Flip' }).hasAttribute('disabled'),
      ).toBe(false)
      middleRequest.resolve(middlePage)
      await waitFor(() =>
        expect(boundaries.studyWindow).toHaveBeenCalledWith(
          expect.anything(),
          null,
        ),
      )
      expect(screen.getByText('Current card')).toBeTruthy()
      firstRequest.resolve(firstPage)
      const previous = await screen.findByRole('button', { name: 'Previous' })
      await waitFor(() =>
        expect(previous.hasAttribute('disabled')).toBe(!hasPredecessor),
      )
      if (hasPredecessor) {
        await user.click(previous)
        expect(await screen.findByText('First card')).toBeTruthy()
        expect(screen.getByText('1/4')).toBeTruthy()
      } else {
        const requests = boundaries.studyWindow.mock.calls.length
        await user.click(previous)
        expect(screen.getByText('Current card')).toBeTruthy()
        expect(boundaries.studyWindow).toHaveBeenCalledTimes(requests)
      }
    },
  )

  it.each<Pick<StudyCardPosition, 'cursors' | 'pageOffsets'>>([
    { cursors: undefined, pageOffsets: undefined },
    { cursors: [null, 'middle'], pageOffsets: undefined },
    { cursors: [null, 'middle', 'last'], pageOffsets: [0, 2] },
  ])(
    'recovers older cursor and offset histories through short and empty pages: %j',
    async (history) => {
      const data = createStudyData([], 'Languages', [], '')
      data.categoryStats.overall = { total: 5, visited: 0, completed: 0 }
      boundaries.studyData.mockResolvedValue(data)
      const query = createStudyQuery({
        ...cardGroups[0],
        groupingColumnId: null,
      })
      const queryFingerprint = createQueryFingerprint(query)
      await setStudyCardPosition(
        viewer.workspaceId,
        'deck-a',
        queryFingerprint,
        {
          version: 1,
          query,
          queryFingerprint,
          pageIndex: 2,
          cardIndex: 1,
          ...history,
        },
      )
      boundaries.studyWindow.mockImplementation(async (_query, cursor) => ({
        cards: Array.from(
          { length: cursor === 'middle' ? 0 : cursor === null ? 2 : 3 },
          (_, index) => ({
            id: `${cursor}-${index}`,
            visited: false,
            completed: false,
            front: [`${cursor ?? 'first'} card ${index}`],
            back: ['Answer'],
          }),
        ),
        nextCursor:
          cursor === null ? 'middle' : cursor === 'middle' ? 'last' : null,
      }))
      const { user } = await loadAndRender('/app/deck-a/study')
      expect(await screen.findByText('last card 1')).toBeTruthy()
      expect(screen.getByText('4/5')).toBeTruthy()
      await waitFor(async () =>
        expect(
          await getStudyCardPosition(
            viewer.workspaceId,
            'deck-a',
            queryFingerprint,
          ),
        ).toMatchObject({
          pageIndex: 2,
          cardIndex: 1,
          cursors: [null, 'middle', 'last'],
          pageOffsets: [0, 2, 2],
        }),
      )
      await advanceStudyCard(user)
      expect(await screen.findByText('last card 2')).toBeTruthy()
      expect(screen.getByText('5/5')).toBeTruthy()
      for (let index = 0; index < 3; index += 1)
        await user.click(screen.getByRole('button', { name: 'Previous' }))
      expect(await screen.findByText('first card 1')).toBeTruthy()
      expect(screen.getByText('2/5')).toBeTruthy()
    },
  )

  it('updates normalized visited progress when unlearning a card completed directly in Notion', async () => {
    const data = createStudyData([], 'Languages', [], '')
    data.categoryStats.overall = { total: 1, visited: 1, completed: 1 }
    boundaries.studyData.mockResolvedValue(data)
    boundaries.studyWindow.mockResolvedValue({
      cards: [
        {
          id: 'notion-learned',
          visited: false,
          completed: true,
          front: ['Learned in Notion'],
          back: ['Answer'],
        },
      ],
      nextCursor: null,
    })
    const { user } = await loadAndRender('/app/deck-a/study')
    await screen.findByText('Learned in Notion')
    expect(boundaries.saveProgress).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Mark unlearned' }))
    expect(
      await screen.findByRole('img', {
        name: '0 of 1 cards visited; 0 of 1 learned',
      }),
    ).toBeTruthy()
    expect(boundaries.saveProgress).toHaveBeenCalledExactlyOnceWith({
      data: { pageId: 'notion-learned', action: 'unlearn' },
    })
    await user.click(screen.getByRole('button', { name: 'Mark learned' }))
    expect(
      await screen.findByRole('img', {
        name: '1 of 1 cards visited; 1 of 1 learned',
      }),
    ).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Mark unlearned' }))
    expect(
      await screen.findByRole('img', {
        name: '1 of 1 cards visited; 0 of 1 learned',
      }),
    ).toBeTruthy()
    expect(boundaries.studyData).toHaveBeenCalledOnce()
  })

  it('uses refreshed group stats when re-entering study without counting local writes twice', async () => {
    const data = createStudyData(['Grammar'])
    data.categoryStats.overall = { total: 2, visited: 2, completed: 1 }
    data.categoryStats.byCategory.Grammar = { ...data.categoryStats.overall }
    const refreshed = createStudyData(['Grammar'])
    refreshed.categoryStats.overall = { total: 2, visited: 2, completed: 2 }
    refreshed.categoryStats.byCategory.Grammar = {
      ...refreshed.categoryStats.overall,
    }
    boundaries.studyData
      .mockResolvedValueOnce(data)
      .mockResolvedValue(refreshed)
    boundaries.studyWindow.mockResolvedValue({
      cards: [
        {
          id: 'learned',
          visited: true,
          completed: true,
          front: ['Learned card'],
          back: ['Answer'],
          groupKey: 'Grammar',
        },
        {
          id: 'last-unlearned',
          visited: true,
          completed: false,
          front: ['Last unlearned'],
          back: ['Answer'],
          groupKey: 'Grammar',
        },
      ],
      nextCursor: null,
    })
    const { user } = await loadAndRender('/app/deck-a/study?group=Grammar')
    await screen.findByText('Learned card')
    await user.click(screen.getByRole('switch', { name: 'Skip learned' }))
    await advanceStudyCard(user)
    await user.click(screen.getByRole('button', { name: 'Mark learned' }))
    expect(
      await screen.findByRole('img', {
        name: '2 of 2 cards visited; 2 of 2 learned',
      }),
    ).toBeTruthy()
    expect(boundaries.studyData).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByText('Grammar')
    await waitFor(() => expect(boundaries.studyData).toHaveBeenCalledTimes(2))
    await screen.findByRole('img', {
      name: '2 of 2 cards visited; 2 of 2 learned',
    })
    await user.click(screen.getByText('Grammar'))
    await screen.findByText('Last unlearned')
    expect(
      screen.getByRole('img', { name: '2 of 2 cards visited; 2 of 2 learned' }),
    ).toBeTruthy()
    expect(
      screen
        .getByRole('switch', { name: 'All Learned' })
        .hasAttribute('disabled'),
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Mark unlearned' }))
    expect(
      await screen.findByRole('img', {
        name: '2 of 2 cards visited; 1 of 2 learned',
      }),
    ).toBeTruthy()
    expect(boundaries.studyData).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('switch', { name: 'Skip learned' })).toHaveProperty(
      'checked',
      false,
    )
  })

  it('restores cursor history, prefetches backward at index 2, and persists across multiple previous batches', async () => {
    const data = createStudyData([], 'Languages', [], '')
    data.categoryStats.overall = { total: 12, visited: 0, completed: 0 }
    boundaries.studyData.mockResolvedValue(data)
    const query = createStudyQuery({ ...cardGroups[0], groupingColumnId: null })
    const queryFingerprint = createQueryFingerprint(query)
    await setStudyCardPosition(viewer.workspaceId, 'deck-a', queryFingerprint, {
      version: 1,
      query,
      queryFingerprint,
      pageIndex: 2,
      cardIndex: 3,
      cursors: [null, 'second', 'third'],
      pageOffsets: [0, 4, 8],
    })
    boundaries.studyWindow.mockImplementation(async (_query, cursor) => ({
      cards: Array.from({ length: 4 }, (_, index) => ({
        id: `${cursor}-${index}`,
        front: [`${cursor ?? 'first'} card ${index}`],
        back: ['Answer'],
        completed: false,
      })),
      nextCursor:
        cursor === null ? 'second' : cursor === 'second' ? 'third' : null,
    }))
    const { user, router, queryClient } =
      await loadAndRender('/app/deck-a/study')
    expect(await screen.findByText('third card 3')).toBeTruthy()
    expect(screen.getByText('12/12')).toBeTruthy()
    expect(boundaries.studyWindow.mock.calls.map((call) => call[1])).toEqual([
      'third',
    ])
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    await waitFor(() =>
      expect(boundaries.studyWindow.mock.calls.map((call) => call[1])).toEqual([
        'third',
        'second',
      ]),
    )
    for (let index = 0; index < 3; index += 1)
      await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('second card 3')).toBeTruthy()
    expect(screen.getByText('8/12')).toBeTruthy()
    await waitFor(async () =>
      expect(
        await getStudyCardPosition(
          viewer.workspaceId,
          'deck-a',
          queryFingerprint,
        ),
      ).toMatchObject({
        pageIndex: 1,
        cardIndex: 3,
        cursors: [null, 'second', 'third'],
        pageOffsets: [0, 4, 8],
      }),
    )
    await router.navigate({ to: '/app' })
    queryClient.removeQueries({ queryKey: ['study-card-window'] })
    boundaries.studyWindow.mockClear()
    await router.navigate({ href: '/app/deck-a/study' })
    expect(await screen.findByText('second card 3')).toBeTruthy()
    expect(boundaries.studyWindow.mock.calls.map((call) => call[1])).toEqual([
      'second',
      'third',
    ])
    for (let index = 0; index < 4; index += 1)
      await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('first card 3')).toBeTruthy()
    await waitFor(async () =>
      expect(
        await getStudyCardPosition(
          viewer.workspaceId,
          'deck-a',
          queryFingerprint,
        ),
      ).toMatchObject({
        pageIndex: 0,
        cardIndex: 3,
        cursors: [null, 'second', 'third'],
        pageOffsets: [0, 4, 8],
      }),
    )
  })

  it('keeps the current card on a previous-batch failure and retries navigation', async () => {
    boundaries.studyData.mockResolvedValue(
      createStudyData([], 'Languages', [], ''),
    )
    const query = createStudyQuery({ ...cardGroups[0], groupingColumnId: null })
    const queryFingerprint = createQueryFingerprint(query)
    await setStudyCardPosition(viewer.workspaceId, 'deck-a', queryFingerprint, {
      version: 1,
      query,
      queryFingerprint,
      pageIndex: 1,
      cardIndex: 0,
      cursors: [null, 'second'],
      pageOffsets: [0, 1],
    })
    boundaries.studyWindow.mockImplementation(async (_query, cursor) => {
      if (cursor === null) throw new Error('previous page unavailable')
      return {
        cards: [
          { id: 'second', front: ['Current batch'], back: [], completed: true },
        ],
        nextCursor: null,
      }
    })
    const { user } = await loadAndRender('/app/deck-a/study')
    expect(await screen.findByText('Current batch')).toBeTruthy()
    await user.click(screen.getByRole('switch', { name: 'Skip learned' }))
    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText('Current batch')).toBeTruthy()
    boundaries.studyWindow.mockResolvedValue({
      cards: [
        { id: 'first', front: ['Previous batch'], back: [], completed: false },
      ],
      nextCursor: 'second',
    })
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('Previous batch')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('renders a selected category, filters its study query, and routes back to groups', async () => {
    const refreshedStudyData = createStudyData(
      ['Grammar', 'Vocabulary'],
      'Languages',
      ['Stale'],
    )

    boundaries.studyData
      .mockResolvedValueOnce(
        createStudyData(['Grammar', 'Vocabulary'], 'Languages', ['Stale']),
      )
      .mockResolvedValue(refreshedStudyData)
    const studyQuery = createStudyQuery(cardGroups[0], {
      value: 'Grammar',
      propertyType: 'select',
    })
    const queryFingerprint = createQueryFingerprint(studyQuery)
    await setStudyCardPosition(viewer.workspaceId, 'deck-a', queryFingerprint, {
      version: 1,
      query: studyQuery,
      queryFingerprint,
      pageIndex: 2,
      cardIndex: 2,
    })
    boundaries.studyWindow.mockResolvedValueOnce({
      cards: [
        {
          id: 'saved-card-1',
          front: ['First saved prompt'],
          back: ['First saved answer'],
          groupKey: 'Grammar',
        },
        {
          id: 'saved-card-2',
          front: ['Current saved prompt'],
          back: ['Current saved answer'],
          groupKey: 'Grammar',
        },
      ],
      nextCursor: null,
    })

    const { queryClient, user, router } = await loadAndRender(
      '/app/deck-a/study?group=Grammar',
    )

    expect(boundaries.studyData).toHaveBeenCalledOnce()
    expect(boundaries.studyData).toHaveBeenCalledWith({
      data: { dataGroupId: 'deck-a' },
    })
    expect(
      queryClient.getQueryData(notionKeys.cardGroupStudyData('deck-a')),
    ).toMatchObject({ groupKeys: ['Grammar', 'Vocabulary'] })
    expect(await screen.findByRole('heading', { name: 'Grammar' })).toBeTruthy()
    expect(await screen.findByText('Current saved prompt')).toBeTruthy()
    await waitFor(async () =>
      expect(
        await getStudyCardPosition(
          viewer.workspaceId,
          'deck-a',
          queryFingerprint,
        ),
      ).toMatchObject({ cardIndex: 1 }),
    )
    expect(boundaries.studyWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        dataSourceId: 'connected-source',
        groupPropertyId: 'topic-id',
        filter: {
          property: 'topic-id',
          select: { equals: 'Grammar' },
        },
      }),
      null,
    )
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('First saved prompt')).toBeTruthy()
    await waitFor(async () =>
      expect(
        await getStudyCardPosition(
          viewer.workspaceId,
          'deck-a',
          queryFingerprint,
        ),
      ).toMatchObject({
        query: studyQuery,
        pageIndex: 0,
        cardIndex: 0,
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/app/deck-a/groups'),
    )
    await waitFor(() => expect(boundaries.studyData).toHaveBeenCalledTimes(2))
  })

  it('refetches cached study data when a deck is reopened after 30 seconds', async () => {
    let now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)

    try {
      boundaries.studyData.mockResolvedValueOnce(createStudyData(['Old']))
      const { router } = await loadAndRender('/app/deck-a/groups')

      expect(screen.getByText('Old')).toBeTruthy()
      await router.navigate({ to: '/app' })

      now += 30_001
      boundaries.studyData.mockResolvedValueOnce(createStudyData(['Fresh']))
      await router.navigate({
        to: '/app/$deckId/groups',
        params: { deckId: 'deck-a' },
      })

      expect(screen.getByText('Fresh')).toBeTruthy()
      expect(screen.queryByText('Old')).toBeNull()
      expect(boundaries.studyData).toHaveBeenCalledTimes(2)
    } finally {
      clock.mockRestore()
    }
  })

  it('uses the dataset title fallback and routes non-study deck headers home', async () => {
    boundaries.studyData.mockResolvedValue(createStudyData([], ''))

    const { user, router } = await loadAndRender('/app/deck-a/groups')

    expect(screen.getByText('Untitled dataset')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
  })

  it('renders an ungrouped study without a filter and routes its header home', async () => {
    boundaries.studyData.mockResolvedValue(
      createStudyData([], 'Languages', [], ''),
    )
    const firstPage = Array.from({ length: 20 }, (_, index) => ({
      id: `page-1-card-${index}`,
      front: [`Study prompt ${index + 1}`],
      back: [`Study answer ${index + 1}`],
    }))
    const secondPage = {
      cards: [
        {
          id: 'page-2-card-1',
          front: ['Next batch prompt'],
          back: ['Next batch answer'],
        },
      ],
      nextCursor: null,
    }
    let secondPageRequest = deferred<typeof secondPage>()
    boundaries.studyWindow.mockImplementation(
      (_query, startCursor: string | null) =>
        startCursor === null
          ? Promise.resolve({ cards: firstPage, nextCursor: 'page-2' })
          : secondPageRequest.promise,
    )

    const { queryClient, user, router } =
      await loadAndRender('/app/deck-a/study')

    expect(
      await screen.findByRole('heading', { name: 'All cards' }),
    ).toBeTruthy()
    expect(await screen.findByText('Study prompt 1')).toBeTruthy()
    expect(boundaries.studyWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        dataSourceId: 'connected-source',
        filter: undefined,
        groupPropertyId: undefined,
      }),
      null,
    )
    for (let index = 0; index < 15; index += 1) {
      await advanceStudyCard(user)
    }
    await waitFor(() =>
      expect(boundaries.studyWindow).toHaveBeenCalledWith(
        expect.objectContaining({ filter: undefined }),
        'page-2',
      ),
    )
    expect(
      screen.getByRole('button', { name: 'Previous' }).hasAttribute('disabled'),
    ).toBe(false)
    expect(
      screen.getByRole('button', { name: 'Flip' }).hasAttribute('disabled'),
    ).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('Study prompt 15')).toBeTruthy()
    await advanceStudyCard(user)
    expect(await screen.findByText('Study prompt 16')).toBeTruthy()
    secondPageRequest.resolve(secondPage)
    for (let index = 0; index < 5; index += 1) {
      await advanceStudyCard(user)
    }
    expect(await screen.findByText('Next batch prompt')).toBeTruthy()
    const lastCard = screen.getByRole('group', { name: 'Flashcard front' })
    await user.click(lastCard)
    fireEvent(lastCard, new Event('webkitAnimationEnd', { bubbles: true }))
    fireEvent(lastCard, new Event('webkitAnimationEnd', { bubbles: true }))
    expect(screen.getByRole('button', { name: 'Back to start' })).toBeTruthy()
    const studyQuery = createStudyQuery({
      ...cardGroups[0],
      groupingColumnId: null,
    })
    const queryFingerprint = createQueryFingerprint(studyQuery)
    await waitFor(async () =>
      expect(
        await getStudyCardPosition(
          viewer.workspaceId,
          'deck-a',
          queryFingerprint,
        ),
      ).toMatchObject({ pageIndex: 1, cardIndex: 0 }),
    )
    boundaries.failStudyPositionWrites = true
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('Study prompt 20')).toBeTruthy()
    expect(
      await screen.findByText(
        'Something went wrong on our end. Please try again.',
      ),
    ).toBeTruthy()
    boundaries.failStudyPositionWrites = false
    await advanceStudyCard(user)
    expect(await screen.findByText('Next batch prompt')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))

    queryClient.removeQueries({ queryKey: ['study-card-window'] })
    boundaries.studyWindow.mockClear()
    secondPageRequest = deferred()
    await router.navigate({ href: '/app/deck-a/study' })

    expect(await screen.findByRole('status', { name: 'Loading' })).toBeTruthy()
    expect(screen.queryByText('This deck has no cards')).toBeNull()
    secondPageRequest.resolve(secondPage)
    expect(await screen.findByText('Next batch prompt')).toBeTruthy()
    expect(boundaries.studyWindow).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ filter: undefined }),
      'page-2',
    )
    await waitFor(() =>
      expect(boundaries.studyWindow).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ filter: undefined }),
        null,
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Previous' }))
    expect(await screen.findByText('Study prompt 20')).toBeTruthy()
    await advanceStudyCard(user)
    await user.click(screen.getByRole('button', { name: 'Flip' }))
    const lastSurface = screen.getByRole('group', { name: 'Flashcard front' })
    fireEvent(lastSurface, new Event('webkitAnimationEnd', { bubbles: true }))
    fireEvent(lastSurface, new Event('webkitAnimationEnd', { bubbles: true }))
    await user.click(screen.getByRole('button', { name: 'Back to start' }))
    expect(await screen.findByText('Study prompt 1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Flip' })).toBeTruthy()
  }, 20_000)

  it.each(['/app/deck-a/study', '/app/deck-a/study?group=Unknown'])(
    'returns an invalid grouped selection to the category chooser',
    async (entry) => {
      boundaries.studyData.mockResolvedValue(
        createStudyData(['Grammar', 'Vocabulary']),
      )

      const { router } = await loadAndRender(entry)

      await waitFor(() =>
        expect(router.state.location.pathname).toBe('/app/deck-a/groups'),
      )
      expect(boundaries.studyWindow).not.toHaveBeenCalled()
    },
  )

  it('renders live group keys with progress stats and links with deck and group search', async () => {
    boundaries.studyData.mockResolvedValue(
      createStudyData(['Grammar', 'Vocabulary'], 'Languages', ['Stale']),
    )

    const { user, router } = await loadAndRender('/app/deck-a/groups')

    expect(screen.getByText('Grammar')).toBeTruthy()
    expect(screen.getByText('Vocabulary')).toBeTruthy()
    expect(screen.queryByText('Stale')).toBeNull()
    expect(screen.getByText('5 cards')).toBeTruthy()
    expect(screen.getByText('0 cards')).toBeTruthy()
    expect(
      screen.getByRole('img', { name: '4 of 5 cards visited; 3 of 5 learned' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('img', { name: '0 of 0 cards visited; 0 of 0 learned' }),
    ).toBeTruthy()

    await user.click(screen.getByText('Vocabulary'))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/app/deck-a/study'),
    )
    expect(router.state.location.search).toEqual({ group: 'Vocabulary' })
  })

  it('renders the group empty state from empty live keys', async () => {
    boundaries.studyData.mockResolvedValue(
      createStudyData([], 'Languages', ['Stale']),
    )

    await loadAndRender('/app/deck-a/groups')

    expect(screen.getByText(/deck has no categories/i)).toBeTruthy()
  })

  it.each([
    ['/app/deck-a/study?group=Grammar', 'Grammar'],
    ['/app/deck-a/study?group=', undefined],
    ['/app/deck-a/study?group=Grammar&group=Vocabulary', undefined],
  ])('normalizes study group search for %s', async (entry, expected) => {
    boundaries.studyData.mockResolvedValue(
      createStudyData([], 'Languages', [], ''),
    )

    const { router } = await loadAndRender(entry)

    expect(
      router.state.matches.find(
        (match) => match.routeId === '/_authed/app_/$deckId/study',
      )?.search,
    ).toEqual({ group: expected })
  })

  it.each([undefined, null, 0, true, [], {}])(
    'normalizes a non-string raw study group value (%#)',
    async (group) => {
      const { Route: StudyRoute } = await import('./_authed/app_.$deckId.study')
      const validateSearch = StudyRoute.options.validateSearch
      if (typeof validateSearch !== 'function') {
        throw new Error('Study route does not declare a search validator')
      }

      expect(validateSearch({ group })).toEqual({
        group: undefined,
      })
    },
  )
})

describe('pending, error, and not-found route behavior', () => {
  beforeEach(() => boundaries.viewer.mockResolvedValue(viewer))

  it('shows a named pending status during an actual deck transition', async () => {
    const { router } = await loadAndRender('/app')
    let resolveStudy!: (value: ReturnType<typeof createStudyData>) => void
    boundaries.studyData.mockReturnValue(
      new Promise((resolve) => {
        resolveStudy = resolve
      }),
    )
    const loading = router.navigate({
      to: '/app/$deckId/groups',
      params: { deckId: 'deck-a' },
    })

    expect(await screen.findByRole('status', { name: 'Loading' })).toBeTruthy()
    resolveStudy(createStudyData([]))
    await loading
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('offers reconnect for a reauthorization error', async () => {
    boundaries.getWorkspaceAppDatasetId.mockRejectedValue(
      new AppError('reauth_required'),
    )

    await loadAndRender('/app')

    expect(
      screen.getByRole('button', { name: /reconnect notion/i }),
    ).toBeTruthy()
  })

  it('invalidates and recovers through the retryable route error action', async () => {
    boundaries.getWorkspaceAppDatasetId.mockRejectedValueOnce(
      new AppError('rate_limited'),
    )

    const { user } = await loadAndRender('/app')
    boundaries.getWorkspaceAppDatasetId.mockResolvedValue(null)
    await user.click(screen.getByRole('button', { name: /try again/i }))

    await screen.findByText(/no decks yet/i)
    expect(boundaries.getWorkspaceAppDatasetId).toHaveBeenCalledTimes(2)
  })

  it('offers no invalid action for non-retryable route errors', async () => {
    boundaries.getWorkspaceAppDatasetId.mockRejectedValue(
      new AppError('validation'),
    )

    await loadAndRender('/app')

    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /reconnect/i })).toBeNull()
  })

  it('renders provider failures through the connect route error contract', async () => {
    boundaries.dataset.mockRejectedValue(new AppError('reauth_required'))

    await loadAndRender('/app/available-source/connect')

    expect(screen.getByText(/couldn't load this dataset/i)).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /reconnect notion/i }),
    ).toBeTruthy()
  })

  it('exposes a named home action for unknown routes', async () => {
    const { user, router } = await loadAndRender('/missing')

    expect(screen.getByText('Page not found')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /go home/i }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
  })

  it('keeps unknown error details private and exposes retry and home actions', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    boundaries.viewer.mockRejectedValue(
      new Error('SENTINEL raw provider response'),
    )

    const { router } = await loadAndRender('/')

    expect(screen.queryByText(/SENTINEL/)).toBeNull()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /go home/i })).toBeTruthy()

    boundaries.viewer.mockResolvedValue(null)
    await router.invalidate()
    await screen.findByRole('button', { name: /add connection/i })
  })
})

describe('server route handlers', () => {
  it('continues a normal root request without invoking OAuth completion', async () => {
    const { Route } = await import('./index')
    const expected = new Response('next')
    const next = vi.fn().mockResolvedValue(expected)
    const get = getRouteGetHandler(Route)

    const response = await get({
      request: new Request('https://example.test/'),
      next,
    } as never)

    expect(response).toBe(expected)
    expect(next).toHaveBeenCalledOnce()
    expect(boundaries.completeAuthorization).not.toHaveBeenCalled()
  })

  it('renders a public OAuth result without treating it as another provider callback', async () => {
    const { Route } = await import('./index')
    const expected = new Response('render home')
    const next = vi.fn().mockResolvedValue(expected)
    const get = getRouteGetHandler(Route)

    const response = await get({
      request: new Request('https://example.test/?oauthResult=oauth_cancelled'),
      next,
    } as never)

    expect(response).toBe(expected)
    expect(next).toHaveBeenCalledOnce()
    expect(boundaries.completeAuthorization).not.toHaveBeenCalled()
  })

  it.each([
    [
      '?error=access_denied&error_description=SENTINEL',
      'oauth_cancelled',
      { code: null, state: null, error: 'access_denied' },
    ],
    [
      '?code=code-only',
      'oauth_state_invalid',
      { code: 'code-only', state: null, error: null },
    ],
    [
      '?state=state-only',
      'oauth_state_invalid',
      { code: null, state: 'state-only', error: null },
    ],
  ])(
    'maps callback %s to only its safe public code',
    async (search, code, input) => {
      const { NotionOAuthError } =
        await import('#/integrations/notion/oauth-server')
      boundaries.completeAuthorization.mockRejectedValue(
        new NotionOAuthError(code as never),
      )
      const { Route } = await import('./index')
      const get = getRouteGetHandler(Route)

      let thrown: unknown
      try {
        await get({
          request: new Request(`https://example.test/${search}`),
          next: vi.fn(),
        } as never)
      } catch (error) {
        thrown = error
      }

      expect(isRedirect(thrown)).toBe(true)
      expect((thrown as Response).status).toBe(302)
      expect((thrown as Response).headers.get('Location')).toBe(
        `/?oauthResult=${code}`,
      )
      expect((thrown as Response).headers.get('Location')).not.toContain(
        'SENTINEL',
      )
      expect(boundaries.completeAuthorization).toHaveBeenCalledWith(input)
    },
  )

  it('redirects successful OAuth completion to the app', async () => {
    boundaries.completeAuthorization.mockResolvedValue(undefined)
    const { Route } = await import('./index')
    const get = getRouteGetHandler(Route)

    const thrown = await get({
      request: new Request('https://example.test/?code=valid&state=matching'),
      next: vi.fn(),
    } as never).catch((error: unknown) => error)

    expect(isRedirect(thrown)).toBe(true)
    expect((thrown as Response).status).toBe(302)
    expect((thrown as Response).headers.get('Location')).toBe('/app')
    expect(boundaries.completeAuthorization).toHaveBeenCalledWith({
      code: 'valid',
      state: 'matching',
      error: null,
    })
  })

  it('maps typed and unknown callback failures to safe codes', async () => {
    const { NotionOAuthError } =
      await import('#/integrations/notion/oauth-server')
    const { Route } = await import('./index')
    const get = getRouteGetHandler(Route)

    boundaries.completeAuthorization.mockRejectedValueOnce(
      new NotionOAuthError('configuration_error'),
    )
    let typedFailure: unknown
    try {
      await get({
        request: new Request('https://example.test/?code=a&state=b'),
        next: vi.fn(),
      } as never)
    } catch (error) {
      typedFailure = error
    }
    expect((typedFailure as Response).headers.get('Location')).toBe(
      '/?oauthResult=configuration_error',
    )

    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    boundaries.completeAuthorization.mockRejectedValueOnce(
      new Error('SENTINEL provider detail'),
    )
    let thrown: unknown
    try {
      await get({
        request: new Request('https://example.test/?code=a&state=b'),
        next: vi.fn(),
      } as never)
    } catch (error) {
      thrown = error
    }
    expect((thrown as Response).headers.get('Location')).toBe(
      '/?oauthResult=oauth_exchange_failed',
    )
  })

  it('preserves the authorization start response', async () => {
    const expected = Response.redirect('https://notion.example/authorize', 302)
    boundaries.beginAuthorization.mockResolvedValue(expected)
    const { Route } = await import('./auth.notion.start')
    const get = getRouteGetHandler(Route)

    await expect(get({} as never)).resolves.toBe(expected)
    expect(boundaries.beginAuthorization).toHaveBeenCalledOnce()
  })
})

async function advanceStudyCard(
  user: Awaited<ReturnType<typeof loadAndRender>>['user'],
) {
  await user.click(screen.getByRole('button', { name: 'Flip' }))
  const surface = screen.getByRole('group', { name: 'Flashcard front' })
  fireEvent(surface, new Event('webkitAnimationEnd', { bubbles: true }))
  fireEvent(surface, new Event('webkitAnimationEnd', { bubbles: true }))
  await user.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Flip' }),
    ),
  )
}
