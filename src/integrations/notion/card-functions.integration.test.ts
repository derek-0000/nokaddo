import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  Client,
  DataSourceObjectResponse,
  PageObjectResponse,
  QueryDataSourceResponse,
  RichTextItemResponse,
} from '@notionhq/client'
import type * as ClientServerModule from './client-server'
import {
  deleteCardGroup,
  updateCardGroup,
  getCardGroupConfig,
  getCardGroups,
  getCardGroupStudyData,
  setCardGroups,
} from './card-functions'
import { saveStudyProgress, validateStudyWindowInput } from './study-functions'
import { notionStudySource } from './study-source'
import { buildNotionClientDouble } from '../../../test/fixtures/notion-client'
import { AppError } from '#/lib/errors'

const notionBoundary = vi.hoisted(() => ({
  dataSourcesQuery: vi.fn<Client['dataSources']['query']>(),
  dataSourcesRetrieve: vi.fn<Client['dataSources']['retrieve']>(),
  dataSourcesUpdate: vi.fn<Client['dataSources']['update']>(),
  pagesRetrieve: vi.fn<Client['pages']['retrieve']>(),
  pagesUpdate: vi.fn<Client['pages']['update']>(),
  withNotionClient: vi.fn<typeof ClientServerModule.withNotionClient>(),
}))
const serverFnMethods = vi.hoisted(() => [] as Array<string>)

vi.mock('@tanstack/react-start', () => ({
  createServerFn: ({ method }: { method: string }) => {
    serverFnMethods.push(method)
    let validate = (data: unknown) => data
    const builder = {
      validator: (next: (data: unknown) => unknown) => {
        validate = next
        return builder
      },
      handler:
        (handler: (context: { data: never }) => unknown) =>
        (context: { data: unknown }) =>
          handler({ data: validate(context.data) as never }),
    }

    return builder
  },
}))

vi.mock('./client-server', () => ({
  withNotionClient: notionBoundary.withNotionClient,
}))

beforeEach(() => {
  for (const boundary of Object.values(notionBoundary)) {
    boundary.mockReset()
  }

  notionBoundary.withNotionClient.mockImplementation(async (request) =>
    request(notionClient()),
  )
  notionBoundary.pagesUpdate.mockResolvedValue({} as never)
  notionBoundary.dataSourcesUpdate.mockResolvedValue({} as never)
})

it('uses POST for study loading because live group reconciliation may write, and GET for read-only study windows', () => {
  expect(serverFnMethods).toEqual([
    'GET',
    'GET',
    'POST',
    'POST',
    'POST',
    'GET',
    'POST',
  ])
})

describe('card-group retrieval', () => {
  it('reads the workspace configuration source and returns only full valid configurations', async () => {
    notionBoundary.dataSourcesQuery
      .mockResolvedValueOnce(
        queryResponse(
          [
            configurationPage('deck-1'),
            partialPage('partial-deck'),
            configurationPage('wrong-schema', {
              ...configurationProperties(),
              group_keys: pageProperty('title', [], 'group-keys-id'),
            }),
          ],
          'page-2',
        ),
      )
      .mockResolvedValueOnce(queryResponse([configurationPage('deck-2')]))

    await expect(
      getCardGroups({ data: { dataSetId: 'workspace-config-id' } }),
    ).resolves.toEqual(
      ['deck-1', 'deck-2'].map((id) => ({
        id,
        dataSetId: 'source-id',
        datasetTitle: 'Biology',
        datasetIconUrl: null,
        groupingColumnName: 'Category',
        groupingColumnId: 'category-id',
        groupKeys: ['Biology'],
        frontColumnIds: ['front-id'],
        backColumnIds: ['back-id'],
      })),
    )
    expect(notionBoundary.dataSourcesQuery).toHaveBeenNthCalledWith(1, {
      data_source_id: 'workspace-config-id',
      result_type: 'page',
      start_cursor: undefined,
    })
    expect(notionBoundary.dataSourcesQuery).toHaveBeenNthCalledWith(2, {
      data_source_id: 'workspace-config-id',
      result_type: 'page',
      start_cursor: 'page-2',
    })
  })

  it('requires a full configuration page with the final property schema', async () => {
    notionBoundary.pagesRetrieve.mockResolvedValueOnce(
      configurationPage('deck-1'),
    )

    await expect(
      getCardGroupConfig({ data: { dataGroupId: 'deck-1' } }),
    ).resolves.toEqual(configurationProperties())

    notionBoundary.pagesRetrieve.mockResolvedValueOnce(
      partialPage('partial-deck'),
    )
    await expect(
      getCardGroupConfig({ data: { dataGroupId: 'partial-deck' } }),
    ).rejects.toThrow('configuration page could not be retrieved')

    notionBoundary.pagesRetrieve.mockResolvedValueOnce(
      configurationPage('missing-schema', {
        ...configurationProperties(),
        group_keys: undefined,
      } as never),
    )
    await expect(
      getCardGroupConfig({ data: { dataGroupId: 'missing-schema' } }),
    ).rejects.toThrow(/missing.*group_keys/)

    notionBoundary.pagesRetrieve.mockResolvedValueOnce(
      configurationPage('wrong-schema', {
        ...configurationProperties(),
        group_keys: pageProperty('title', [], 'group-keys-id'),
      }),
    )
    await expect(
      getCardGroupConfig({ data: { dataGroupId: 'wrong-schema' } }),
    ).rejects.toThrow(/group_keys.*rich_text.*title/)
  })
})

describe('editing a card group', () => {
  it('updates the existing configuration and clears categories for single mode without touching progress', async () => {
    notionBoundary.pagesRetrieve.mockResolvedValue(configurationPage('deck-1'))
    notionBoundary.dataSourcesRetrieve.mockResolvedValue(
      sourceDataset({ New: schemaProperty('title', 'new-id') }),
    )
    await updateCardGroup({
      data: {
        dataGroupId: 'deck-1',
        groupingColumnId: null,
        frontColumnIds: ['new-id'],
        backColumnIds: [],
      },
    })
    expect(notionBoundary.pagesUpdate).toHaveBeenCalledExactlyOnceWith({
      page_id: 'deck-1',
      properties: {
        grouper_column: { title: [] },
        grouper_column_id: { rich_text: [] },
        group_keys: { rich_text: [{ type: 'text', text: { content: '[]' } }] },
        front: {
          rich_text: [{ type: 'text', text: { content: '["new-id"]' } }],
        },
        back: { rich_text: [{ type: 'text', text: { content: '[]' } }] },
      },
    })
  })
  it('rebuilds categories from the newly selected grouping column', async () => {
    notionBoundary.pagesRetrieve.mockResolvedValue(configurationPage('deck-1'))
    notionBoundary.dataSourcesRetrieve.mockResolvedValue(
      sourceDataset({
        New: {
          id: 'new-id',
          name: 'New',
          description: null,
          type: 'title',
          title: {},
        },
      }),
    )
    notionBoundary.dataSourcesQuery.mockResolvedValue(
      queryResponse([
        notionPage('row', {
          New: pageProperty('title', richText('New category'), 'new-id'),
        }),
      ]),
    )
    await updateCardGroup({
      data: {
        dataGroupId: 'deck-1',
        groupingColumnId: 'new-id',
        frontColumnIds: ['new-id'],
        backColumnIds: [],
      },
    })
    expect(notionBoundary.pagesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        page_id: 'deck-1',
        properties: expect.objectContaining({
          grouper_column: {
            title: [{ type: 'text', text: { content: 'New' } }],
          },
          group_keys: {
            rich_text: [
              { type: 'text', text: { content: '["New category"]' } },
            ],
          },
        }),
      }),
    )
  })
  it('keeps stored categories when only face bindings change', async () => {
    notionBoundary.pagesRetrieve.mockResolvedValue(configurationPage('deck-1'))
    notionBoundary.dataSourcesRetrieve.mockResolvedValue(
      sourceDataset({
        Category: {
          id: 'category-id',
          name: 'Category',
          description: null,
          type: 'select',
          select: { options: [] },
        },
        New: {
          id: 'new-id',
          name: 'New',
          description: null,
          type: 'title',
          title: {},
        },
      }),
    )
    await updateCardGroup({
      data: {
        dataGroupId: 'deck-1',
        groupingColumnId: 'category-id',
        frontColumnIds: ['new-id'],
        backColumnIds: [],
      },
    })
    expect(notionBoundary.dataSourcesQuery).not.toHaveBeenCalled()
    expect(notionBoundary.pagesUpdate).toHaveBeenCalledExactlyOnceWith({
      page_id: 'deck-1',
      properties: {
        grouper_column: {
          title: [{ type: 'text', text: { content: 'Category' } }],
        },
        grouper_column_id: {
          rich_text: [{ type: 'text', text: { content: 'category-id' } }],
        },
        group_keys: {
          rich_text: [{ type: 'text', text: { content: '["Biology"]' } }],
        },
        front: {
          rich_text: [{ type: 'text', text: { content: '["new-id"]' } }],
        },
        back: { rich_text: [{ type: 'text', text: { content: '[]' } }] },
      },
    })
  })
  it('rejects missing source columns before writing', async () => {
    notionBoundary.pagesRetrieve.mockResolvedValue(configurationPage('deck-1'))
    notionBoundary.dataSourcesRetrieve.mockResolvedValue(sourceDataset({}))
    await expect(
      updateCardGroup({
        data: {
          dataGroupId: 'deck-1',
          groupingColumnId: null,
          frontColumnIds: ['missing'],
          backColumnIds: [],
        },
      }),
    ).rejects.toThrow()
    expect(notionBoundary.pagesUpdate).not.toHaveBeenCalled()
  })
})

describe('group scanning', () => {
  it('requests only the resolved source property and extracts distinct supported values from full rows', async () => {
    notionBoundary.dataSourcesRetrieve.mockResolvedValue(
      sourceDataset({ Category: schemaProperty('select', 'category-id') }),
    )
    notionBoundary.dataSourcesQuery.mockResolvedValue(
      queryResponse([
        partialPage('partial'),
        notionPage('missing-property', {}),
        notionPage('select', {
          Category: pageProperty('select', { name: 'Biology' }, 'category-id'),
        }),
        notionPage('rich-text', {
          Category: pageProperty(
            'rich_text',
            [...richText('World '), ...richText('History')],
            'category-id',
          ),
        }),
        notionPage('title', {
          Category: pageProperty(
            'title',
            [...richText('Cell '), ...richText('Biology')],
            'category-id',
          ),
        }),
        notionPage('status', {
          Category: pageProperty('status', { name: 'Ready' }, 'category-id'),
        }),
        notionPage(
          'inherited-row-property',
          inheritedRecord({
            Category: pageProperty(
              'select',
              { name: 'INHERITED_ROW_SENTINEL' },
              'category-id',
            ),
          }) as PageObjectResponse['properties'],
        ),
        notionPage('inherited-value-field', {
          Category: pageProperty(
            'select',
            inheritedRecord({ name: 'INHERITED_VALUE_SENTINEL' }),
            'category-id',
          ),
        }),
      ]),
    )

    await expect(
      setCardGroups(notionClient(), {
        dataSetId: 'source-id',
        groupingColumnName: 'Category',
        groupingColumnId: 'category-id',
      }),
    ).resolves.toEqual(['Biology', 'Cell Biology', 'Ready', 'World History'])
    expect(notionBoundary.dataSourcesQuery).toHaveBeenCalledWith({
      data_source_id: 'source-id',
      filter_properties: ['category-id'],
      result_type: 'page',
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      filter: undefined,
      start_cursor: undefined,
    })
  })

  it('accepts string formula groups and rejects other result types', async () => {
    notionBoundary.dataSourcesRetrieve.mockResolvedValue(
      sourceDataset({ Formula: schemaProperty('formula', 'formula-id') }),
    )
    notionBoundary.dataSourcesQuery.mockResolvedValue(
      queryResponse([
        notionPage('formula', {
          Formula: pageProperty(
            'formula',
            { type: 'string', string: 'Biology' },
            'formula-id',
          ),
        }),
        notionPage('empty-formula', {
          Formula: pageProperty(
            'formula',
            { type: 'string', string: null },
            'formula-id',
          ),
        }),
      ]),
    )

    await expect(
      setCardGroups(notionClient(), {
        dataSetId: 'source-id',
        groupingColumnName: 'Formula',
        groupingColumnId: 'formula-id',
      }),
    ).resolves.toEqual(['Biology'])

    notionBoundary.dataSourcesQuery.mockResolvedValue(
      queryResponse([
        notionPage('number-formula', {
          Formula: pageProperty(
            'formula',
            { type: 'number', number: 3 },
            'formula-id',
          ),
        }),
      ]),
    )

    await expect(
      setCardGroups(notionClient(), {
        dataSetId: 'source-id',
        groupingColumnName: 'Formula',
        groupingColumnId: 'formula-id',
      }),
    ).rejects.toThrowError(
      expect.objectContaining({ code: 'validation' }) as AppError,
    )
  })

  it.each([
    [
      'source property schema',
      { object: 'data_source', id: 'source-id' } as never,
    ],
    ['grouping column', sourceDataset({})],
    [
      'own grouping column',
      sourceDataset(
        inheritedRecord({
          Category: schemaProperty('select', 'inherited-category-id'),
        }) as DataSourceObjectResponse['properties'],
      ),
    ],
  ])('fails for a missing %s before scanning', async (_case, source) => {
    notionBoundary.dataSourcesRetrieve.mockResolvedValue(source)

    await expect(
      setCardGroups(notionClient(), {
        dataSetId: 'source-id',
        groupingColumnName: 'Category',
        groupingColumnId: 'category-id',
      }),
    ).rejects.toThrow()
    expect(notionBoundary.dataSourcesQuery).not.toHaveBeenCalled()
  })

  it('falls back to the stable property ID after the grouping column is renamed', async () => {
    notionBoundary.dataSourcesRetrieve.mockResolvedValue(
      sourceDataset({ Subject: schemaProperty('select', 'category-id') }),
    )
    notionBoundary.dataSourcesQuery.mockResolvedValue(
      queryResponse([
        notionPage('renamed', {
          Subject: pageProperty('select', { name: 'Biology' }, 'category-id'),
        }),
      ]),
    )

    await expect(
      setCardGroups(notionClient(), {
        dataSetId: 'source-id',
        groupingColumnName: 'Category',
        groupingColumnId: 'category-id',
      }),
    ).resolves.toEqual(['Biology'])
  })
})

describe('study-data loading', () => {
  it('performs one paginated full scan and returns normalized overall, category, and live-group data', async () => {
    notionBoundary.pagesRetrieve.mockResolvedValue(
      configurationPage(
        'deck-1',
        configurationProperties({
          groupKeys: ['Chemistry', 'Biology'],
        }),
      ),
    )
    notionBoundary.dataSourcesRetrieve.mockResolvedValue(reviewDataset())
    notionBoundary.dataSourcesQuery
      .mockResolvedValueOnce(
        queryResponse(
          [
            studyPage('card-1', {
              visited: false,
              completed: true,
              groups: ['Biology'],
            }),
            partialPage('partial-card'),
          ],
          'page-2',
        ),
      )
      .mockResolvedValueOnce(
        queryResponse([
          studyPage('card-2', {
            visited: true,
            completed: false,
            groups: ['Chemistry'],
          }),
        ]),
      )

    const result = await getCardGroupStudyData({
      data: { dataGroupId: 'deck-1' },
    })

    expect(result.groupKeys).toEqual(['Biology', 'Chemistry'])
    expect(result.groupingColumnType).toBe('select')
    expect(result.categoryStats).toEqual({
      overall: { total: 2, visited: 2, completed: 1 },
      byCategory: {
        Biology: { total: 1, visited: 1, completed: 1 },
        Chemistry: { total: 1, visited: 1, completed: 0 },
      },
    })
    expect(notionBoundary.dataSourcesQuery).toHaveBeenCalledTimes(2)
    expect(notionBoundary.dataSourcesQuery).toHaveBeenNthCalledWith(1, {
      data_source_id: 'source-id',
      filter_properties: ['category-id', 'visited-id', 'completed-id'],
      result_type: 'page',
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      filter: undefined,
      start_cursor: undefined,
    })
    expect(notionBoundary.dataSourcesQuery).toHaveBeenNthCalledWith(2, {
      data_source_id: 'source-id',
      filter_properties: ['category-id', 'visited-id', 'completed-id'],
      result_type: 'page',
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      filter: undefined,
      start_cursor: 'page-2',
    })
    expect(notionBoundary.pagesUpdate).not.toHaveBeenCalled()
  })

  it('synchronizes a changed group set once while returning the canonical live set', async () => {
    prepareStudyLoad({
      storedGroups: ['Legacy'],
      liveGroups: ['Physics', 'Biology'],
    })

    const result = await getCardGroupStudyData({
      data: { dataGroupId: 'deck-1' },
    })

    expect(result.groupKeys).toEqual(['Biology', 'Physics'])
    expect(notionBoundary.pagesUpdate).toHaveBeenCalledOnce()
    expect(notionBoundary.pagesUpdate).toHaveBeenCalledWith({
      page_id: 'deck-1',
      properties: {
        group_keys: {
          rich_text: [
            {
              type: 'text',
              text: { content: '["Biology","Physics"]' },
            },
          ],
        },
      },
    })
    expect(
      notionBoundary.dataSourcesQuery.mock.invocationCallOrder.at(-1),
    ).toBeLessThan(notionBoundary.pagesUpdate.mock.invocationCallOrder[0])
  })

  it('synchronizes removal of every stored group to the empty live set', async () => {
    prepareStudyLoad({ storedGroups: ['Legacy'], liveGroups: [] })

    await expect(
      getCardGroupStudyData({ data: { dataGroupId: 'deck-1' } }),
    ).resolves.toMatchObject({
      groupKeys: [],
      categoryStats: { byCategory: {} },
    })
    expect(notionBoundary.pagesUpdate).toHaveBeenCalledOnce()
    expect(notionBoundary.pagesUpdate).toHaveBeenCalledWith({
      page_id: 'deck-1',
      properties: {
        group_keys: {
          rich_text: [
            {
              type: 'text',
              text: { content: '[]' },
            },
          ],
        },
      },
    })
  })

  it('still returns live data when best-effort group synchronization fails', async () => {
    prepareStudyLoad({ storedGroups: [], liveGroups: ['Biology'] })
    notionBoundary.pagesUpdate.mockRejectedValue(
      new Error('metadata write unavailable'),
    )

    await expect(
      getCardGroupStudyData({ data: { dataGroupId: 'deck-1' } }),
    ).resolves.toMatchObject({
      groupKeys: ['Biology'],
      categoryStats: {
        overall: { total: 1, visited: 0, completed: 0 },
      },
    })
    expect(notionBoundary.pagesUpdate).toHaveBeenCalledOnce()
  })

  it.each([
    ['dataset ID', configurationProperties({ dataSetId: '' }), reviewDataset()],
    [
      'dataset schema',
      configurationProperties(),
      { object: 'data_source', id: 'source-id' } as never,
    ],
    [
      'grouping column',
      configurationProperties(),
      sourceDataset({
        'nkdo-visited': schemaProperty('checkbox', 'visited-id'),
        'nkdo-completed': schemaProperty('checkbox', 'completed-id'),
      }),
    ],
    [
      'review properties',
      configurationProperties(),
      sourceDataset({
        Category: schemaProperty('select', 'category-id'),
        'nkdo-visited': schemaProperty('checkbox', 'visited-id'),
      }),
    ],
    [
      'review property type',
      configurationProperties(),
      sourceDataset({
        Category: schemaProperty('select', 'category-id'),
        'nkdo-visited': schemaProperty('date', 'visited-id'),
        'nkdo-completed': schemaProperty('checkbox', 'completed-id'),
      }),
    ],
  ])(
    'fails for a missing %s before scanning or writing',
    async (_case, config, source) => {
      notionBoundary.pagesRetrieve.mockResolvedValue(
        configurationPage('deck-1', config),
      )
      notionBoundary.dataSourcesRetrieve.mockResolvedValue(source)

      await expect(
        getCardGroupStudyData({ data: { dataGroupId: 'deck-1' } }),
      ).rejects.toThrow()
      expect(notionBoundary.dataSourcesQuery).not.toHaveBeenCalled()
      expect(notionBoundary.pagesUpdate).not.toHaveBeenCalled()
    },
  )

  it('scans single-mode review fields without requesting or returning categories', async () => {
    notionBoundary.pagesRetrieve.mockResolvedValue(
      configurationPage(
        'deck-1',
        configurationProperties({
          groupingColumnName: null,
          groupingColumnId: null,
          groupKeys: [],
        }),
      ),
    )
    notionBoundary.dataSourcesRetrieve.mockResolvedValue(
      sourceDataset({
        'nkdo-visited': schemaProperty('checkbox', 'visited-id'),
        'nkdo-completed': schemaProperty('checkbox', 'completed-id'),
      }),
    )
    notionBoundary.dataSourcesQuery.mockResolvedValue(
      queryResponse([
        notionPage('card-1', {
          'nkdo-visited': pageProperty('checkbox', false, 'visited-id'),
          'nkdo-completed': pageProperty('checkbox', true, 'completed-id'),
        }),
      ]),
    )

    await expect(
      getCardGroupStudyData({ data: { dataGroupId: 'deck-1' } }),
    ).resolves.toMatchObject({
      groupKeys: [],
      groupingColumnType: null,
      categoryStats: {
        overall: { total: 1, visited: 1, completed: 1 },
        byCategory: {},
      },
    })
    expect(notionBoundary.dataSourcesQuery).toHaveBeenCalledWith({
      data_source_id: 'source-id',
      filter_properties: ['visited-id', 'completed-id'],
      result_type: 'page',
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      filter: undefined,
      start_cursor: undefined,
    })
    expect(notionBoundary.pagesUpdate).not.toHaveBeenCalled()
  })
})

describe('study windows', () => {
  it('loads a formula-group window with one native filtered query', async () => {
    const learnedPage = formulaStudyPage('biology-1', 'Biology')
    learnedPage.properties['nkdo-completed'] = pageProperty(
      'checkbox',
      true,
      'completed-id',
    )
    notionBoundary.dataSourcesQuery.mockResolvedValue(
      queryResponse([learnedPage, formulaStudyPage('biology-2', 'Biology')]),
    )

    await expect(
      notionStudySource.fetchWindow(
        {
          dataSourceId: 'source-id',
          filter: {
            property: 'formula-id',
            formula: { string: { equals: 'Biology' } },
          },
          sorts: [],
          pageSize: 20,
          frontPropertyIds: ['front-id'],
          backPropertyIds: ['back-id'],
          groupPropertyId: 'formula-id',
        },
        null,
      ),
    ).resolves.toEqual({
      cards: [
        {
          id: 'biology-1',
          visited: false,
          completed: true,
          front: ['Front biology-1'],
          back: ['Back biology-1'],
          groupKey: 'Biology',
        },
        {
          id: 'biology-2',
          visited: false,
          completed: false,
          front: ['Front biology-2'],
          back: ['Back biology-2'],
          groupKey: 'Biology',
        },
      ],
      nextCursor: null,
    })
    expect(notionBoundary.dataSourcesQuery).toHaveBeenCalledOnce()
    expect(notionBoundary.dataSourcesQuery).toHaveBeenCalledWith({
      data_source_id: 'source-id',
      filter: {
        property: 'formula-id',
        formula: { string: { equals: 'Biology' } },
      },
      sorts: [],
      start_cursor: null,
      page_size: 20,
      filter_properties: [
        'front-id',
        'back-id',
        'nkdo-visited',
        'nkdo-completed',
        'formula-id',
      ],
      result_type: 'page',
    })
  })

  it('accepts a well-formed window request and keeps only the declared query fields', () => {
    const query = {
      dataSourceId: 'source-id',
      filter: { property: 'topic-id', select: { equals: 'Grammar' } },
      sorts: [
        { property: 'front-id', direction: 'ascending' },
        { timestamp: 'created_time', direction: 'descending' },
      ],
      pageSize: 20,
      frontPropertyIds: ['front-id'],
      backPropertyIds: [],
      groupPropertyId: 'topic-id',
    }

    expect(
      validateStudyWindowInput({
        query: { ...query, unexpected: true },
        startCursor: 'page-2',
      }),
    ).toEqual({ query, startCursor: 'page-2' })
    expect(
      validateStudyWindowInput({
        query: { ...query, filter: undefined, groupPropertyId: undefined },
        startCursor: null,
      }),
    ).toEqual({
      query: { ...query, filter: undefined, groupPropertyId: undefined },
      startCursor: null,
    })
  })

  it.each([
    ['a non-object payload', null],
    ['a missing query', { startCursor: null }],
    ['an empty cursor string', { query: validWindowQuery(), startCursor: '' }],
    ['a non-string cursor', { query: validWindowQuery(), startCursor: 7 }],
    [
      'an empty data source ID',
      { query: validWindowQuery({ dataSourceId: '' }), startCursor: null },
    ],
    [
      'a foreign page size',
      { query: validWindowQuery({ pageSize: 50 }), startCursor: null },
    ],
    [
      'an empty front property ID',
      {
        query: validWindowQuery({ frontPropertyIds: ['front-id', ''] }),
        startCursor: null,
      },
    ],
    [
      'a non-array back property list',
      {
        query: validWindowQuery({ backPropertyIds: 'back-id' }),
        startCursor: null,
      },
    ],
    [
      'an empty group property ID',
      { query: validWindowQuery({ groupPropertyId: '' }), startCursor: null },
    ],
    [
      'a sort without a direction',
      {
        query: validWindowQuery({ sorts: [{ property: 'front-id' }] }),
        startCursor: null,
      },
    ],
    [
      'a sort with an unknown timestamp',
      {
        query: validWindowQuery({
          sorts: [{ timestamp: 'deleted_time', direction: 'ascending' }],
        }),
        startCursor: null,
      },
    ],
    [
      'a non-JSON filter',
      {
        query: validWindowQuery({ filter: { equals: () => true } }),
        startCursor: null,
      },
    ],
    [
      'a non-finite filter number',
      {
        query: validWindowQuery({ filter: { number: { equals: Infinity } } }),
        startCursor: null,
      },
    ],
  ])('rejects %s as a validation error', (_case, input) => {
    expect(() => validateStudyWindowInput(input)).toThrow(AppError)
    expect(() => validateStudyWindowInput(input)).toThrow(
      expect.objectContaining({ code: 'validation' }),
    )
  })
})

describe('card-group deletion', () => {
  it('deletes the progress columns before trashing the configuration page', async () => {
    notionBoundary.pagesRetrieve.mockResolvedValue(configurationPage('deck-1'))
    notionBoundary.dataSourcesRetrieve.mockResolvedValue(
      sourceDataset({
        Name: schemaProperty('title', 'title'),
        'nkdo-visited': schemaProperty('checkbox', 'visited-id'),
        'nkdo-completed': schemaProperty('checkbox', 'completed-id'),
        'nkdo-last-visited-at': schemaProperty('date', 'last-visited-id'),
        'nkdo-completed-at': schemaProperty('date', 'completed-at-id'),
      }),
    )

    await expect(
      deleteCardGroup({ data: { dataGroupId: 'deck-1' } }),
    ).resolves.toEqual({ dataGroupId: 'deck-1' })
    expect(notionBoundary.pagesRetrieve).toHaveBeenCalledWith({
      page_id: 'deck-1',
    })
    expect(notionBoundary.pagesUpdate).toHaveBeenCalledOnce()
    expect(notionBoundary.pagesUpdate).toHaveBeenCalledWith({
      page_id: 'deck-1',
      in_trash: true,
    })
    expect(notionBoundary.dataSourcesUpdate).toHaveBeenCalledWith({
      data_source_id: 'source-id',
      properties: {
        'visited-id': null,
        'completed-id': null,
        'last-visited-id': null,
        'completed-at-id': null,
      },
    })
    expect(
      notionBoundary.pagesRetrieve.mock.invocationCallOrder[0],
    ).toBeLessThan(notionBoundary.dataSourcesUpdate.mock.invocationCallOrder[0])
    expect(
      notionBoundary.dataSourcesUpdate.mock.invocationCallOrder[0],
    ).toBeLessThan(notionBoundary.pagesUpdate.mock.invocationCallOrder[0])
  })

  it('keeps the deck configuration when progress-column deletion fails', async () => {
    notionBoundary.pagesRetrieve.mockResolvedValue(configurationPage('deck-1'))
    notionBoundary.dataSourcesRetrieve.mockResolvedValue(reviewDataset())
    notionBoundary.dataSourcesUpdate.mockRejectedValue(
      new Error('schema update failed'),
    )

    await expect(
      deleteCardGroup({ data: { dataGroupId: 'deck-1' } }),
    ).rejects.toThrow('schema update failed')
    expect(notionBoundary.pagesUpdate).not.toHaveBeenCalled()
  })

  it('does not trash anything when configuration retrieval is invalid', async () => {
    notionBoundary.pagesRetrieve.mockResolvedValue(partialPage('deck-1'))

    await expect(
      deleteCardGroup({ data: { dataGroupId: 'deck-1' } }),
    ).rejects.toThrow()
    expect(notionBoundary.pagesUpdate).not.toHaveBeenCalled()
    expect(notionBoundary.dataSourcesRetrieve).not.toHaveBeenCalled()
    expect(notionBoundary.dataSourcesUpdate).not.toHaveBeenCalled()
  })
})

function notionClient() {
  return buildNotionClientDouble({
    dataSources: {
      query: notionBoundary.dataSourcesQuery,
      retrieve: notionBoundary.dataSourcesRetrieve,
      update: notionBoundary.dataSourcesUpdate,
    },
    pages: {
      retrieve: notionBoundary.pagesRetrieve,
      update: notionBoundary.pagesUpdate,
    },
  })
}

function prepareStudyLoad({
  storedGroups,
  liveGroups,
}: {
  storedGroups: string[]
  liveGroups: string[]
}) {
  notionBoundary.pagesRetrieve.mockResolvedValue(
    configurationPage(
      'deck-1',
      configurationProperties({ groupKeys: storedGroups }),
    ),
  )
  notionBoundary.dataSourcesRetrieve.mockResolvedValue(reviewDataset())
  notionBoundary.dataSourcesQuery.mockResolvedValue(
    queryResponse([
      ...(liveGroups.length > 0
        ? liveGroups.map((group, index) =>
            studyPage(`card-${index + 1}`, {
              visited: false,
              completed: false,
              groups: [group],
            }),
          )
        : [
            studyPage('card-1', {
              visited: false,
              completed: false,
              groups: [],
            }),
          ]),
    ]),
  )
}

function reviewDataset() {
  return sourceDataset({
    Category: schemaProperty('select', 'category-id'),
    'nkdo-visited': schemaProperty('checkbox', 'visited-id'),
    'nkdo-completed': schemaProperty('checkbox', 'completed-id'),
  })
}

function sourceDataset(properties: DataSourceObjectResponse['properties']) {
  return {
    object: 'data_source',
    id: 'source-id',
    properties,
  } as unknown as DataSourceObjectResponse
}

function schemaProperty(type: string, id: string) {
  return { id, name: id, type, [type]: {} } as never
}

function configurationProperties(
  overrides: {
    dataSetId?: string
    groupKeys?: string[]
    groupingColumnName?: string | null
    groupingColumnId?: string | null
  } = {},
): PageObjectResponse['properties'] {
  return {
    dataset_id: pageProperty(
      'rich_text',
      richText(overrides.dataSetId ?? 'source-id'),
      'dataset-id',
    ),
    dataset_title: pageProperty('rich_text', richText('Biology'), 'title-id'),
    dataset_icon: pageProperty('files', [], 'icon-id'),
    grouper_column: pageProperty(
      'title',
      richText(
        overrides.groupingColumnName === undefined
          ? 'Category'
          : (overrides.groupingColumnName ?? ''),
      ),
      'grouping-id',
    ),
    grouper_column_id: pageProperty(
      'rich_text',
      richText(
        overrides.groupingColumnId === undefined
          ? 'category-id'
          : (overrides.groupingColumnId ?? ''),
      ),
      'grouping-column-id',
    ),
    group_keys: pageProperty(
      'rich_text',
      richText(JSON.stringify(overrides.groupKeys ?? ['Biology'])),
      'group-keys-id',
    ),
    front: pageProperty('rich_text', richText('["front-id"]'), 'front-id'),
    back: pageProperty('rich_text', richText('["back-id"]'), 'back-id'),
  }
}

function configurationPage(id: string, properties = configurationProperties()) {
  return notionPage(id, properties)
}

function studyPage(
  id: string,
  data: { visited: boolean; completed: boolean; groups: string[] },
) {
  return notionPage(id, {
    Category: pageProperty(
      'select',
      data.groups.at(0) ? { name: data.groups[0] } : null,
      'category-id',
    ),
    'nkdo-visited': pageProperty('checkbox', data.visited, 'visited-id'),
    'nkdo-completed': pageProperty('checkbox', data.completed, 'completed-id'),
  })
}

function validWindowQuery(overrides: Record<string, unknown> = {}) {
  return {
    dataSourceId: 'source-id',
    sorts: [],
    pageSize: 20,
    frontPropertyIds: ['front-id'],
    backPropertyIds: ['back-id'],
    ...overrides,
  }
}

function formulaStudyPage(id: string, group: string) {
  return notionPage(id, {
    Front: pageProperty('rich_text', richText(`Front ${id}`), 'front-id'),
    Back: pageProperty('rich_text', richText(`Back ${id}`), 'back-id'),
    Formula: pageProperty(
      'formula',
      { type: 'string', string: group },
      'formula-id',
    ),
  })
}

function notionPage(id: string, properties: PageObjectResponse['properties']) {
  return {
    object: 'page',
    id,
    created_time: '2026-07-31T00:00:00.000Z',
    url: `https://notion.test/${id}`,
    properties,
  } as PageObjectResponse
}

function partialPage(id: string) {
  return { object: 'page', id } as never
}

function queryResponse(
  results: QueryDataSourceResponse['results'],
  nextCursor: string | null = null,
) {
  return {
    results,
    next_cursor: nextCursor,
    has_more: nextCursor !== null,
  } as QueryDataSourceResponse
}

function pageProperty(type: string, value: unknown, id: string) {
  return {
    id,
    type,
    [type]: value,
  } as unknown as PageObjectResponse['properties'][string]
}

function richText(content: string): RichTextItemResponse[] {
  return [{ plain_text: content }] as RichTextItemResponse[]
}

function inheritedRecord(properties: Record<string, unknown>) {
  return Object.create(properties) as Record<string, unknown>
}

describe('study progress', () => {
  it.each(['visit', 'learn', 'unlearn'] as const)(
    'writes %s through the server boundary',
    async (action) => {
      const before = Date.now()
      await expect(
        saveStudyProgress({ data: { pageId: 'card-id', action } }),
      ).resolves.toEqual({
        pageId: 'card-id',
        completed: action === 'learn',
      })
      const write = notionBoundary.pagesUpdate.mock.calls.at(0)?.[0]
      expect(write?.page_id).toBe('card-id')
      const visitProperties = {
        'nkdo-visited': { checkbox: true },
        'nkdo-last-visited-at': { date: { start: expect.any(String) } },
      }
      expect(write?.properties).toEqual(
        action === 'learn'
          ? {
              ...visitProperties,
              'nkdo-completed': { checkbox: true },
              'nkdo-completed-at': { date: { start: expect.any(String) } },
            }
          : action === 'unlearn'
            ? {
                'nkdo-completed': { checkbox: false },
                'nkdo-completed-at': { date: null },
              }
            : visitProperties,
      )
      if (action === 'unlearn') return
      const date = write?.properties?.['nkdo-last-visited-at']
      if (!date || !('date' in date) || !date.date)
        throw new Error('Missing visit timestamp')
      expect(Date.parse(date.date.start)).toBeGreaterThanOrEqual(before)
      expect(Date.parse(date.date.start)).toBeLessThanOrEqual(Date.now())
    },
  )

  it('surfaces failed progress writes', async () => {
    notionBoundary.pagesUpdate.mockRejectedValue(
      new Error('Notion unavailable'),
    )
    await expect(
      saveStudyProgress({ data: { pageId: 'card-id', action: 'visit' } }),
    ).rejects.toThrow('Notion unavailable')
  })
})
