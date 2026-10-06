import { QueryClientProvider } from '@tanstack/react-query'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import DeckConfigurationEditor from './deck-configuration-editor'
import { createTestQueryClient } from '../../../../test/support/query-client'
import type { CardGroups } from '#/integrations/notion/api'
import { NOKADDO_REVIEW_PROPERTIES } from '#/integrations/notion/review-property-validators'
import { AppError } from '#/lib/errors'

const boundaries = vi.hoisted(() => ({
  updateCardGroup: vi.fn(),
  studyData: vi.fn(),
}))

vi.mock('#/integrations/notion/auth-functions', () => ({
  disconnectNotion: vi.fn(),
  getAvailableDatasets: vi.fn(),
  getNotionViewer: vi.fn(),
  reauthorizeNotion: vi.fn(),
}))

vi.mock('#/integrations/notion/card-functions', () => ({
  deleteCardGroup: vi.fn(),
  updateCardGroup: boundaries.updateCardGroup,
  getCardGroupConfig: vi.fn(),
  getCardGroups: vi.fn(),
  getCardGroupStudyData: boundaries.studyData,
}))

vi.mock('#/integrations/notion/dataset-functions', () => ({
  completeDatasetConnection: vi.fn(),
  getNotionDataset: vi.fn(),
  getNotionDatasetItems: vi.fn(),
}))

const cardGroup: CardGroups[number] = {
  id: 'deck-a',
  dataSetId: 'source-a',
  datasetTitle: 'Languages',
  datasetIconUrl: null,
  groupingColumnName: null,
  groupingColumnId: null,
  groupKeys: [],
  frontColumnIds: ['front'],
  backColumnIds: [],
}

const dataset = {
  id: 'source-a',
  properties: {
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
  },
} as never

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  boundaries.updateCardGroup.mockResolvedValue({ groupingColumnId: null })
  boundaries.studyData.mockResolvedValue({ deckConfig: {} })
})

it('hides review columns, keeps a failed save visible, and closes only after refresh succeeds', async () => {
  const onSaved = vi.fn()
  boundaries.updateCardGroup.mockRejectedValueOnce(
    new AppError('temporarily_unavailable'),
  )
  boundaries.studyData.mockRejectedValueOnce(
    new AppError('temporarily_unavailable'),
  )
  const { user } = await renderEditor(onSaved)

  expect(
    screen.getByRole<HTMLButtonElement>('button', {
      name: 'Save configuration',
    }).disabled,
  ).toBe(true)

  const back = screen.getByRole('region', { name: 'Back' })
  await user.click(within(back).getByRole('button', { name: 'Add field' }))
  const chooser = await screen.findByRole('dialog', { name: 'Choose fields' })
  for (const name of Object.values(NOKADDO_REVIEW_PROPERTIES)) {
    expect(within(chooser).queryByRole('button', { name })).toBeNull()
  }
  await user.click(within(chooser).getByRole('button', { name: 'Back field' }))
  await user.click(within(chooser).getByRole('button', { name: 'Done' }))

  await user.click(screen.getByRole('button', { name: 'Save configuration' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(onSaved).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Save configuration' }))
  expect(await screen.findByRole('alert')).toBeTruthy()
  expect(onSaved).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'Save configuration' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
})

it('navigates to groups after saving a newly selected grouping column', async () => {
  const onSaved = vi.fn()
  boundaries.updateCardGroup.mockResolvedValue({ groupingColumnId: 'front' })
  const { user, router } = await renderEditor(onSaved)

  await user.click(screen.getByRole('radio', { name: /^Groups/ }))
  await user.click(screen.getByRole('radio', { name: 'Front field' }))
  await user.click(screen.getByRole('button', { name: 'Save configuration' }))

  await waitFor(() =>
    expect(router.state.location.pathname).toBe('/app/deck-a/groups'),
  )
  expect(onSaved).toHaveBeenCalledOnce()
})

async function renderEditor(onSaved: () => void) {
  const queryClient = createTestQueryClient()
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const editorRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/deck',
    component: () => (
      <DeckConfigurationEditor
        cardGroup={cardGroup}
        dataset={dataset}
        onSaved={onSaved}
      />
    ),
  })
  const studyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app/$deckId/study',
    component: () => <p>Study destination</p>,
  })
  const groupsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app/$deckId/groups',
    component: () => <p>Groups destination</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([editorRoute, studyRoute, groupsRoute]),
    history: createMemoryHistory({ initialEntries: ['/deck'] }),
  })
  await router.load()
  const user = userEvent.setup()

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )

  await screen.findByRole('region', { name: 'Front' })
  return { queryClient, router, user }
}
