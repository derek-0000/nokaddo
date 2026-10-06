import type { DataSourceObjectResponse } from '@notionhq/client'

export type NotionUser = {
  id: string
  name: string | null
  email: string | null
  avatarUrl: string | null
}

export type NotionViewer = {
  workspaceId: string
  workspaceName: string | null
  workspaceIcon: string | null
  user: NotionUser | null
}

export type CompleteNotionAuthInput = {
  code: string | null
  state: string | null
  error?: string | null
}

export type NotionDatasetField = {
  id: string
  type: string
}

export type CardConfigurationInput = {
  dataSetId: string
  datasetTitle: string
  datasetIcon: DataSourceObjectResponse['icon']
  groupingColumnName: string | null
  groupingColumnId: string | null
  frontColumnIds: string[]
  backColumnIds: string[]
}

export const CATEGORY_PROPERTY_TYPES = [
  'title',
  'rich_text',
  'select',
  'status',
  'formula',
] as const

export type CategoryPropertyType = (typeof CATEGORY_PROPERTY_TYPES)[number]

export function isCategoryPropertyType(
  type: string,
): type is CategoryPropertyType {
  return (CATEGORY_PROPERTY_TYPES as readonly string[]).includes(type)
}

export type CompleteDatasetConnectionInput = CardConfigurationInput & {
  nokaddoDatasetId: string | null
}

export type GetNotionDatasetItemsInput = {
  dataSetId: string
  limit: number
  fields: NotionDatasetField[]
  requirePopulatedField: boolean
}
