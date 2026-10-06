import { InfiniteQueryObserver } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notionKeys, notionQueries } from './api'
import { createTestQueryClient } from '../../../test/support/query-client'

const boundaries = vi.hoisted(() => ({
  getAvailableDatasets: vi.fn(),
  getNotionDatasetItems: vi.fn(),
}))

vi.mock('./auth-functions', () => ({
  disconnectNotion: vi.fn(),
  getAvailableDatasets: boundaries.getAvailableDatasets,
  getNotionViewer: vi.fn(),
  reauthorizeNotion: vi.fn(),
}))

vi.mock('./dataset-functions', () => ({
  completeDatasetConnection: vi.fn(),
  getNotionDataset: vi.fn(),
  getNotionDatasetItems: boundaries.getNotionDatasetItems,
}))

vi.mock('./card-functions', () => ({
  deleteCardGroup: vi.fn(),
  getCardGroupConfig: vi.fn(),
  getCardGroups: vi.fn(),
  getCardGroupStudyData: vi.fn(),
}))

beforeEach(() => {
  boundaries.getAvailableDatasets.mockReset()
  boundaries.getNotionDatasetItems.mockReset()
})

describe('Notion query contracts', () => {
  it('keeps every query key stable, hierarchical, parameter-complete, and distinct', () => {
    const itemOptions = {
      limit: 10,
      fields: [{ id: 'title-id', type: 'title' }],
      requirePopulatedField: true,
    }
    const keys = [
      notionKeys.viewer,
      notionKeys.availableDatasets('registry-id'),
      notionKeys.availableDatasetPages('registry-id'),
      notionKeys.cardGroups('registry-id'),
      notionKeys.cardGroupConfig('deck-id'),
      notionKeys.cardGroupStudyData('deck-id'),
      notionKeys.dataset('dataset-id'),
      notionKeys.datasetItems('dataset-id', itemOptions),
      notionKeys.datasetPreviewItem('dataset-id', itemOptions.fields),
    ]

    expect(notionKeys.cardGroups('registry-id')).toEqual([
      ...notionKeys.cardGroupsAll,
      'registry-id',
    ])
    expect(notionKeys.datasetItems('dataset-id', itemOptions)).toEqual([
      ...notionKeys.dataset('dataset-id'),
      'items',
      itemOptions,
    ])
    expect(
      notionKeys.datasetPreviewItem('dataset-id', itemOptions.fields),
    ).toEqual([
      ...notionKeys.dataset('dataset-id'),
      'preview-item',
      4,
      itemOptions.fields,
    ])
    expect(keys.map((key) => key[0])).toEqual(keys.map(() => 'notion'))
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(
      keys.length,
    )
    expect(notionKeys.datasetItems('dataset-id', itemOptions)).toEqual(
      notionKeys.datasetItems('dataset-id', { ...itemOptions }),
    )

    expect(notionKeys.availableDatasets(null)).not.toEqual(
      notionKeys.availableDatasets('registry-id'),
    )
    expect(notionKeys.availableDatasetPages(null)).not.toEqual(
      notionKeys.availableDatasetPages('registry-id'),
    )
    expect(notionKeys.cardGroups('other-registry')).not.toEqual(
      notionKeys.cardGroups('registry-id'),
    )
    expect(notionKeys.cardGroupConfig('other-deck')).not.toEqual(
      notionKeys.cardGroupConfig('deck-id'),
    )
    expect(notionKeys.cardGroupStudyData('other-deck')).not.toEqual(
      notionKeys.cardGroupStudyData('deck-id'),
    )
    expect(notionKeys.dataset('other-dataset')).not.toEqual(
      notionKeys.dataset('dataset-id'),
    )
    expect(notionKeys.datasetItems('other-dataset', itemOptions)).not.toEqual(
      notionKeys.datasetItems('dataset-id', itemOptions),
    )
    expect(
      notionKeys.datasetItems('dataset-id', { ...itemOptions, limit: 11 }),
    ).not.toEqual(notionKeys.datasetItems('dataset-id', itemOptions))
    expect(
      notionKeys.datasetItems('dataset-id', {
        ...itemOptions,
        fields: [{ id: 'summary-id', type: 'rich_text' }],
      }),
    ).not.toEqual(notionKeys.datasetItems('dataset-id', itemOptions))
    expect(
      notionKeys.datasetItems('dataset-id', {
        ...itemOptions,
        requirePopulatedField: false,
      }),
    ).not.toEqual(notionKeys.datasetItems('dataset-id', itemOptions))
    expect(
      notionKeys.datasetPreviewItem('dataset-id', [
        { id: 'summary-id', type: 'rich_text' },
      ]),
    ).not.toEqual(
      notionKeys.datasetPreviewItem('dataset-id', itemOptions.fields),
    )
    expect(
      notionKeys.datasetPreviewItem('other-dataset', itemOptions.fields),
    ).not.toEqual(
      notionKeys.datasetPreviewItem('dataset-id', itemOptions.fields),
    )

    expect(
      notionQueries.datasetItems('dataset-id', { limit: 10 }).queryKey,
    ).toEqual(
      notionKeys.datasetItems('dataset-id', {
        limit: 10,
        fields: [],
        requirePopulatedField: false,
      }),
    )
  })

  it('disables automatic retry for every production query and stops cursor pagination at null', () => {
    const fields = [{ id: 'title-id', type: 'title' }]
    const discovery = notionQueries.availableDatasetPages('registry-id')
    const queries = [
      notionQueries.viewer(),
      notionQueries.availableDatasets('registry-id'),
      discovery,
      notionQueries.cardGroups('registry-id'),
      notionQueries.dataset('dataset-id'),
      notionQueries.datasetItems('dataset-id', {
        limit: 10,
        fields,
        requirePopulatedField: true,
      }),
      notionQueries.datasetPreviewItem('dataset-id', fields),
      notionQueries.getCardGroupConfig('deck-id'),
      notionQueries.cardGroupStudyData('deck-id'),
    ]

    for (const query of queries) expect(query.retry).toBe(false)

    expect(discovery.initialPageParam).toBeNull()
    expect(
      discovery.getNextPageParam(
        { datasets: [], nextCursor: 'cursor-2' },
        [],
        null,
        [],
      ),
    ).toBe('cursor-2')
    expect(
      discovery.getNextPageParam(
        { datasets: [], nextCursor: null },
        [],
        'cursor-2',
        [],
      ),
    ).toBeUndefined()
  })

  it('requests one populated preview item with the configured fields and returns the first row or null', async () => {
    const fields = [
      { id: 'title-id', type: 'title' },
      { id: 'summary-id', type: 'rich_text' },
    ]
    const firstRow = { id: 'first-row', properties: [] }
    const secondRow = { id: 'second-row', properties: [] }
    const queryClient = createTestQueryClient()
    boundaries.getNotionDatasetItems
      .mockResolvedValueOnce([firstRow, secondRow])
      .mockResolvedValueOnce([])

    await expect(
      queryClient.fetchQuery(
        notionQueries.datasetPreviewItem('dataset-id', fields),
      ),
    ).resolves.toEqual(firstRow)
    expect(boundaries.getNotionDatasetItems).toHaveBeenNthCalledWith(1, {
      data: {
        dataSetId: 'dataset-id',
        limit: 1,
        fields,
        requirePopulatedField: true,
      },
    })

    queryClient.clear()
    await expect(
      queryClient.fetchQuery(
        notionQueries.datasetPreviewItem('dataset-id', fields),
      ),
    ).resolves.toBeNull()
    expect(boundaries.getNotionDatasetItems).toHaveBeenCalledTimes(2)
  })
})

describe('paginated dataset discovery', () => {
  it('preserves earlier pages when a later page fails and retries that cursor', async () => {
    boundaries.getAvailableDatasets.mockImplementation(
      async ({ data }: { data: { cursor: string | null } }) => {
        if (data.cursor === null) {
          return { datasets: [dataset('first')], nextCursor: 'cursor-2' }
        }
        if (boundaries.getAvailableDatasets.mock.calls.length === 2) {
          throw new Error('later page failed')
        }
        return { datasets: [dataset('second')], nextCursor: null }
      },
    )
    const queryClient = createTestQueryClient()
    const observer = new InfiniteQueryObserver(
      queryClient,
      notionQueries.availableDatasetPages('configuration-id'),
    )
    const unsubscribe = observer.subscribe(() => undefined)

    await observer.refetch()
    const failedResult = await observer.fetchNextPage()

    expect(failedResult.data?.pages).toEqual([
      { datasets: [dataset('first')], nextCursor: 'cursor-2' },
    ])
    expect(failedResult.isFetchNextPageError).toBe(true)

    const recoveredResult = await observer.fetchNextPage()
    expect(recoveredResult.data?.pages).toEqual([
      { datasets: [dataset('first')], nextCursor: 'cursor-2' },
      { datasets: [dataset('second')], nextCursor: null },
    ])
    expect(
      boundaries.getAvailableDatasets.mock.calls.map(([input]) => input),
    ).toEqual([
      { data: { excludedDatasetId: 'configuration-id', cursor: null } },
      { data: { excludedDatasetId: 'configuration-id', cursor: 'cursor-2' } },
      { data: { excludedDatasetId: 'configuration-id', cursor: 'cursor-2' } },
    ])

    unsubscribe()
  })

  it('does not issue duplicate concurrent next-page requests', async () => {
    const pending = deferred<{
      datasets: ReturnType<typeof dataset>[]
      nextCursor: null
    }>()
    boundaries.getAvailableDatasets.mockImplementation(
      ({ data }: { data: { cursor: string | null } }) =>
        data.cursor === null
          ? Promise.resolve({
              datasets: [dataset('first')],
              nextCursor: 'cursor-2',
            })
          : pending.promise,
    )
    const queryClient = createTestQueryClient()
    const observer = new InfiniteQueryObserver(
      queryClient,
      notionQueries.availableDatasetPages(null),
    )
    const unsubscribe = observer.subscribe(() => undefined)
    await observer.refetch()

    const firstRequest = observer.fetchNextPage()
    const duplicateRequest = observer.fetchNextPage()
    await vi.waitFor(() => {
      expect(boundaries.getAvailableDatasets).toHaveBeenCalledTimes(2)
    })
    pending.resolve({ datasets: [dataset('second')], nextCursor: null })

    const [firstResult, duplicateResult] = await Promise.all([
      firstRequest,
      duplicateRequest,
    ])
    expect(firstResult.data).toEqual(duplicateResult.data)
    expect(boundaries.getAvailableDatasets).toHaveBeenCalledTimes(2)

    unsubscribe()
  })
})

function dataset(id: string) {
  return {
    id,
    title: id,
    description: undefined,
    iconUrl: undefined,
    coverUrl: undefined,
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}
