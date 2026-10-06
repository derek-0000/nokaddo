import { QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DeckSettingsDrawer from './deck-settings-drawer'
import StudyProgressChart from './study-progress-chart'
import { createTestQueryClient } from '../../../../test/support/query-client'
import { notionKeys, notionQueries } from '#/integrations/notion/api'
import type { CardGroups } from '#/integrations/notion/api'
import { NOKADDO_REVIEW_PROPERTIES } from '#/integrations/notion/review-property-validators'
import { AppError } from '#/lib/errors'

const boundaries = vi.hoisted(() => ({
  cardGroups: vi.fn(),
  studyData: vi.fn(),
  updateCardGroup: vi.fn(),
  getNotionDataset: vi.fn(),
  deleteCardGroup: vi.fn(),
}))

vi.mock('#/integrations/notion/auth-functions', () => ({
  disconnectNotion: vi.fn(),
  getAvailableDatasets: vi.fn(),
  getNotionViewer: vi.fn(),
  reauthorizeNotion: vi.fn(),
}))

vi.mock('#/integrations/notion/card-functions', () => ({
  deleteCardGroup: boundaries.deleteCardGroup,
  updateCardGroup: boundaries.updateCardGroup,
  getCardGroupConfig: vi.fn(),
  getCardGroups: boundaries.cardGroups,
  getCardGroupStudyData: boundaries.studyData,
}))

vi.mock('#/integrations/notion/dataset-functions', () => ({
  completeDatasetConnection: vi.fn(),
  getNotionDataset: boundaries.getNotionDataset,
  getNotionDatasetItems: vi.fn(),
}))

const deckId = 'deck-a'
const targetDeck = deck(deckId, 'source-a')
const otherDeck = deck('deck-b', 'source-b')
const thirdDeck = deck('deck-c', 'source-c')

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  boundaries.getNotionDataset.mockResolvedValue({
    id: 'source-a',
    properties: sourceDatasetProperties(),
  })
  boundaries.updateCardGroup.mockResolvedValue({ groupingColumnId: null })
  boundaries.studyData.mockResolvedValue({ deckConfig: {} })
  boundaries.deleteCardGroup.mockResolvedValue(undefined)
  boundaries.cardGroups.mockResolvedValue([otherDeck])
})

describe('deck deletion settings', () => {
  it('opens and dismisses the named drawer and confirmation dialog from the keyboard without deleting', async () => {
    const { user } = await renderDeckSettings()
    const settings = screen.getByRole('button', { name: 'Deck settings' })

    settings.focus()
    await user.keyboard('{Enter}')
    expect(
      await screen.findByRole('dialog', { name: 'Deck settings' }),
    ).toBeTruthy()
    expect(settings.getAttribute('aria-expanded')).toBe('true')

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Deck settings' }),
      ).toBeNull(),
    )
    expect(document.activeElement).toBe(settings)

    await user.keyboard('{Enter}')
    const deleteTrigger = await screen.findByRole('button', {
      name: 'Delete deck',
    })
    deleteTrigger.focus()
    await user.keyboard('{Enter}')

    expect(
      await screen.findByRole('alertdialog', { name: 'Delete Languages?' }),
    ).toBeTruthy()
    expect(screen.getByText(/study progress cannot be recovered/i)).toBeTruthy()
    expect(boundaries.deleteCardGroup).not.toHaveBeenCalled()

    fireEvent.click(
      document.querySelector('[data-slot="alert-dialog-backdrop"]')!,
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: 'Delete Languages?' }),
      ).toBeNull(),
    )
    expect(document.activeElement).toBe(deleteTrigger)
    expect(boundaries.deleteCardGroup).not.toHaveBeenCalled()

    deleteTrigger.focus()
    await user.keyboard('{Enter}')
    expect(
      await screen.findByRole('alertdialog', { name: 'Delete Languages?' }),
    ).toBeTruthy()

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: 'Delete Languages?' }),
      ).toBeNull(),
    )
    expect(document.activeElement).toBe(deleteTrigger)
    expect(boundaries.deleteCardGroup).not.toHaveBeenCalled()
  })

  it('keeps a failed confirmation in place, disables pending controls, and applies every success cache outcome', async () => {
    const deletion = deferred<void>()
    boundaries.deleteCardGroup
      .mockRejectedValueOnce(
        new AppError('temporarily_unavailable', {
          cause: new Error('SENTINEL provider response'),
        }),
      )
      .mockReturnValueOnce(deletion.promise)
    const { queryClient, router, user } = await renderDeckSettings()

    queryClient.setQueryData<CardGroups>(notionKeys.cardGroups('registry-a'), [
      targetDeck,
      otherDeck,
    ])
    queryClient.setQueryData<CardGroups>(notionKeys.cardGroups('registry-b'), [
      targetDeck,
      thirdDeck,
    ])
    queryClient.setQueryData(notionKeys.cardGroupConfig(deckId), {
      id: deckId,
    })
    queryClient.setQueryData(notionKeys.cardGroupStudyData(deckId), {
      deck: deckId,
    })
    queryClient.setQueryData(notionKeys.cardGroupConfig('deck-b'), {
      id: 'deck-b',
    })

    queryClient.setQueryData(['unrelated'], { keep: true })

    const activeCardGroups = new QueryObserver(queryClient, {
      ...notionQueries.cardGroups('registry-a'),
      staleTime: Number.POSITIVE_INFINITY,
    })
    const unsubscribe = activeCardGroups.subscribe(() => undefined)

    await user.click(screen.getByRole('button', { name: 'Deck settings' }))
    await user.click(await screen.findByRole('button', { name: 'Delete deck' }))
    const confirmation = await screen.findByRole('alertdialog', {
      name: 'Delete Languages?',
    })
    await user.click(
      within(confirmation).getByRole('button', { name: 'Delete deck' }),
    )

    const alert = await within(confirmation).findByRole('alert')
    expect(alert.textContent).toMatch(/temporarily unavailable/i)
    expect(alert.textContent).not.toContain('SENTINEL')
    expect(router.state.location.pathname).toBe('/deck')

    const confirmDelete = within(confirmation).getByRole('button', {
      name: 'Delete deck',
    })
    await user.click(confirmDelete)

    expect((confirmDelete as HTMLButtonElement).disabled).toBe(true)
    const cancel = within(confirmation).getByRole('button', { name: 'Cancel' })
    if (!(cancel instanceof HTMLButtonElement)) {
      throw new Error('The cancellation control is not a button')
    }
    expect(cancel.disabled).toBe(true)
    await user.click(confirmDelete)
    expect(boundaries.deleteCardGroup).toHaveBeenCalledTimes(2)

    deletion.resolve()
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    await waitFor(() => expect(boundaries.cardGroups).toHaveBeenCalledOnce())

    expect(
      boundaries.deleteCardGroup.mock.calls.map(([input]) => input),
    ).toEqual([
      { data: { dataGroupId: deckId } },
      { data: { dataGroupId: deckId } },
    ])
    expect(
      queryClient.getQueryData(notionKeys.cardGroups('registry-a')),
    ).toEqual([otherDeck])
    expect(
      queryClient.getQueryData(notionKeys.cardGroups('registry-b')),
    ).toEqual([thirdDeck])
    expect(
      queryClient.getQueryState(notionKeys.cardGroups('registry-b'))
        ?.isInvalidated,
    ).toBe(true)
    expect(queryClient.getQueryData(notionKeys.cardGroupConfig(deckId))).toBe(
      undefined,
    )
    expect(
      queryClient.getQueryData(notionKeys.cardGroupStudyData(deckId)),
    ).toBe(undefined)
    expect(
      queryClient.getQueryData(notionKeys.cardGroupConfig('deck-b')),
    ).toEqual({ id: 'deck-b' })
    expect(
      queryClient.getQueryData(notionKeys.dataset('source-a')),
    ).toMatchObject({ id: 'source-a' })
    expect(queryClient.getQueryData(['unrelated'])).toEqual({ keep: true })

    unsubscribe()
  })
})

it('edits saved bindings in separate sections and retains edits after a failed save', async () => {
  boundaries.updateCardGroup.mockRejectedValueOnce(
    new AppError('temporarily_unavailable'),
  )
  const { user, queryClient } = await renderDeckSettings()
  queryClient.setQueryData<CardGroups>(notionKeys.cardGroups('registry-a'), [
    targetDeck,
    otherDeck,
  ])
  await user.click(screen.getByRole('button', { name: 'Deck settings' }))
  const front = await screen.findByRole('region', { name: 'Front' })
  const back = screen.getByRole('region', { name: 'Back' })
  expect(
    within(front).getByRole('button', { name: 'Front field' }),
  ).toBeTruthy()
  expect(within(back).getByText('Empty side')).toBeTruthy()
  expect(
    screen.getByRole<HTMLButtonElement>('button', {
      name: 'Save configuration',
    }).disabled,
  ).toBe(true)
  const form = screen
    .getByRole('button', { name: 'Save configuration' })
    .closest('form')
  if (!form) throw new Error('Save configuration is not in a form')
  fireEvent.submit(form)
  expect(boundaries.updateCardGroup).not.toHaveBeenCalled()
  await user.click(within(back).getByRole('button', { name: 'Add field' }))
  const chooser = await screen.findByRole('dialog', { name: 'Choose fields' })
  for (const name of Object.values(NOKADDO_REVIEW_PROPERTIES)) {
    expect(within(chooser).queryByRole('button', { name })).toBeNull()
  }
  await user.click(within(chooser).getByRole('button', { name: 'Back field' }))
  await user.click(within(chooser).getByRole('button', { name: 'Done' }))
  expect(
    screen.getByRole<HTMLButtonElement>('button', {
      name: 'Save configuration',
    }).disabled,
  ).toBe(false)
  await user.click(
    within(back).getByRole('button', { name: 'Remove Back field field' }),
  )
  expect(
    screen.getByRole<HTMLButtonElement>('button', {
      name: 'Save configuration',
    }).disabled,
  ).toBe(true)
  await user.click(within(back).getByRole('button', { name: 'Add field' }))
  const restoredChooser = await screen.findByRole('dialog', {
    name: 'Choose fields',
  })
  await user.click(
    within(restoredChooser).getByRole('button', { name: 'Back field' }),
  )
  await user.click(
    within(restoredChooser).getByRole('button', { name: 'Done' }),
  )
  expect(
    screen.getByRole<HTMLButtonElement>('button', {
      name: 'Save configuration',
    }).disabled,
  ).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Save configuration' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(boundaries.updateCardGroup.mock.calls.at(-1)?.[0]).toEqual({
    data: {
      dataGroupId: deckId,
      groupingColumnId: null,
      frontColumnIds: ['front'],
      backColumnIds: ['back'],
    },
  })
  expect(within(back).getByRole('button', { name: 'Back field' })).toBeTruthy()
  const save = deferred<{ groupingColumnId: string | null }>()
  boundaries.updateCardGroup.mockReturnValueOnce(save.promise)
  await user.click(screen.getByRole('button', { name: 'Save configuration' }))
  expect(await screen.findByRole('button', { name: 'Saving…' })).toBeTruthy()
  save.resolve({ groupingColumnId: null })
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Deck settings' })).toBeNull(),
  )
})

it('keeps the editor open when study data cannot refresh after a successful save', async () => {
  boundaries.studyData.mockRejectedValueOnce(
    new AppError('temporarily_unavailable'),
  )
  const { user, router } = await renderDeckSettings()
  await user.click(screen.getByRole('button', { name: 'Deck settings' }))
  const back = await screen.findByRole('region', { name: 'Back' })
  await user.click(within(back).getByRole('button', { name: 'Add field' }))
  const chooser = await screen.findByRole('dialog', { name: 'Choose fields' })
  await user.click(within(chooser).getByRole('button', { name: 'Back field' }))
  await user.click(within(chooser).getByRole('button', { name: 'Done' }))
  await user.click(screen.getByRole('button', { name: 'Save configuration' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(screen.getByRole('dialog', { name: 'Deck settings' })).toBeTruthy()
  expect(router.state.location.pathname).toBe('/deck')
})

it.each([
  { grouped: true, destination: '/app/deck-a/study' },
  { grouped: false, destination: '/app/deck-a/groups' },
])(
  'navigates to $destination when changing grouping mode and refreshes inactive home data',
  async ({ grouped, destination }) => {
    const initial = {
      ...targetDeck,
      groupingColumnId: grouped ? 'front' : null,
      groupingColumnName: grouped ? 'Front field' : null,
    }
    boundaries.updateCardGroup.mockResolvedValue({
      groupingColumnId: grouped ? null : 'front',
    })
    const { user, router, queryClient, destinationLoads } =
      await renderDeckSettings(initial)
    boundaries.cardGroups.mockResolvedValue([initial, otherDeck])
    await queryClient.fetchQuery(notionQueries.cardGroups('registry-a'))
    boundaries.cardGroups.mockResolvedValue([
      {
        ...initial,
        groupingColumnId: grouped ? null : 'front',
        groupingColumnName: grouped ? null : 'Front field',
      },
      otherDeck,
    ])
    await user.click(screen.getByRole('button', { name: 'Deck settings' }))
    await screen.findByRole('region', { name: 'Front' })
    await user.click(
      screen.getByRole('radio', { name: grouped ? /Single Group/ : /^Groups/ }),
    )
    if (!grouped)
      await user.click(screen.getByRole('radio', { name: 'Front field' }))
    await user.click(screen.getByRole('button', { name: 'Save configuration' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(destination),
    )
    expect(
      queryClient.getQueryData<CardGroups>(
        notionKeys.cardGroups('registry-a'),
      )?.[0],
    ).toMatchObject({
      groupingColumnId: grouped ? null : 'front',
      groupingColumnName: grouped ? null : 'Front field',
    })
    expect(boundaries.cardGroups).toHaveBeenCalledTimes(2)
    expect(destinationLoads).toHaveBeenCalledOnce()
  },
)

describe('deck accessibility', () => {
  it.each([
    {
      label: 'zero total',
      total: 0,
      visited: 0,
      completed: 0,
      expectedVisitedRatio: 0,
      expectedCompletedRatio: 0,
    },
    {
      label: 'normal progress',
      total: 12,
      visited: 8,
      completed: 5,
      expectedVisitedRatio: 8 / 12,
      expectedCompletedRatio: 5 / 12,
    },
    {
      label: 'values above total',
      total: 3,
      visited: 7,
      completed: 5,
      expectedVisitedRatio: 1,
      expectedCompletedRatio: 1,
    },
  ])(
    'names and renders finite clamped progress for $label',
    ({
      total,
      visited,
      completed,
      expectedVisitedRatio,
      expectedCompletedRatio,
    }) => {
      const { container } = render(
        <StudyProgressChart
          total={total}
          visited={visited}
          completed={completed}
        />,
      )

      expect(
        screen.getByRole('img', {
          name: `${visited} of ${total} cards visited; ${completed} of ${total} learned`,
        }),
      ).toBeTruthy()
      const progressCircles = Array.from(
        container.querySelectorAll<SVGCircleElement>(
          'circle[stroke-dasharray][stroke-dashoffset]',
        ),
      )
      expect(progressCircles).toHaveLength(2)

      const [visitedCircle, completedCircle] = progressCircles
      expectProgressCircle(visitedCircle, expectedVisitedRatio)
      expectProgressCircle(completedCircle, expectedCompletedRatio)
    },
  )
})

function expectProgressCircle(
  circle: SVGCircleElement | undefined,
  expectedRatio: number,
) {
  if (!circle) throw new Error('Expected a rendered progress circle')

  const circumference = Number(circle.getAttribute('stroke-dasharray'))
  const dashOffset = Number(circle.getAttribute('stroke-dashoffset'))

  expect(Number.isFinite(circumference)).toBe(true)
  expect(Number.isFinite(dashOffset)).toBe(true)
  expect(circumference).toBeGreaterThan(0)
  expect(dashOffset).toBeCloseTo(circumference * (1 - expectedRatio))
}

async function renderDeckSettings(cardGroup: CardGroups[number] = targetDeck) {
  const queryClient = createTestQueryClient()
  const destinationLoads = vi.fn()
  const dataset = {
    id: 'source-a',
    properties: sourceDatasetProperties(),
  } as never
  queryClient.setQueryData(notionKeys.dataset(cardGroup.dataSetId), dataset)
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const deckRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/deck',
    component: () => (
      <DeckSettingsDrawer
        cardGroup={cardGroup}
        dataset={dataset}
        deckId={deckId}
        deckTitle="Languages"
      />
    ),
  })
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: () => <p>Home</p>,
  })
  const studyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app/$deckId/study',
    loader: destinationLoads,
    component: () => <p>Study destination</p>,
  })
  const groupsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app/$deckId/groups',
    loader: destinationLoads,
    component: () => <p>Groups destination</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      deckRoute,
      homeRoute,
      studyRoute,
      groupsRoute,
    ]),
    history: createMemoryHistory({ initialEntries: ['/deck'] }),
  })
  await router.load()
  const user = userEvent.setup()

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  return { queryClient, router, user, destinationLoads }
}

function sourceDatasetProperties() {
  return {
    Front: { id: 'front', name: 'Front field', type: 'title' },
    Back: { id: 'back', name: 'Back field', type: 'rich_text' },
    [NOKADDO_REVIEW_PROPERTIES.visited]: {
      id: 'visited',
      name: NOKADDO_REVIEW_PROPERTIES.visited,
      type: 'checkbox',
    },
    [NOKADDO_REVIEW_PROPERTIES.completed]: {
      id: 'completed',
      name: NOKADDO_REVIEW_PROPERTIES.completed,
      type: 'checkbox',
    },
    [NOKADDO_REVIEW_PROPERTIES.lastVisitedAt]: {
      id: 'last-visited',
      name: NOKADDO_REVIEW_PROPERTIES.lastVisitedAt,
      type: 'date',
    },
    [NOKADDO_REVIEW_PROPERTIES.completedAt]: {
      id: 'completed-at',
      name: NOKADDO_REVIEW_PROPERTIES.completedAt,
      type: 'date',
    },
  }
}

function deck(id: string, dataSetId: string) {
  return {
    id,
    dataSetId,
    datasetTitle: id,
    datasetIconUrl: null,
    groupingColumnName: null,
    groupingColumnId: null,
    groupKeys: [],
    frontColumnIds: ['front'],
    backColumnIds: [],
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}
