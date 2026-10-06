import '@tanstack/react-start/server-only'

import { isFullPage } from '@notionhq/client'
import type { Client, QueryDataSourceResponse } from '@notionhq/client'
import { withNotionClient } from './client-server'
import {
  NOKADDO_DATASET_PROPERTIES,
  toStoredCardConfiguration,
} from './card-configuration-validators'
import {
  NOKADDO_REVIEW_PROPERTY_TYPES,
  validateReviewPropertyType,
} from './review-property-validators'
import {
  toNotionDatasetItem,
  toPopulatedPropertyFilter,
  toText,
  toTextChunks,
} from './helpers'
import { getNotionProperty } from './response-validators'
import type {
  CardConfigurationInput,
  GetNotionDatasetItemsInput,
} from './types'

const NOKADDO_DATASET_TITLE = 'nokaddo-cards'

export async function queryNotionDatasetItems({
  dataSetId,
  limit,
  fields,
  requirePopulatedField,
}: GetNotionDatasetItemsInput) {
  const populatedFieldFilter = requirePopulatedField
    ? fields
        .map(toPopulatedPropertyFilter)
        .find((filter) => filter !== undefined)
    : undefined

  const response = await withNotionClient((notion) =>
    notion.dataSources.query({
      data_source_id: dataSetId,
      filter_properties:
        fields.length > 0 ? fields.map((field) => field.id) : undefined,
      filter: populatedFieldFilter,
      page_size: limit,
      result_type: 'page',
    }),
  )

  const items = []

  for (const result of response.results) {
    if (isFullPage(result)) {
      items.push(toNotionDatasetItem(result))
    }
  }

  return items
}

export async function createNokaddoDataset(notion: Client) {
  const result = await notion.databases.create({
    parent: { type: 'workspace', workspace: true },
    title: [toText(NOKADDO_DATASET_TITLE)],
    initial_data_source: {
      properties: nokaddoDatasetSchema(),
    },
  })

  if ('data_sources' in result) {
    const dataSourceId = result.data_sources.at(0)?.id
    if (dataSourceId) return dataSourceId
  }

  const retrievedDatabase = await notion.databases.retrieve({
    database_id: result.id,
  })
  if ('data_sources' in retrievedDatabase) {
    const dataSourceId = retrievedDatabase.data_sources.at(0)?.id
    if (dataSourceId) return dataSourceId
  }

  const dataSource = await notion.dataSources.create({
    parent: { database_id: result.id },
    title: [toText(NOKADDO_DATASET_TITLE)],
    properties: nokaddoDatasetSchema(),
  })

  return dataSource.id
}

function nokaddoDatasetSchema() {
  return {
    [NOKADDO_DATASET_PROPERTIES.dataSetId]: { rich_text: {} },
    [NOKADDO_DATASET_PROPERTIES.datasetTitle]: { rich_text: {} },
    [NOKADDO_DATASET_PROPERTIES.datasetIcon]: { files: {} },
    [NOKADDO_DATASET_PROPERTIES.groupingColumn]: { title: {} },
    [NOKADDO_DATASET_PROPERTIES.groupingColumnId]: { rich_text: {} },
    [NOKADDO_DATASET_PROPERTIES.groupKeys]: { rich_text: {} },
    [NOKADDO_DATASET_PROPERTIES.front]: { rich_text: {} },
    [NOKADDO_DATASET_PROPERTIES.back]: { rich_text: {} },
  }
}

export async function ensureNokaddoReviewProperties(
  notion: Client,
  dataSetId: string,
) {
  const dataset = await notion.dataSources.retrieve({
    data_source_id: dataSetId,
  })

  const properties: Parameters<
    Client['dataSources']['update']
  >[0]['properties'] = {}

  for (const [propertyName, propertyType] of Object.entries(
    NOKADDO_REVIEW_PROPERTY_TYPES,
  )) {
    const existingProperty = getNotionProperty(dataset.properties, propertyName)

    if (!existingProperty) {
      properties[propertyName] =
        propertyType === 'checkbox' ? { checkbox: {} } : { date: {} }
      continue
    }

    validateReviewPropertyType(existingProperty, propertyName, propertyType)
  }

  if (Object.keys(properties).length > 0) {
    await notion.dataSources.update({
      data_source_id: dataSetId,
      properties,
    })
  }
}

export async function getStoredCardConfigurations(
  notion: Client,
  nokaddoDatasetId: string,
) {
  const results: QueryDataSourceResponse['results'] = []
  let startCursor: string | undefined

  do {
    const response = await notion.dataSources.query({
      data_source_id: nokaddoDatasetId,
      result_type: 'page',
      start_cursor: startCursor,
    })
    results.push(...response.results)
    startCursor = response.next_cursor ?? undefined
  } while (startCursor)

  const configurations = []

  for (const result of results) {
    if (!isFullPage(result)) continue

    const configuration = toStoredCardConfiguration(result)
    if (configuration) configurations.push(configuration)
  }

  return configurations
}

export async function insertCardConfiguration(
  notion: Client,
  nokaddoDatasetId: string,
  configuration: CardConfigurationInput,
  groupKeys: string[],
) {
  const result = await notion.pages.create({
    parent: { type: 'data_source_id', data_source_id: nokaddoDatasetId },
    properties: {
      [NOKADDO_DATASET_PROPERTIES.dataSetId]: {
        rich_text: [toText(configuration.dataSetId)],
      },
      [NOKADDO_DATASET_PROPERTIES.datasetTitle]: {
        rich_text: [toText(configuration.datasetTitle)],
      },
      [NOKADDO_DATASET_PROPERTIES.datasetIcon]: {
        files: toDatasetIconFiles(configuration.datasetIcon),
      },
      [NOKADDO_DATASET_PROPERTIES.groupingColumn]: {
        title: configuration.groupingColumnName
          ? [toText(configuration.groupingColumnName)]
          : [],
      },
      [NOKADDO_DATASET_PROPERTIES.groupingColumnId]: {
        rich_text: configuration.groupingColumnId
          ? [toText(configuration.groupingColumnId)]
          : [],
      },
      [NOKADDO_DATASET_PROPERTIES.groupKeys]: {
        rich_text: toTextChunks(JSON.stringify(groupKeys)),
      },
      [NOKADDO_DATASET_PROPERTIES.front]: {
        rich_text: [toText(JSON.stringify(configuration.frontColumnIds))],
      },
      [NOKADDO_DATASET_PROPERTIES.back]: {
        rich_text: [toText(JSON.stringify(configuration.backColumnIds))],
      },
    },
  })

  return result.id
}

function toDatasetIconFiles(icon: CardConfigurationInput['datasetIcon']) {
  switch (icon?.type) {
    case 'file':
      return [
        { type: 'file' as const, file: { url: icon.file.url }, name: 'icon' },
      ]
    case 'external':
      return [
        {
          type: 'external' as const,
          external: { url: icon.external.url },
          name: 'icon',
        },
      ]
    case 'custom_emoji':
      return [
        {
          type: 'external' as const,
          external: { url: icon.custom_emoji.url },
          name: 'icon',
        },
      ]
    default:
      return []
  }
}
