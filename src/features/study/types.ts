import type { QueryDataSourceParameters } from '@notionhq/client'

export const NOTION_WINDOW_SIZE = 20
export const NOTION_PREFETCH_INDEX = 15

export type CompactCard = {
  id: string
  visited: boolean
  completed: boolean
  front: string[]
  back: string[]
  groupKey?: string | null
}

export type StudySort =
  | {
      property: string
      direction: 'ascending' | 'descending'
    }
  | {
      timestamp: 'created_time' | 'last_edited_time'
      direction: 'ascending' | 'descending'
    }

export type StudyQuery = {
  dataSourceId: string
  filter?: QueryDataSourceParameters['filter']
  sorts: StudySort[]
  pageSize: typeof NOTION_WINDOW_SIZE
  frontPropertyIds: string[]
  backPropertyIds: string[]
  groupPropertyId?: string
}

export type CardWindow = {
  nextCursor: string | null
  cards: CompactCard[]
}

export type StudyWindowSource = {
  fetchWindow: (
    query: StudyQuery,
    startCursor: string | null,
  ) => Promise<CardWindow>
}
