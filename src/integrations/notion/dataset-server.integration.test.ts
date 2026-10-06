import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  Client,
  DataSourceObjectResponse,
  PageObjectResponse,
  RichTextItemResponse,
} from '@notionhq/client'
import {
  createNokaddoDataset,
  ensureNokaddoReviewProperties,
  getStoredCardConfigurations,
  insertCardConfiguration,
  queryNotionDatasetItems,
} from './dataset-server'
import type * as ClientServerModule from './client-server'
import { completeDatasetConnection } from './dataset-functions'
import { NOKADDO_DATASET_PROPERTIES } from './card-configuration-validators'
import { buildNotionClientDouble } from '../../../test/fixtures/notion-client'
import {
  buildNotionCheckboxDataSourceProperty,
  buildNotionDataSource,
  buildNotionDateDataSourceProperty,
  buildNotionPage,
  buildNotionQueryResponse,
} from '../../../test/fixtures/notion'

const notionBoundary = vi.hoisted(() => ({
  databasesCreate: vi.fn<Client['databases']['create']>(),
  databasesRetrieve: vi.fn<Client['databases']['retrieve']>(),
  dataSourcesCreate: vi.fn<Client['dataSources']['create']>(),
  query: vi.fn<Client['dataSources']['query']>(),
  retrieve: vi.fn<Client['dataSources']['retrieve']>(),
  update: vi.fn<Client['dataSources']['update']>(),
  pagesCreate: vi.fn<Client['pages']['create']>(),
  withNotionClient: vi.fn<typeof ClientServerModule.withNotionClient>(),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
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
    request(
      buildNotionClientDouble({
        databases: {
          create: notionBoundary.databasesCreate,
          retrieve: notionBoundary.databasesRetrieve,
        },
        dataSources: {
          create: notionBoundary.dataSourcesCreate,
          query: notionBoundary.query,
          retrieve: notionBoundary.retrieve,
          update: notionBoundary.update,
        },
        pages: { create: notionBoundary.pagesCreate },
      }),
    ),
  )
})

describe('dataset item querying', () => {
  it('selects fields and the first supported populated filter, honors the limit, and drops partial pages', async () => {
    notionBoundary.query.mockResolvedValueOnce(
      buildNotionQueryResponse({
        results: [
          notionPage('page-1', {
            Name: property('title', richText('Alpha'), 'title-id'),
          }),
          { object: 'page', id: 'partial-page' },
        ],
      }),
    )

    await expect(
      queryNotionDatasetItems({
        dataSetId: 'source-id',
        limit: 17,
        fields: [
          { id: 'checkbox-id', type: 'checkbox' },
          { id: 'title-id', type: 'title' },
        ],
        requirePopulatedField: true,
      }),
    ).resolves.toEqual([
      {
        id: 'page-1',
        properties: [{ id: 'title-id', name: 'Name', value: 'Alpha' }],
      },
    ])
    expect(notionBoundary.query).toHaveBeenCalledWith({
      data_source_id: 'source-id',
      filter_properties: ['checkbox-id', 'title-id'],
      filter: { property: 'title-id', title: { is_not_empty: true } },
      page_size: 17,
      result_type: 'page',
    })
  })

  it.each([
    [
      'disabled populated filtering',
      [{ id: 'title-id', type: 'title' }],
      false,
      undefined,
      ['title-id'],
    ],
    [
      'no supported field',
      [{ id: 'checkbox-id', type: 'checkbox' }],
      true,
      undefined,
      ['checkbox-id'],
    ],
    ['empty fields', [], true, undefined, undefined],
  ] as const)(
    'omits the populated filter for %s',
    async (
      _case,
      fields,
      requirePopulatedField,
      expectedFilter,
      propertyIds,
    ) => {
      notionBoundary.query.mockResolvedValueOnce(buildNotionQueryResponse())

      await queryNotionDatasetItems({
        dataSetId: 'source-id',
        limit: 10,
        fields: [...fields],
        requirePopulatedField,
      })

      expect(notionBoundary.query).toHaveBeenCalledWith({
        data_source_id: 'source-id',
        filter_properties: propertyIds,
        filter: expectedFilter,
        page_size: 10,
        result_type: 'page',
      })
    },
  )
})

describe('dataset connection production stack', () => {
  it('runs validated orchestration through the real dataset and grouping modules', async () => {
    const source = sourceDatasetWithProperties({
      Title: sourceSchemaProperty('title', 'title-id'),
      Category: sourceSchemaProperty('select', 'category-id'),
    })
    notionBoundary.retrieve
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(source)
      .mockResolvedValueOnce(source)
    notionBoundary.databasesCreate.mockResolvedValue({
      id: 'database-id',
      data_sources: [{ id: 'new-nokaddo-id', name: 'nokaddo-cards' }],
    } as never)
    notionBoundary.update.mockResolvedValue(buildNotionDataSource())
    notionBoundary.query.mockResolvedValue(buildNotionQueryResponse())
    notionBoundary.pagesCreate.mockResolvedValue(
      buildNotionPage({ id: 'new-configuration-id' }),
    )

    await expect(
      completeDatasetConnection({
        data: {
          dataSetId: 'source-id',
          datasetTitle: 'Biology',
          datasetIcon: null,
          groupingColumnName: 'Category',
          groupingColumnId: 'category-id',
          frontColumnIds: ['title-id'],
          backColumnIds: ['category-id'],
          nokaddoDatasetId: null,
        },
      }),
    ).resolves.toEqual({
      nokaddoDatasetId: 'new-nokaddo-id',
      existingCardConfigurations: [],
      cardConfigurationId: 'new-configuration-id',
    })

    expect(notionBoundary.retrieve).toHaveBeenNthCalledWith(1, {
      data_source_id: 'source-id',
    })
    expect(notionBoundary.update).toHaveBeenCalledWith({
      data_source_id: 'source-id',
      properties: {
        'nkdo-visited': { checkbox: {} },
        'nkdo-completed': { checkbox: {} },
        'nkdo-last-visited-at': { date: {} },
        'nkdo-completed-at': { date: {} },
      },
    })
    expect(notionBoundary.query).toHaveBeenCalledWith({
      data_source_id: 'source-id',
      filter_properties: ['category-id'],
      result_type: 'page',
      sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
      filter: undefined,
      start_cursor: undefined,
    })
    expect(notionBoundary.pagesCreate).toHaveBeenCalledOnce()
  })
})

describe('configuration storage creation', () => {
  it.each([
    ['creation response', 'created-source', 'not-called'],
    ['retrieved database', 'retrieved-source', 'retrieve'],
    ['final fallback', 'fallback-source', 'create-source'],
  ] as const)(
    'uses the data source from the %s',
    async (_case, expectedId, path) => {
      const boundaries = storageClient()
      boundaries.databasesCreate.mockResolvedValue({
        id: 'database-id',
        ...(path === 'not-called'
          ? { data_sources: [{ id: expectedId }] }
          : {}),
      } as never)
      boundaries.databasesRetrieve.mockResolvedValue(
        (path === 'retrieve'
          ? { id: 'database-id', data_sources: [{ id: expectedId }] }
          : { id: 'database-id' }) as never,
      )
      boundaries.dataSourcesCreate.mockResolvedValue(
        buildNotionDataSource({ id: expectedId }),
      )

      await expect(createNokaddoDataset(boundaries.client)).resolves.toBe(
        expectedId,
      )

      const schema = finalStorageSchema()
      expect(boundaries.databasesCreate).toHaveBeenCalledWith({
        parent: { type: 'workspace', workspace: true },
        title: [{ type: 'text', text: { content: 'nokaddo-cards' } }],
        initial_data_source: { properties: schema },
      })
      expect(boundaries.databasesRetrieve).toHaveBeenCalledTimes(
        path === 'not-called' ? 0 : 1,
      )
      if (path !== 'not-called') {
        expect(boundaries.databasesRetrieve).toHaveBeenCalledWith({
          database_id: 'database-id',
        })
      }
      expect(boundaries.dataSourcesCreate).toHaveBeenCalledTimes(
        path === 'create-source' ? 1 : 0,
      )
      if (path === 'create-source') {
        expect(boundaries.dataSourcesCreate).toHaveBeenCalledWith({
          parent: { database_id: 'database-id' },
          title: [{ type: 'text', text: { content: 'nokaddo-cards' } }],
          properties: schema,
        })
      }
    },
  )
})

describe('review-property setup', () => {
  it('adds only missing properties and skips an update when all are valid', async () => {
    const missing = storageClient()
    missing.dataSourcesRetrieve.mockResolvedValue(
      buildNotionDataSource({
        properties: {
          'nkdo-visited': dataSourceProperty('checkbox', 'visited-id'),
        },
      }),
    )

    await ensureNokaddoReviewProperties(missing.client, 'source-id')

    expect(missing.dataSourcesRetrieve).toHaveBeenCalledWith({
      data_source_id: 'source-id',
    })
    expect(missing.dataSourcesUpdate).toHaveBeenCalledWith({
      data_source_id: 'source-id',
      properties: {
        'nkdo-completed': { checkbox: {} },
        'nkdo-last-visited-at': { date: {} },
        'nkdo-completed-at': { date: {} },
      },
    })

    const complete = storageClient()
    complete.dataSourcesRetrieve.mockResolvedValue(
      buildNotionDataSource({
        properties: finalReviewProperties(),
      }),
    )
    await ensureNokaddoReviewProperties(complete.client, 'source-id')
    expect(complete.dataSourcesUpdate).not.toHaveBeenCalled()
  })

  it('rejects an incompatible existing property before any update', async () => {
    const boundaries = storageClient()
    boundaries.dataSourcesRetrieve.mockResolvedValue(
      buildNotionDataSource({
        properties: {
          ...finalReviewProperties(),
          'nkdo-completed': dataSourceProperty('date', 'wrong-type-id'),
        },
      }),
    )

    await expect(
      ensureNokaddoReviewProperties(boundaries.client, 'source-id'),
    ).rejects.toThrow(/nkdo-completed.*checkbox.*date/)
    expect(boundaries.dataSourcesUpdate).not.toHaveBeenCalled()
  })
})

describe('stored configuration scans', () => {
  it('paginates to exhaustion and retains only full valid configurations', async () => {
    const boundaries = storageClient()
    boundaries.dataSourcesQuery
      .mockResolvedValueOnce(
        buildNotionQueryResponse({
          results: [configurationPage('configuration-1'), { id: 'partial' }],
          next_cursor: 'cursor-2',
          has_more: true,
        } as never),
      )
      .mockResolvedValueOnce(
        buildNotionQueryResponse({
          results: [
            configurationPage('missing-dataset-id', {
              ...configurationProperties(),
              dataset_id: property('rich_text', [], 'dataset-id'),
            }),
            configurationPage('malformed-front-json', {
              ...configurationProperties(),
              front: property('rich_text', richText('{'), 'front-id'),
            }),
            configurationPage('non-string-back-item', {
              ...configurationProperties(),
              back: property('rich_text', richText('[1]'), 'back-id'),
            }),
            configurationPage('wrong-schema', {
              ...configurationProperties(),
              group_keys: property('title', [], 'group-keys-id'),
            }),
            configurationPage('configuration-2'),
          ],
          next_cursor: null,
        }),
      )

    const configurations = await getStoredCardConfigurations(
      boundaries.client,
      'nokaddo-id',
    )

    expect(configurations.map(({ id }) => id)).toEqual([
      'configuration-1',
      'configuration-2',
    ])
    expect(boundaries.dataSourcesQuery).toHaveBeenNthCalledWith(1, {
      data_source_id: 'nokaddo-id',
      result_type: 'page',
      start_cursor: undefined,
    })
    expect(boundaries.dataSourcesQuery).toHaveBeenNthCalledWith(2, {
      data_source_id: 'nokaddo-id',
      result_type: 'page',
      start_cursor: 'cursor-2',
    })
  })
})

describe('configuration insertion', () => {
  it('writes the exact final payload and chunks group keys', async () => {
    const boundaries = storageClient()
    boundaries.pagesCreate.mockResolvedValue(
      buildNotionPage({ id: 'new-configuration-id' }),
    )
    const longGroup = 'x'.repeat(2_001)

    await expect(
      insertCardConfiguration(
        boundaries.client,
        'nokaddo-id',
        {
          dataSetId: 'source-id',
          datasetTitle: 'Biology',
          datasetIcon: {
            type: 'external',
            external: { url: 'https://example.test/icon.png' },
          },
          groupingColumnName: 'Category',
          groupingColumnId: 'category-id',
          frontColumnIds: ['front-id'],
          backColumnIds: ['back-id'],
        },
        [longGroup],
      ),
    ).resolves.toBe('new-configuration-id')

    const groupJson = JSON.stringify([longGroup])
    expect(boundaries.pagesCreate).toHaveBeenCalledWith({
      parent: { type: 'data_source_id', data_source_id: 'nokaddo-id' },
      properties: {
        dataset_id: { rich_text: [text('source-id')] },
        dataset_title: { rich_text: [text('Biology')] },
        dataset_icon: {
          files: [
            {
              type: 'external',
              external: { url: 'https://example.test/icon.png' },
              name: 'icon',
            },
          ],
        },
        grouper_column: { title: [text('Category')] },
        grouper_column_id: { rich_text: [text('category-id')] },
        group_keys: {
          rich_text: [
            text(groupJson.slice(0, 2_000)),
            text(groupJson.slice(2_000)),
          ],
        },
        front: { rich_text: [text('["front-id"]')] },
        back: { rich_text: [text('["back-id"]')] },
      },
    })
  })

  it.each([
    [
      'file',
      { type: 'file', file: { url: 'https://files.test/icon.png' } },
      {
        type: 'file',
        file: { url: 'https://files.test/icon.png' },
        name: 'icon',
      },
    ],
    [
      'custom emoji',
      {
        type: 'custom_emoji',
        custom_emoji: { url: 'https://emoji.test/icon.png' },
      },
      {
        type: 'external',
        external: { url: 'https://emoji.test/icon.png' },
        name: 'icon',
      },
    ],
    ['unsupported', { type: 'emoji', emoji: '📚' }, undefined],
  ] as const)(
    'maps a %s icon without changing the schema',
    async (_case, icon, expected) => {
      const boundaries = storageClient()
      boundaries.pagesCreate.mockResolvedValue(
        buildNotionPage({ id: 'configuration-id' }),
      )

      await insertCardConfiguration(
        boundaries.client,
        'nokaddo-id',
        {
          dataSetId: 'source-id',
          datasetTitle: 'Biology',
          datasetIcon: icon as DataSourceObjectResponse['icon'],
          groupingColumnName: null,
          groupingColumnId: null,
          frontColumnIds: ['front-id'],
          backColumnIds: [],
        },
        [],
      )

      expect(boundaries.pagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.objectContaining({
            [NOKADDO_DATASET_PROPERTIES.datasetIcon]: {
              files: expected ? [expected] : [],
            },
          }),
        }),
      )
    },
  )
})

function storageClient() {
  const databasesCreate = vi.fn<Client['databases']['create']>()
  const databasesRetrieve = vi.fn<Client['databases']['retrieve']>()
  const dataSourcesCreate = vi.fn<Client['dataSources']['create']>()
  const dataSourcesRetrieve = vi.fn<Client['dataSources']['retrieve']>()
  const dataSourcesUpdate = vi.fn<Client['dataSources']['update']>()
  const dataSourcesQuery = vi.fn<Client['dataSources']['query']>()
  const pagesCreate = vi.fn<Client['pages']['create']>()
  const client = buildNotionClientDouble({
    databases: { create: databasesCreate, retrieve: databasesRetrieve },
    dataSources: {
      create: dataSourcesCreate,
      retrieve: dataSourcesRetrieve,
      update: dataSourcesUpdate,
      query: dataSourcesQuery,
    },
    pages: { create: pagesCreate },
  })

  return {
    client,
    databasesCreate,
    databasesRetrieve,
    dataSourcesCreate,
    dataSourcesRetrieve,
    dataSourcesUpdate,
    dataSourcesQuery,
    pagesCreate,
  }
}

function finalStorageSchema() {
  return {
    dataset_id: { rich_text: {} },
    dataset_title: { rich_text: {} },
    dataset_icon: { files: {} },
    grouper_column: { title: {} },
    grouper_column_id: { rich_text: {} },
    group_keys: { rich_text: {} },
    front: { rich_text: {} },
    back: { rich_text: {} },
  }
}

function finalReviewProperties() {
  return {
    'nkdo-visited': dataSourceProperty('checkbox', 'visited-id'),
    'nkdo-completed': dataSourceProperty('checkbox', 'completed-id'),
    'nkdo-last-visited-at': dataSourceProperty('date', 'last-visited-id'),
    'nkdo-completed-at': dataSourceProperty('date', 'completed-at-id'),
  }
}

function dataSourceProperty(type: 'checkbox' | 'date', id: string) {
  return type === 'checkbox'
    ? buildNotionCheckboxDataSourceProperty(id, id)
    : buildNotionDateDataSourceProperty(id, id)
}

function sourceSchemaProperty(type: string, id: string) {
  return { id, name: id, type, [type]: {} }
}

function sourceDatasetWithProperties(
  properties: Record<string, ReturnType<typeof sourceSchemaProperty>>,
) {
  return {
    object: 'data_source',
    id: 'source-id',
    properties,
  } as unknown as DataSourceObjectResponse
}

function text(content: string) {
  return { type: 'text' as const, text: { content } }
}

function richText(content: string): RichTextItemResponse[] {
  return [
    {
      ...text(content),
      text: { content, link: null },
      annotations: {
        bold: false,
        italic: false,
        strikethrough: false,
        underline: false,
        code: false,
        color: 'default',
      },
      plain_text: content,
      href: null,
    },
  ]
}

function property(type: string, value: unknown, id: string) {
  return {
    id,
    type,
    [type]: value,
  } as unknown as PageObjectResponse['properties'][string]
}

function notionPage(id: string, properties: PageObjectResponse['properties']) {
  return {
    object: 'page',
    id,
    url: `https://notion.test/${id}`,
    properties,
  } as PageObjectResponse
}

function configurationProperties(): PageObjectResponse['properties'] {
  return {
    dataset_id: property('rich_text', richText('source-id'), 'dataset-id'),
    dataset_title: property('rich_text', richText('Biology'), 'title-id'),
    dataset_icon: property('files', [], 'icon-id'),
    grouper_column: property('title', [], 'grouping-id'),
    grouper_column_id: property('rich_text', [], 'grouping-column-id'),
    group_keys: property('rich_text', richText('[]'), 'group-keys-id'),
    front: property('rich_text', richText('["front-id"]'), 'front-id'),
    back: property('rich_text', richText('[]'), 'back-id'),
  }
}

function configurationPage(id: string, properties = configurationProperties()) {
  return notionPage(id, properties)
}
