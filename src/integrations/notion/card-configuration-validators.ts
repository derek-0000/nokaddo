import type { PageObjectResponse, RichTextItemResponse } from '@notionhq/client'
import { getNotionProperty } from './response-validators'

export const NOKADDO_DATASET_PROPERTIES = {
  dataSetId: 'dataset_id',
  datasetTitle: 'dataset_title',
  datasetIcon: 'dataset_icon',
  groupingColumn: 'grouper_column',
  groupingColumnId: 'grouper_column_id',
  groupKeys: 'group_keys',
  front: 'front',
  back: 'back',
} as const

const CARD_CONFIGURATION_PROPERTY_TYPES = {
  [NOKADDO_DATASET_PROPERTIES.dataSetId]: 'rich_text',
  [NOKADDO_DATASET_PROPERTIES.datasetTitle]: 'rich_text',
  [NOKADDO_DATASET_PROPERTIES.datasetIcon]: 'files',
  [NOKADDO_DATASET_PROPERTIES.groupingColumn]: 'title',
  [NOKADDO_DATASET_PROPERTIES.groupingColumnId]: 'rich_text',
  [NOKADDO_DATASET_PROPERTIES.groupKeys]: 'rich_text',
  [NOKADDO_DATASET_PROPERTIES.front]: 'rich_text',
  [NOKADDO_DATASET_PROPERTIES.back]: 'rich_text',
} as const

type PageProperty = PageObjectResponse['properties'][string]

export type CardGroupConfigProperties = PageObjectResponse['properties'] & {
  [PropertyName in keyof typeof CARD_CONFIGURATION_PROPERTY_TYPES]: Extract<
    PageProperty,
    { type: (typeof CARD_CONFIGURATION_PROPERTY_TYPES)[PropertyName] }
  >
}

export function hasCardGroupConfigProperties(
  properties: PageObjectResponse['properties'],
): properties is CardGroupConfigProperties {
  return getCardGroupConfigPropertyIssue(properties) === null
}

export function requireCardGroupConfigProperties(
  properties: PageObjectResponse['properties'],
): CardGroupConfigProperties {
  const issue = getCardGroupConfigPropertyIssue(properties)

  if (issue?.kind === 'missing') {
    throw new Error(
      `Card group configuration is missing the "${issue.propertyName}" property`,
    )
  }

  if (issue?.kind === 'wrong_type') {
    throw new Error(
      `Card group configuration property "${issue.propertyName}" must be "${issue.expectedType}", received "${issue.receivedType}"`,
    )
  }

  return properties as CardGroupConfigProperties
}

export function toStoredCardConfiguration(page: PageObjectResponse) {
  if (!hasCardGroupConfigProperties(page.properties)) return null

  return toStoredCardConfigurationFromProperties(page.id, page.properties)
}

export function toStoredCardConfigurationFromProperties(
  id: string,
  properties: CardGroupConfigProperties,
) {
  const dataSetId = getRichText(
    properties[NOKADDO_DATASET_PROPERTIES.dataSetId].rich_text,
  )
  const frontColumnIds = parseStringArray(
    getRichText(properties[NOKADDO_DATASET_PROPERTIES.front].rich_text),
  )
  const backColumnIds = parseStringArray(
    getRichText(properties[NOKADDO_DATASET_PROPERTIES.back].rich_text),
  )

  if (!dataSetId || !frontColumnIds || !backColumnIds) return null

  return {
    id,
    dataSetId,
    datasetTitle: getCardGroupDatasetTitle(properties),
    datasetIconUrl: getCardGroupDatasetIconUrl(properties),
    groupingColumnName:
      getRichText(
        properties[NOKADDO_DATASET_PROPERTIES.groupingColumn].title,
      ) || null,
    groupingColumnId:
      getRichText(
        properties[NOKADDO_DATASET_PROPERTIES.groupingColumnId].rich_text,
      ) || null,
    groupKeys: getCardGroupKeys(properties),
    frontColumnIds,
    backColumnIds,
  }
}

export function getCardGroupKeys(properties: CardGroupConfigProperties) {
  return (
    parseStringArray(
      getRichText(properties[NOKADDO_DATASET_PROPERTIES.groupKeys].rich_text),
    ) ?? []
  )
}

export function getCardGroupDatasetTitle(
  properties: CardGroupConfigProperties,
) {
  return getRichText(
    properties[NOKADDO_DATASET_PROPERTIES.datasetTitle].rich_text,
  )
}

export function getCardGroupDatasetIconUrl(
  properties: CardGroupConfigProperties,
) {
  const file = properties[NOKADDO_DATASET_PROPERTIES.datasetIcon].files.at(0)

  if (file?.type === 'file') return file.file.url
  if (file?.type === 'external') return file.external.url

  return null
}

type CardGroupConfigPropertyIssue =
  | {
      kind: 'missing'
      propertyName: string
    }
  | {
      kind: 'wrong_type'
      propertyName: string
      expectedType: string
      receivedType: string
    }

function getCardGroupConfigPropertyIssue(
  properties: PageObjectResponse['properties'],
): CardGroupConfigPropertyIssue | null {
  for (const [propertyName, expectedType] of Object.entries(
    CARD_CONFIGURATION_PROPERTY_TYPES,
  )) {
    const property = getNotionProperty(properties, propertyName)

    if (!property) {
      return { kind: 'missing', propertyName }
    }

    if (property.type !== expectedType) {
      return {
        kind: 'wrong_type',
        propertyName,
        expectedType,
        receivedType: property.type,
      }
    }
  }

  return null
}

function getRichText(items: RichTextItemResponse[]) {
  return items.map((item) => item.plain_text).join('')
}

function parseStringArray(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === 'string')
      ? parsed
      : null
  } catch {
    return null
  }
}
