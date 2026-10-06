import { fireEvent, screen, waitFor } from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../../../../test/support/query-client'
import { renderWithQuery } from '../../../../test/support/render'
import DatasetConnection from './dataset-connection'
import { notionKeys } from '#/integrations/notion/api'
import type { NotionDataset } from '#/integrations/notion/api'

const boundaries = vi.hoisted(() => ({
  completeConnection: vi.fn(),
  datasetItems: vi.fn(),
  setWorkspaceAppDatasetId: vi.fn(),
}))

vi.mock('#/integrations/kv/workspace-registry-functions', () => ({
  getWorkspaceAppDatasetId: vi.fn(),
  setWorkspaceAppDatasetId: boundaries.setWorkspaceAppDatasetId,
}))

vi.mock('#/integrations/notion/dataset-functions', () => ({
  completeDatasetConnection: boundaries.completeConnection,
  getNotionDataset: vi.fn(),
  getNotionDatasetItems: boundaries.datasetItems,
}))

const dataset = {
  id: 'source-dataset',
  title: 'Language cards',
  description: 'A study source',
  icon: {
    type: 'external',
    external: { url: 'https://assets.example.test/language.png' },
  },
  iconUrl: 'https://assets.example.test/language.png',
  coverUrl: null,
  properties: {
    Prompt: { id: 'prompt-id', name: 'Prompt', type: 'title' },
    Answer: { id: 'answer-id', name: 'Answer', type: 'rich_text' },
    Category: { id: 'category-id', name: 'Category', type: 'select' },
    Formula: { id: 'formula-id', name: 'Formula', type: 'formula' },
    Tags: { id: 'tags-id', name: 'Tags', type: 'multi_select' },
  },
} as unknown as NotionDataset

function completedConnection(nokaddoDatasetId = 'registry-created') {
  return {
    nokaddoDatasetId,
    existingCardConfigurations: [],
    cardConfigurationId: 'deck-created',
  }
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

async function renderConnection({
  workspaceId = 'workspace-a',
  appDatasetId = null,
}: {
  workspaceId?: string
  appDatasetId?: string | null
} = {}) {
  const queryClient = createTestQueryClient()
  const rootRoute = createRootRoute({ component: Outlet })
  const connectRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/connect',
    component: () => (
      <DatasetConnection
        dataset={dataset}
        workspaceId={workspaceId}
        appDatasetId={appDatasetId}
      />
    ),
  })
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/app',
    component: () => <p>App destination</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([connectRoute, appRoute]),
    history: createMemoryHistory({ initialEntries: ['/connect'] }),
  })
  await router.load()

  return {
    ...renderWithQuery(<RouterProvider router={router} />, { queryClient }),
    queryClient,
    router,
  }
}

async function configureValidSingleFront(
  user: Awaited<ReturnType<typeof renderConnection>>['user'],
) {
  await user.click(screen.getByRole('radio', { name: /single group/i }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.click(screen.getByRole('button', { name: 'Add field' }))
  await user.click(screen.getByRole('button', { name: 'Prompt' }))
  await user.click(screen.getByRole('button', { name: 'Done' }))
  await waitFor(() =>
    expect(screen.queryByRole('heading', { name: 'Choose fields' })).toBeNull(),
  )
  await user.click(screen.getByRole('button', { name: 'Continue' }))

  return screen.getByRole('button', { name: 'Finish' })
}

beforeEach(() => {
  for (const boundary of Object.values(boundaries)) boundary.mockReset()

  boundaries.setWorkspaceAppDatasetId.mockImplementation(
    ({ data }: { data: { appDatasetId: string } }) =>
      Promise.resolve(data.appDatasetId),
  )
  boundaries.completeConnection.mockResolvedValue(completedConnection())
  boundaries.datasetItems.mockResolvedValue([])
  vi.stubGlobal('scrollTo', vi.fn())
})

describe('dataset connection steps and validation', () => {
  it('names mode and grouping controls and exposes selected step-tab state', async () => {
    const { user } = await renderConnection()
    const modeGroup = screen.getByRole('radiogroup', {
      name: 'Card structure',
    })
    const columnGroup = screen.getByRole('radiogroup', {
      name: 'Column to group by',
    })
    expect(columnGroup.className).toContain('max-h-full')
    expect(columnGroup.className).not.toContain('max-h-48')
    const connectionTab = screen.getByRole('tab', { name: 'Connection' })

    expect(modeGroup).toBeTruthy()
    expect(columnGroup).toBeTruthy()
    expect(
      screen
        .getByRole('radio', { name: /groups/i })
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      screen
        .getByRole('radio', { name: 'Prompt' })
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(screen.getByRole('radio', { name: 'Formula' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Tags' })).toBeNull()
    expect(connectionTab.getAttribute('aria-selected')).toBe('true')
    const connectionPanel = screen.getByRole('tabpanel')
    expect(connectionTab.getAttribute('aria-controls')).toBe(connectionPanel.id)
    expect(connectionPanel.getAttribute('aria-labelledby')).toBe(
      connectionTab.id,
    )
    for (const tab of screen.getAllByRole('tab')) {
      const panelId = tab.getAttribute('aria-controls')
      expect(panelId).toBeTruthy()
      expect(document.getElementById(panelId!)).toBeTruthy()
    }

    const singleMode = screen.getByRole('radio', { name: /single group/i })
    singleMode.focus()
    await user.keyboard('{Enter}')
    expect(
      screen.queryByRole('radiogroup', { name: 'Column to group by' }),
    ).toBeNull()
    expect(screen.getByText(/no grouping column required/i)).toBeTruthy()

    const customizerTab = screen.getByRole('tab', {
      name: 'Card customizer',
    })
    await user.click(customizerTab)
    expect(customizerTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      customizerTab.id,
    )
    await user.click(screen.getByRole('button', { name: 'Previous step' }))
    expect(connectionTab.getAttribute('aria-selected')).toBe('true')

    await user.click(customizerTab)

    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    const finish = screen.getByRole('button', { name: 'Finish' })
    expect((finish as HTMLButtonElement).disabled).toBe(true)
    await user.click(finish)
    expect(boundaries.completeConnection).not.toHaveBeenCalled()
  })

  it('submits source display/schema data with the workspace registry ID and blocks duplicates through success', async () => {
    const notionWrite = deferred<ReturnType<typeof completedConnection>>()
    boundaries.completeConnection.mockReturnValue(notionWrite.promise)
    const { queryClient, router, user } = await renderConnection({
      appDatasetId: 'registry-existing',
    })
    queryClient.setQueryData(notionKeys.cardGroups('registry-existing'), [])
    queryClient.setQueryData(
      notionKeys.availableDatasetPages('registry-existing'),
      { pageParams: [null], pages: [] },
    )
    const finish = await configureValidSingleFront(user)

    await user.click(finish)
    const saving = screen.getByRole('button', { name: 'Saving…' })
    expect((saving as HTMLButtonElement).disabled).toBe(true)
    await user.click(saving)
    expect(boundaries.completeConnection).toHaveBeenCalledOnce()
    expect(boundaries.completeConnection.mock.calls[0]?.[0]).toEqual({
      data: {
        dataSetId: 'source-dataset',
        datasetTitle: 'Language cards',
        datasetIcon: dataset.icon,
        groupingColumnName: null,
        groupingColumnId: null,
        frontColumnIds: ['prompt-id'],
        backColumnIds: [],
        nokaddoDatasetId: 'registry-existing',
      },
    })

    notionWrite.resolve(completedConnection('registry-existing'))
    await waitFor(() =>
      expect(boundaries.setWorkspaceAppDatasetId).toHaveBeenCalledWith({
        data: { appDatasetId: 'registry-existing' },
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    expect(
      queryClient.getQueryState(notionKeys.cardGroups('registry-existing'))
        ?.isInvalidated,
    ).toBe(true)
    expect(
      queryClient.getQueryState(
        notionKeys.availableDatasetPages('registry-existing'),
      )?.isInvalidated,
    ).toBe(true)
    expect(screen.queryByRole('button', { name: /finish|saved/i })).toBeNull()
    expect(boundaries.completeConnection).toHaveBeenCalledOnce()
  })

  it('submits a valid grouped configuration and permits the same field on both faces', async () => {
    const { router, user } = await renderConnection()

    await user.click(screen.getByRole('radio', { name: 'Category' }))
    await user.click(screen.getByRole('tab', { name: 'Card customizer' }))
    await user.click(screen.getByRole('button', { name: 'Add field' }))
    await user.click(screen.getByRole('button', { name: 'Prompt' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Choose fields' }),
      ).toBeNull(),
    )

    await user.click(screen.getByRole('button', { name: 'Flip' }))
    const surface = screen.getByRole('group', { name: 'Flashcard front' })
    fireEvent(surface, new Event('webkitAnimationEnd', { bubbles: true }))
    fireEvent(surface, new Event('webkitAnimationEnd', { bubbles: true }))
    await user.click(screen.getByRole('button', { name: 'Add field' }))
    await user.click(screen.getByRole('button', { name: 'Prompt' }))
    await user.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Choose fields' }),
      ).toBeNull(),
    )

    await user.click(screen.getByRole('tab', { name: 'Preview' }))
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    expect(boundaries.completeConnection.mock.calls[0]?.[0]).toEqual({
      data: {
        dataSetId: 'source-dataset',
        datasetTitle: 'Language cards',
        datasetIcon: dataset.icon,
        groupingColumnName: 'Category',
        groupingColumnId: 'category-id',
        frontColumnIds: ['prompt-id'],
        backColumnIds: ['prompt-id'],
        nokaddoDatasetId: null,
      },
    })
  })

  it('uses buttons rather than form submission to advance wizard steps', async () => {
    const { user } = await renderConnection()
    const firstContinue = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Continue',
    })
    const form = firstContinue.closest('form')!
    const submit = vi.fn((event: SubmitEvent) => event.preventDefault())
    form.addEventListener('submit', submit)

    expect(firstContinue.type).toBe('button')
    await user.click(firstContinue)
    expect(submit).not.toHaveBeenCalled()
    expect(boundaries.completeConnection).not.toHaveBeenCalled()

    const secondContinue = screen.getByRole<HTMLButtonElement>('button', {
      name: 'Continue',
    })
    expect(secondContinue.type).toBe('button')
    await user.click(secondContinue)

    expect(submit).not.toHaveBeenCalled()
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Finish' }).type,
    ).toBe('submit')
    expect(boundaries.completeConnection).not.toHaveBeenCalled()
  })
})

describe('dataset connection recovery', () => {
  it('retries a failed Notion mutation and persists only its successful result', async () => {
    boundaries.completeConnection
      .mockRejectedValueOnce(new Error('SENTINEL Notion unavailable'))
      .mockResolvedValueOnce(completedConnection())
    const { router, user } = await renderConnection()
    const finish = await configureValidSingleFront(user)

    await user.click(finish)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.queryByText(/SENTINEL/i)).toBeNull()
    expect(boundaries.completeConnection).toHaveBeenCalledOnce()
    expect(boundaries.setWorkspaceAppDatasetId).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    expect(boundaries.completeConnection).toHaveBeenCalledTimes(2)
    expect(boundaries.setWorkspaceAppDatasetId).toHaveBeenCalledOnce()
  })

  it('retains Notion success across registry-write failure and retries only persistence', async () => {
    boundaries.completeConnection.mockResolvedValueOnce(
      completedConnection('registry-from-remote'),
    )
    boundaries.setWorkspaceAppDatasetId
      .mockRejectedValueOnce(new Error('SENTINEL registry write failed'))
      .mockResolvedValueOnce('registry-from-remote')
    const { router, user } = await renderConnection()
    const finish = await configureValidSingleFront(user)

    await user.click(finish)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.queryByText(/SENTINEL/i)).toBeNull()
    expect(boundaries.completeConnection).toHaveBeenCalledOnce()
    expect(boundaries.setWorkspaceAppDatasetId).toHaveBeenCalledOnce()
    expect(router.state.location.pathname).toBe('/connect')

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
    expect(boundaries.completeConnection).toHaveBeenCalledOnce()
    expect(boundaries.setWorkspaceAppDatasetId).toHaveBeenCalledTimes(2)
    expect(boundaries.setWorkspaceAppDatasetId).toHaveBeenLastCalledWith({
      data: { appDatasetId: 'registry-from-remote' },
    })
  })

  it('prevents duplicate submission while registry persistence is pending', async () => {
    const registryWrite = deferred<string>()
    boundaries.setWorkspaceAppDatasetId.mockReturnValueOnce(
      registryWrite.promise,
    )
    const { router, user } = await renderConnection()
    const finish = await configureValidSingleFront(user)

    await user.click(finish)
    const saving = await screen.findByRole('button', { name: 'Saving…' })
    await waitFor(() =>
      expect(boundaries.setWorkspaceAppDatasetId).toHaveBeenCalledOnce(),
    )
    expect((saving as HTMLButtonElement).disabled).toBe(true)

    await user.click(saving)
    expect(boundaries.completeConnection).toHaveBeenCalledOnce()
    expect(boundaries.setWorkspaceAppDatasetId).toHaveBeenCalledOnce()
    expect(router.state.location.pathname).toBe('/connect')

    registryWrite.resolve('registry-created')
    await waitFor(() => expect(router.state.location.pathname).toBe('/app'))
  })
})
