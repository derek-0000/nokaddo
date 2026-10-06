import { createServerFn } from '@tanstack/react-start'
import { isFullPage, iterateAllDataSourceRows } from '@notionhq/client'
import type { Client, PageObjectResponse } from '@notionhq/client'
import { getStoredCardConfigurations } from './dataset-server'
import { validateCardConfigurationAgainstDataset } from './dataset-semantic-validators'
import {
  validateUpdateCardGroupInput,
  validateDatasetId,
} from './dataset-input-validators'
import { validateDataGroupId } from './card-input-validators'
import { withNotionClient } from './client-server'
import {
  getCardGroupKeys,
  toStoredCardConfigurationFromProperties,
  NOKADDO_DATASET_PROPERTIES,
  requireCardGroupConfigProperties,
} from './card-configuration-validators'
import {
  calculateCardStudyStats,
  canonicalizeGroupKeys,
  groupKeysUpdateForConfiguration,
  reconcileGroupKeys,
} from './card-study'
import {
  NOKADDO_REVIEW_PROPERTIES,
  getReviewCheckbox,
  requireReviewCheckboxColumn,
} from './review-property-validators'
import { normalizeNotionPropertyId, toTextChunks } from './helpers'
import { getNotionProperty, requirePageProperties } from './response-validators'
import { elapsedMs, publishStudyTiming } from './study-timing'
import { isCategoryPropertyType } from './types'
import { AppError } from '#/lib/errors'

type PageProperty = PageObjectResponse['properties'][string]

export const getCardGroups = createServerFn({ method: 'GET' })
  .validator(validateDatasetId)
  .handler(({ data }) =>
    withNotionClient((notion) =>
      getStoredCardConfigurations(notion, data.dataSetId),
    ),
  )

export const getCardGroupConfig = createServerFn({ method: 'GET' })
  .validator(validateDataGroupId)
  .handler(({ data }) =>
    withNotionClient(async (notion) => {
      return retrieveCardGroupConfig(notion, data.dataGroupId)
    }),
  )

export const getCardGroupStudyData = createServerFn({ method: 'POST' })
  .validator(validateDataGroupId)
  .handler(async ({ data }) => {
    const serverStartedAt = performance.now()
    const { response, timing } = await withNotionClient(async (notion) => {
      const configStartedAt = performance.now()
      const deckConfig = await retrieveCardGroupConfig(notion, data.dataGroupId)
      const configNotionMs = elapsedMs(configStartedAt)
      const dataSetId = deckConfig[
        NOKADDO_DATASET_PROPERTIES.dataSetId
      ].rich_text
        .map((item) => item.plain_text)
        .join('')
      const groupingColumnName = deckConfig[
        NOKADDO_DATASET_PROPERTIES.groupingColumn
      ].title
        .map((item) => item.plain_text)
        .join('')
      const groupingColumnId = deckConfig[
        NOKADDO_DATASET_PROPERTIES.groupingColumnId
      ].rich_text
        .map((item) => item.plain_text)
        .join('')

      if (!dataSetId) {
        throw new Error('Card group configuration is missing its dataset ID')
      }
      if (Boolean(groupingColumnName) !== Boolean(groupingColumnId)) {
        throw new Error(
          'Card group configuration has inconsistent grouping column metadata',
        )
      }

      const categoryStats = await collectCardGroupStudyStats(notion, {
        dataSetId,
        groupingColumnName: groupingColumnName || null,
        groupingColumnId: groupingColumnId || null,
      })

      const { groupKeys, shouldSync } = reconcileGroupKeys(
        getCardGroupKeys(deckConfig),
        categoryStats.groupKeys,
      )

      let metadataSyncMs = 0
      if (shouldSync) {
        const metadataSyncStartedAt = performance.now()
        try {
          await notion.pages.update({
            page_id: data.dataGroupId,
            properties: {
              [NOKADDO_DATASET_PROPERTIES.groupKeys]: {
                rich_text: toTextChunks(JSON.stringify(groupKeys)),
              },
            },
          })
        } catch {
          // Group metadata is a cache of the live source scan. Study data stays
          // usable when this best-effort synchronization cannot be persisted.
        }
        metadataSyncMs = elapsedMs(metadataSyncStartedAt)
      }

      return {
        response: {
          deckConfig,
          groupKeys,
          groupingColumnType: categoryStats.groupingColumnType,
          categoryStats: {
            overall: categoryStats.overall,
            byCategory: categoryStats.byCategory,
          },
        },
        timing: {
          configNotionMs,
          metadataSyncMs,
          metadataSyncAttempted: shouldSync,
          ...categoryStats.timing,
        },
      }
    })
    const serverTotalMs = elapsedMs(serverStartedAt)
    const appAndSessionMs = Math.max(
      0,
      serverTotalMs -
        timing.configNotionMs -
        timing.schemaNotionMs -
        timing.sourceScanMs -
        timing.metadataSyncMs,
    )

    publishStudyTiming(
      'deck-study-data',
      [
        { name: 'deck-total', durationMs: serverTotalMs },
        { name: 'config-notion', durationMs: timing.configNotionMs },
        { name: 'schema-notion', durationMs: timing.schemaNotionMs },
        {
          name: 'source-scan',
          durationMs: timing.sourceScanMs,
          description: `${timing.scannedRows} rows`,
        },
        { name: 'scan-local', durationMs: timing.rowProcessingMs },
        { name: 'metadata-sync', durationMs: timing.metadataSyncMs },
        { name: 'app-session', durationMs: appAndSessionMs },
      ],
      {
        scannedRows: timing.scannedRows,
        metadataSyncAttempted: timing.metadataSyncAttempted,
      },
    )

    return response
  })

export const updateCardGroup = createServerFn({ method: 'POST' })
  .validator(validateUpdateCardGroupInput)
  .handler(({ data }) =>
    withNotionClient(async (notion) => {
      const properties = await retrieveCardGroupConfig(notion, data.dataGroupId)
      const stored = toStoredCardConfigurationFromProperties(
        data.dataGroupId,
        properties,
      )
      if (!stored) throw new AppError('validation')
      const source = await notion.dataSources.retrieve({
        data_source_id: stored.dataSetId,
      })
      if (!Object.hasOwn(source, 'properties')) throw new AppError('validation')
      const groupingColumn =
        data.groupingColumnId === null
          ? null
          : Object.values(source.properties).find(
              (column) =>
                normalizeNotionPropertyId(column.id) ===
                normalizeNotionPropertyId(data.groupingColumnId ?? ''),
            )
      if (data.groupingColumnId !== null && !groupingColumn)
        throw new AppError('validation')
      const configuration = {
        ...stored,
        ...data,
        groupingColumnName: groupingColumn?.name ?? null,
        groupingColumnId: groupingColumn?.id ?? null,
      }
      validateCardConfigurationAgainstDataset(configuration, source.properties)
      const groupKeysUpdate = groupKeysUpdateForConfiguration({
        storedGroupingColumnId: stored.groupingColumnId,
        groupingColumnId: configuration.groupingColumnId,
        groupingColumnName: configuration.groupingColumnName,
      })
      let groupKeys = stored.groupKeys
      if (groupKeysUpdate === 'clear') {
        groupKeys = []
      } else if (groupKeysUpdate === 'rebuild') {
        const groupingColumnId = configuration.groupingColumnId
        const groupingColumnName = configuration.groupingColumnName
        if (groupingColumnId === null || groupingColumnName === null) {
          throw new AppError('validation')
        }
        groupKeys = await setCardGroups(notion, {
          dataSetId: stored.dataSetId,
          groupingColumnId,
          groupingColumnName,
        })
      }
      await notion.pages.update({
        page_id: data.dataGroupId,
        properties: {
          [NOKADDO_DATASET_PROPERTIES.groupingColumn]: {
            title: toTextChunks(configuration.groupingColumnName ?? ''),
          },
          [NOKADDO_DATASET_PROPERTIES.groupingColumnId]: {
            rich_text: toTextChunks(configuration.groupingColumnId ?? ''),
          },
          [NOKADDO_DATASET_PROPERTIES.groupKeys]: {
            rich_text: toTextChunks(JSON.stringify(groupKeys)),
          },
          [NOKADDO_DATASET_PROPERTIES.front]: {
            rich_text: toTextChunks(JSON.stringify(data.frontColumnIds)),
          },
          [NOKADDO_DATASET_PROPERTIES.back]: {
            rich_text: toTextChunks(JSON.stringify(data.backColumnIds)),
          },
        },
      })
      return { groupingColumnId: configuration.groupingColumnId }
    }),
  )

export const deleteCardGroup = createServerFn({ method: 'POST' })
  .validator(validateDataGroupId)
  .handler(({ data }) =>
    withNotionClient(async (notion) => {
      const deckConfig = await retrieveCardGroupConfig(notion, data.dataGroupId)
      const dataSetId = deckConfig[
        NOKADDO_DATASET_PROPERTIES.dataSetId
      ].rich_text
        .map((item) => item.plain_text)
        .join('')

      if (!dataSetId) {
        throw new Error('Card group configuration is missing its dataset ID')
      }

      const sourceDataset = await notion.dataSources.retrieve({
        data_source_id: dataSetId,
      })
      const propertiesToDelete: Parameters<
        Client['dataSources']['update']
      >[0]['properties'] = {}

      for (const propertyName of Object.values(NOKADDO_REVIEW_PROPERTIES)) {
        const property = getNotionProperty(
          sourceDataset.properties,
          propertyName,
        )
        if (property) propertiesToDelete[property.id] = null
      }

      if (Object.keys(propertiesToDelete).length > 0) {
        await notion.dataSources.update({
          data_source_id: dataSetId,
          properties: propertiesToDelete,
        })
      }

      await notion.pages.update({
        page_id: data.dataGroupId,
        in_trash: true,
      })

      return { dataGroupId: data.dataGroupId }
    }),
  )

export async function setCardGroups(
  notion: Client,
  data: {
    dataSetId: string
    groupingColumnName: string
    groupingColumnId: string
  },
) {
  const dataSource = await notion.dataSources.retrieve({
    data_source_id: data.dataSetId,
  })

  if (!Object.hasOwn(dataSource, 'properties')) {
    throw new Error('Dataset did not provide a property schema')
  }

  const groupingColumn = resolvePropertyReference(
    dataSource.properties,
    data.groupingColumnName,
    data.groupingColumnId,
  )

  if (!groupingColumn || !isCategoryPropertyType(groupingColumn.type)) {
    throw new Error(
      `Grouping column "${data.groupingColumnName}" could not be found`,
    )
  }

  const groups = new Set<string>()
  let hasConfirmedFormulaResult = groupingColumn.type !== 'formula'

  for await (const row of iterateAllDataSourceRows(notion, {
    data_source_id: data.dataSetId,
    filter_properties: [groupingColumn.id],
    result_type: 'page',
  })) {
    if (!isFullPage(row)) continue

    const property = resolvePropertyReference(
      row.properties,
      data.groupingColumnName,
      data.groupingColumnId,
    )
    if (!property) continue

    if (groupingColumn.type === 'formula') {
      if (property.type !== 'formula' || property.formula.type !== 'string') {
        throw new AppError('validation')
      }
      hasConfirmedFormulaResult = true
    }

    for (const value of getGroupValues(property)) {
      groups.add(value)
    }
  }

  if (!hasConfirmedFormulaResult) {
    throw new AppError('validation')
  }

  return canonicalizeGroupKeys([...groups])
}

async function collectCardGroupStudyStats(
  notion: Client,
  data: {
    dataSetId: string
    groupingColumnName: string | null
    groupingColumnId: string | null
  },
) {
  const schemaStartedAt = performance.now()
  const dataSource = await notion.dataSources.retrieve({
    data_source_id: data.dataSetId,
  })
  const schemaNotionMs = elapsedMs(schemaStartedAt)

  if (!Object.hasOwn(dataSource, 'properties')) {
    throw new Error('Dataset did not provide a property schema')
  }

  const groupingColumn =
    data.groupingColumnName && data.groupingColumnId
      ? resolvePropertyReference(
          dataSource.properties,
          data.groupingColumnName,
          data.groupingColumnId,
        )
      : undefined

  if (
    data.groupingColumnName &&
    (!groupingColumn || !isCategoryPropertyType(groupingColumn.type))
  ) {
    throw new Error(
      `Grouping column "${data.groupingColumnName}" could not be found`,
    )
  }

  const visitedColumn = requireReviewCheckboxColumn(
    dataSource.properties,
    NOKADDO_REVIEW_PROPERTIES.visited,
  )
  const completedColumn = requireReviewCheckboxColumn(
    dataSource.properties,
    NOKADDO_REVIEW_PROPERTIES.completed,
  )
  const rows = []
  const groupKeys = new Set<string>()
  let scannedRows = 0
  let rowProcessingMs = 0
  const sourceScanStartedAt = performance.now()

  for await (const row of iterateAllDataSourceRows(notion, {
    data_source_id: data.dataSetId,
    filter_properties: [
      ...(groupingColumn ? [groupingColumn.id] : []),
      visitedColumn.id,
      completedColumn.id,
    ],
    result_type: 'page',
  })) {
    const rowProcessingStartedAt = performance.now()
    if (!isFullPage(row)) {
      rowProcessingMs += elapsedMs(rowProcessingStartedAt)
      continue
    }
    scannedRows += 1

    const visited = getReviewCheckbox(
      row.properties,
      NOKADDO_REVIEW_PROPERTIES.visited,
    )
    const completed = getReviewCheckbox(
      row.properties,
      NOKADDO_REVIEW_PROPERTIES.completed,
    )

    const groupValues =
      data.groupingColumnName && data.groupingColumnId
        ? getGroupValues(
            resolvePropertyReference(
              row.properties,
              data.groupingColumnName,
              data.groupingColumnId,
            ),
          )
        : []

    for (const value of groupValues) {
      if (value) groupKeys.add(value)
    }

    rows.push({
      visited: Boolean(visited),
      completed: Boolean(completed),
      groupValues,
    })
    rowProcessingMs += elapsedMs(rowProcessingStartedAt)
  }
  const sourceScanMs = elapsedMs(sourceScanStartedAt)

  return {
    ...calculateCardStudyStats(rows),
    groupKeys: canonicalizeGroupKeys([...groupKeys]),
    groupingColumnType:
      groupingColumn && isCategoryPropertyType(groupingColumn.type)
        ? groupingColumn.type
        : null,
    timing: {
      schemaNotionMs,
      sourceScanMs,
      rowProcessingMs,
      scannedRows,
    },
  }
}

async function retrieveCardGroupConfig(notion: Client, dataGroupId: string) {
  const page = await notion.pages.retrieve({ page_id: dataGroupId })
  const properties = requirePageProperties(
    page,
    'Card group configuration page could not be retrieved',
  )

  return requireCardGroupConfigProperties(properties)
}

function getGroupValues(property: PageProperty | undefined): string[] {
  if (!property) return []

  switch (property.type) {
    case 'title':
      return nonEmptyValue(
        property.title.map((fragment) => fragment.plain_text).join(''),
      )
    case 'rich_text':
      return nonEmptyValue(
        property.rich_text.map((fragment) => fragment.plain_text).join(''),
      )
    case 'select':
      return nonEmptyValue(ownOptionName(property.select))
    case 'status':
      return nonEmptyValue(ownOptionName(property.status))
    case 'formula':
      return property.formula.type === 'string'
        ? nonEmptyValue(property.formula.string)
        : []
    default:
      return []
  }
}

function nonEmptyValue(value: string | null | undefined) {
  return value ? [value] : []
}

function ownOptionName(value: { name: string } | null) {
  return value && Object.hasOwn(value, 'name') ? value.name : null
}

function resolvePropertyReference<TProperty extends { id: string }>(
  properties: Record<string, TProperty>,
  storedName: string,
  storedId: string,
): TProperty | undefined {
  const normalizedId = normalizeNotionPropertyId(storedId)
  const propertyByName = getNotionProperty(properties, storedName)

  if (
    propertyByName &&
    normalizeNotionPropertyId(propertyByName.id) === normalizedId
  ) {
    return propertyByName
  }

  return Object.values(properties).find(
    (property) => normalizeNotionPropertyId(property.id) === normalizedId,
  )
}
