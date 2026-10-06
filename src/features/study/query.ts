import { NOTION_WINDOW_SIZE } from './types'
import type { StudyQuery } from './types'
import type { QueryDataSourceParameters } from '@notionhq/client'
import type { CategoryPropertyType } from '#/integrations/notion/types'

export type StudyDeckConfiguration = {
  dataSetId: string
  groupingColumnId: string | null
  frontColumnIds: string[]
  backColumnIds: string[]
}

export type StudyCategorySelection = {
  value: string
  propertyType: CategoryPropertyType
}

export function createStudyQuery(
  configuration: StudyDeckConfiguration,
  category?: StudyCategorySelection,
): StudyQuery {
  const groupPropertyId = configuration.groupingColumnId ?? undefined

  if (category && !groupPropertyId) {
    throw new Error('A category selection requires a grouping property')
  }

  return {
    dataSourceId: configuration.dataSetId,
    filter:
      category && groupPropertyId
        ? createCategoryFilter(
            groupPropertyId,
            category.propertyType,
            category.value,
          )
        : undefined,
    sorts: [],
    pageSize: NOTION_WINDOW_SIZE,
    frontPropertyIds: configuration.frontColumnIds,
    backPropertyIds: configuration.backColumnIds,
    groupPropertyId,
  }
}

function createCategoryFilter(
  propertyId: string,
  propertyType: CategoryPropertyType,
  value: string,
): NonNullable<QueryDataSourceParameters['filter']> {
  switch (propertyType) {
    case 'title':
      return { property: propertyId, title: { equals: value } }
    case 'rich_text':
      return { property: propertyId, rich_text: { equals: value } }
    case 'select':
      return { property: propertyId, select: { equals: value } }
    case 'status':
      return { property: propertyId, status: { equals: value } }
    case 'formula':
      return { property: propertyId, formula: { string: { equals: value } } }
  }
}

export function createQueryFingerprint(query: StudyQuery) {
  const serialized = stableSerialize(query)
  let hash = 2166136261

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return `v1-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return 'undefined'

  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }

  const record = value as Record<string, unknown>
  const properties = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)

  return `{${properties.join(',')}}`
}
