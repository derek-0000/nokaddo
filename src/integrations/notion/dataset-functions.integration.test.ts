import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Client, DataSourceObjectResponse } from '@notionhq/client'
import type * as DatasetServerModule from './dataset-server'
import type * as CardFunctionsModule from './card-functions'
import type * as ClientServerModule from './client-server'
import {
  completeDatasetConnection,
  getNotionDataset,
} from './dataset-functions'
import { AppError } from '#/lib/errors'
import { buildNotionClientDouble } from '../../../test/fixtures/notion-client'

const datasetBoundary = vi.hoisted(() => ({
  createNokaddoDataset:
    vi.fn<typeof DatasetServerModule.createNokaddoDataset>(),
  ensureNokaddoReviewProperties:
    vi.fn<typeof DatasetServerModule.ensureNokaddoReviewProperties>(),
  getStoredCardConfigurations:
    vi.fn<typeof DatasetServerModule.getStoredCardConfigurations>(),
  insertCardConfiguration:
    vi.fn<typeof DatasetServerModule.insertCardConfiguration>(),
  queryNotionDatasetItems:
    vi.fn<typeof DatasetServerModule.queryNotionDatasetItems>(),
}))

const notionBoundary = vi.hoisted(() => ({
  retrieve: vi.fn<Client['dataSources']['retrieve']>(),
  setCardGroups: vi.fn<typeof CardFunctionsModule.setCardGroups>(),
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

vi.mock('./dataset-server', () => ({
  createNokaddoDataset: datasetBoundary.createNokaddoDataset,
  ensureNokaddoReviewProperties: datasetBoundary.ensureNokaddoReviewProperties,
  getStoredCardConfigurations: datasetBoundary.getStoredCardConfigurations,
  insertCardConfiguration: datasetBoundary.insertCardConfiguration,
  queryNotionDatasetItems: datasetBoundary.queryNotionDatasetItems,
}))

vi.mock('./card-functions', () => ({
  setCardGroups: notionBoundary.setCardGroups,
}))

vi.mock('./client-server', () => ({
  withNotionClient: notionBoundary.withNotionClient,
}))

const validInput = {
  dataSetId: 'source-id',
  datasetTitle: 'Biology',
  datasetIcon: null,
  groupingColumnName: null,
  groupingColumnId: null,
  frontColumnIds: ['title-id'],
  backColumnIds: [],
  nokaddoDatasetId: null,
}

beforeEach(() => {
  for (const boundary of [
    ...Object.values(datasetBoundary),
    ...Object.values(notionBoundary),
  ]) {
    boundary.mockReset()
  }

  notionBoundary.withNotionClient.mockImplementation(async (request) =>
    request(
      buildNotionClientDouble({
        dataSources: { retrieve: notionBoundary.retrieve },
      }),
    ),
  )
  notionBoundary.retrieve.mockResolvedValue(sourceDataset())
  datasetBoundary.createNokaddoDataset.mockResolvedValue('new-nokaddo-id')
  datasetBoundary.ensureNokaddoReviewProperties.mockResolvedValue(undefined)
  datasetBoundary.getStoredCardConfigurations.mockResolvedValue([])
  datasetBoundary.insertCardConfiguration.mockResolvedValue(
    'new-configuration-id',
  )
  notionBoundary.setCardGroups.mockResolvedValue([])
})

describe('dataset retrieval', () => {
  it('retrieves the requested source and returns raw properties with normalized display fields', async () => {
    const dataset = sourceDataset({
      title: [{ plain_text: 'Project ' }, { plain_text: 'Atlas' }],
      description: [{ plain_text: 'Study ' }, { plain_text: 'cards' }],
    })
    notionBoundary.retrieve.mockResolvedValue(dataset)

    await expect(
      getNotionDataset({ data: { dataSetId: 'source-id' } }),
    ).resolves.toEqual({
      ...dataset,
      id: 'source-id',
      title: 'Project Atlas',
      description: 'Study cards',
      iconUrl: undefined,
      coverUrl: undefined,
    })
    expect(notionBoundary.retrieve).toHaveBeenCalledWith({
      data_source_id: 'source-id',
    })
  })

  it('rejects an unsupported retrieval response', async () => {
    notionBoundary.retrieve.mockResolvedValue({
      object: 'data_source',
      id: 'source-id',
      properties: {},
    })

    await expect(
      getNotionDataset({ data: { dataSetId: 'source-id' } }),
    ).rejects.toThrow('Dataset did not provide required fields')
  })
})

describe('dataset connection completion', () => {
  it('validates the source schema and creates final storage, review fields, groups, and configuration', async () => {
    notionBoundary.retrieve.mockResolvedValue(
      sourceDataset({
        properties: {
          Title: sourceProperty('title', 'title-id'),
          Category: sourceProperty('select', 'category-id'),
        },
      }),
    )
    notionBoundary.setCardGroups.mockResolvedValue(['One', 'Two'])

    await expect(
      completeDatasetConnection({
        data: {
          ...validInput,
          groupingColumnName: 'Category',
          groupingColumnId: 'category-id',
          backColumnIds: ['category-id'],
        },
      }),
    ).resolves.toEqual({
      nokaddoDatasetId: 'new-nokaddo-id',
      existingCardConfigurations: [],
      cardConfigurationId: 'new-configuration-id',
    })
    expect(notionBoundary.retrieve).toHaveBeenCalledWith({
      data_source_id: 'source-id',
    })
    expect(datasetBoundary.createNokaddoDataset).toHaveBeenCalledOnce()
    expect(datasetBoundary.ensureNokaddoReviewProperties).toHaveBeenCalledWith(
      expect.anything(),
      'source-id',
    )
    expect(notionBoundary.setCardGroups).toHaveBeenCalledWith(
      expect.anything(),
      {
        dataSetId: 'source-id',
        groupingColumnName: 'Category',
        groupingColumnId: 'category-id',
      },
    )
    expect(datasetBoundary.insertCardConfiguration).toHaveBeenCalledWith(
      expect.anything(),
      'new-nokaddo-id',
      {
        ...validInput,
        groupingColumnName: 'Category',
        groupingColumnId: 'category-id',
        backColumnIds: ['category-id'],
      },
      ['One', 'Two'],
    )
  })

  it('reuses final-schema storage and does not derive groups in single mode', async () => {
    await expect(
      completeDatasetConnection({
        data: { ...validInput, nokaddoDatasetId: 'existing-nokaddo-id' },
      }),
    ).resolves.toEqual({
      nokaddoDatasetId: 'existing-nokaddo-id',
      existingCardConfigurations: [],
      cardConfigurationId: 'new-configuration-id',
    })

    expect(datasetBoundary.createNokaddoDataset).not.toHaveBeenCalled()
    expect(datasetBoundary.getStoredCardConfigurations).toHaveBeenCalledWith(
      expect.anything(),
      'existing-nokaddo-id',
    )
    expect(notionBoundary.setCardGroups).not.toHaveBeenCalled()
    expect(datasetBoundary.insertCardConfiguration).toHaveBeenCalledWith(
      expect.anything(),
      'existing-nokaddo-id',
      expect.anything(),
      [],
    )
  })

  it('returns an identical active configuration without any mutation', async () => {
    datasetBoundary.getStoredCardConfigurations.mockResolvedValue([
      storedConfiguration(),
    ])

    await expect(
      completeDatasetConnection({
        data: { ...validInput, nokaddoDatasetId: 'existing-nokaddo-id' },
      }),
    ).resolves.toEqual({
      nokaddoDatasetId: 'existing-nokaddo-id',
      existingCardConfigurations: [storedConfiguration()],
      cardConfigurationId: 'existing-configuration-id',
    })

    expect(datasetBoundary.createNokaddoDataset).not.toHaveBeenCalled()
    expect(datasetBoundary.ensureNokaddoReviewProperties).not.toHaveBeenCalled()
    expect(notionBoundary.setCardGroups).not.toHaveBeenCalled()
    expect(datasetBoundary.insertCardConfiguration).not.toHaveBeenCalled()
  })

  it('ignores mutable display metadata when identifying an otherwise identical retry', async () => {
    datasetBoundary.getStoredCardConfigurations.mockResolvedValue([
      storedConfiguration(),
    ])

    await expect(
      completeDatasetConnection({
        data: {
          ...validInput,
          datasetTitle: 'Renamed Biology',
          datasetIcon: {
            type: 'file',
            file: { url: 'https://files.test/refreshed-signed-url' },
          },
          nokaddoDatasetId: 'existing-nokaddo-id',
        },
      }),
    ).resolves.toMatchObject({
      cardConfigurationId: 'existing-configuration-id',
    })

    expect(datasetBoundary.insertCardConfiguration).not.toHaveBeenCalled()
  })

  it('returns a non-retryable conflict for a different active configuration without mutation', async () => {
    datasetBoundary.getStoredCardConfigurations.mockResolvedValue([
      storedConfiguration(),
    ])
    notionBoundary.retrieve.mockResolvedValue(
      sourceDataset({
        properties: {
          Title: sourceProperty('title', 'title-id'),
          Other: sourceProperty('rich_text', 'other-id'),
        },
      }),
    )

    const failure = await completeDatasetConnection({
      data: {
        ...validInput,
        frontColumnIds: ['other-id'],
        nokaddoDatasetId: 'existing-nokaddo-id',
      },
    }).catch((error: unknown) => error)

    expect(failure).toEqual(new AppError('conflict'))
    expect(failure).toMatchObject({ code: 'conflict', retryable: false })
    expect(datasetBoundary.createNokaddoDataset).not.toHaveBeenCalled()
    expect(datasetBoundary.ensureNokaddoReviewProperties).not.toHaveBeenCalled()
    expect(notionBoundary.setCardGroups).not.toHaveBeenCalled()
    expect(datasetBoundary.insertCardConfiguration).not.toHaveBeenCalled()
  })

  it('fails conservatively when storage already contains multiple active configurations', async () => {
    datasetBoundary.getStoredCardConfigurations.mockResolvedValue([
      storedConfiguration(),
      storedConfiguration({ id: 'duplicate-configuration-id' }),
    ])

    await expect(
      completeDatasetConnection({
        data: { ...validInput, nokaddoDatasetId: 'existing-nokaddo-id' },
      }),
    ).rejects.toMatchObject({ code: 'conflict', retryable: false })

    expect(datasetBoundary.ensureNokaddoReviewProperties).not.toHaveBeenCalled()
    expect(notionBoundary.setCardGroups).not.toHaveBeenCalled()
    expect(datasetBoundary.insertCardConfiguration).not.toHaveBeenCalled()
  })

  it('does not insert after incompatible review properties fail', async () => {
    datasetBoundary.ensureNokaddoReviewProperties.mockRejectedValue(
      new Error('wrong review property type'),
    )

    await expect(
      completeDatasetConnection({ data: validInput }),
    ).rejects.toThrow('wrong review property type')
    expect(datasetBoundary.insertCardConfiguration).not.toHaveBeenCalled()
  })
})

describe('invalid completion requests', () => {
  it.each([
    null,
    [],
    'request',
    1,
    true,
    {},
    { ...validInput, dataSetId: '' },
    { ...validInput, dataSetId: 1 },
    { ...validInput, datasetTitle: '' },
    { ...validInput, datasetTitle: false },
    { ...validInput, datasetIcon: {} },
    { ...validInput, groupingColumnName: '' },
    { ...validInput, groupingColumnName: 1 },
    { ...validInput, groupingColumnId: '' },
    { ...validInput, groupingColumnId: 1 },
    {
      ...validInput,
      groupingColumnName: 'Category',
      groupingColumnId: null,
    },
    {
      ...validInput,
      groupingColumnName: null,
      groupingColumnId: 'category-id',
    },
    { ...validInput, frontColumnIds: [] },
    { ...validInput, frontColumnIds: 'title-id' },
    { ...validInput, frontColumnIds: Array(5).fill('front-id') },
    { ...validInput, frontColumnIds: ['title-id', 'title-id'] },
    { ...validInput, backColumnIds: null },
    { ...validInput, backColumnIds: Array(5).fill('back-id') },
    { ...validInput, backColumnIds: ['title-id', 'title-id'] },
    { ...validInput, nokaddoDatasetId: '' },
    { ...validInput, nokaddoDatasetId: false },
  ])('rejects malformed input before any I/O (%#)', async (input) => {
    await expect(
      Promise.resolve().then(() =>
        completeDatasetConnection({ data: input as never }),
      ),
    ).rejects.toMatchObject({ code: 'validation' })
    expect(notionBoundary.withNotionClient).not.toHaveBeenCalled()
    expectNoMutationOrScan()
  })

  it.each([
    [
      'missing face property',
      validInput,
      sourceDataset({
        properties: { Other: sourceProperty('title', 'other') },
      }),
    ],
    [
      'missing grouping property',
      {
        ...validInput,
        groupingColumnName: 'Missing',
        groupingColumnId: 'category-id',
      },
      sourceDataset(),
    ],
    [
      'unsupported grouping property',
      {
        ...validInput,
        groupingColumnName: 'Tags',
        groupingColumnId: 'tags-id',
      },
      sourceDataset({
        properties: {
          Title: sourceProperty('title', 'title-id'),
          Tags: sourceProperty('multi_select', 'tags-id'),
        },
      }),
    ],
  ])('rejects %s before any mutation or scan', async (_case, input, source) => {
    notionBoundary.retrieve.mockResolvedValue(source)

    await expect(
      completeDatasetConnection({ data: input }),
    ).rejects.toMatchObject({ code: 'validation' })
    expectNoMutationOrScan()
  })
})

function expectNoMutationOrScan() {
  expect(datasetBoundary.createNokaddoDataset).not.toHaveBeenCalled()
  expect(datasetBoundary.ensureNokaddoReviewProperties).not.toHaveBeenCalled()
  expect(datasetBoundary.getStoredCardConfigurations).not.toHaveBeenCalled()
  expect(notionBoundary.setCardGroups).not.toHaveBeenCalled()
  expect(datasetBoundary.insertCardConfiguration).not.toHaveBeenCalled()
}

function sourceDataset(
  overrides: Record<string, unknown> = {},
): DataSourceObjectResponse {
  return {
    object: 'data_source',
    id: 'source-id',
    title: [{ plain_text: 'Biology' }],
    description: [],
    icon: null,
    cover: null,
    properties: { Title: sourceProperty('title', 'title-id') },
    ...overrides,
  } as unknown as DataSourceObjectResponse
}

function sourceProperty(type: string, id: string) {
  return { id, name: id, type, [type]: {} } as never
}

function storedConfiguration(overrides: { id?: string } = {}) {
  return {
    id: 'existing-configuration-id',
    dataSetId: 'source-id',
    datasetTitle: 'Biology',
    datasetIconUrl: null,
    groupingColumnName: null,
    groupingColumnId: null,
    groupKeys: [],
    frontColumnIds: ['title-id'],
    backColumnIds: [],
    ...overrides,
  }
}
