import { createServerFn } from '@tanstack/react-start'
import type { QueryDataSourceParameters } from '@notionhq/client'
import { queryStudyWindow, updateStudyProgress } from './study-server'
import { NOTION_WINDOW_SIZE } from '#/features/study/types'
import type { StudyQuery, StudySort } from '#/features/study/types'
import { AppError } from '#/lib/errors'

type StudyWindowInput = {
  query: StudyQuery
  startCursor: string | null
}

export const getStudyWindow = createServerFn({ method: 'GET' })
  .validator(validateStudyWindowInput)
  .handler(({ data }) => queryStudyWindow(data.query, data.startCursor))

export function validateStudyWindowInput(data: unknown): StudyWindowInput {
  if (!isRecord(data)) throw new AppError('validation')

  const query = validateStudyQuery(data.query)
  if (!isCursor(data.startCursor)) throw new AppError('validation')

  return { query, startCursor: data.startCursor }
}

function validateStudyQuery(query: unknown): StudyQuery {
  if (!isRecord(query)) throw new AppError('validation')

  if (!isNonEmptyString(query.dataSourceId)) throw new AppError('validation')
  if (query.pageSize !== NOTION_WINDOW_SIZE) throw new AppError('validation')
  if (!isPropertyIdList(query.frontPropertyIds)) {
    throw new AppError('validation')
  }
  if (!isPropertyIdList(query.backPropertyIds)) {
    throw new AppError('validation')
  }
  if (
    query.groupPropertyId !== undefined &&
    !isNonEmptyString(query.groupPropertyId)
  ) {
    throw new AppError('validation')
  }
  if (!Array.isArray(query.sorts) || !query.sorts.every(isStudySort)) {
    throw new AppError('validation')
  }
  if (query.filter !== undefined && !isJsonValue(query.filter)) {
    throw new AppError('validation')
  }

  return {
    dataSourceId: query.dataSourceId,
    // The filter is only known to be JSON here. Notion validates its shape and
    // rejects anything it does not understand with a 400.
    filter: query.filter as QueryDataSourceParameters['filter'] | undefined,
    sorts: query.sorts,
    pageSize: NOTION_WINDOW_SIZE,
    frontPropertyIds: query.frontPropertyIds,
    backPropertyIds: query.backPropertyIds,
    groupPropertyId: query.groupPropertyId,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isCursor(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value)
}

function isPropertyIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString)
}

function isStudySort(value: unknown): value is StudySort {
  if (!isRecord(value)) return false
  if (value.direction !== 'ascending' && value.direction !== 'descending') {
    return false
  }

  if ('property' in value) return isNonEmptyString(value.property)

  return (
    value.timestamp === 'created_time' || value.timestamp === 'last_edited_time'
  )
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true
  }

  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (!isRecord(value)) return false

  return Object.values(value).every(isJsonValue)
}

export type StudyProgressInput = Parameters<typeof updateStudyProgress>[0]

export const saveStudyProgress = createServerFn({ method: 'POST' })
  .validator((data: unknown): StudyProgressInput => {
    if (
      !isRecord(data) ||
      !isNonEmptyString(data.pageId) ||
      (data.action !== 'visit' &&
        data.action !== 'learn' &&
        data.action !== 'unlearn')
    ) {
      throw new AppError('validation')
    }
    return { pageId: data.pageId, action: data.action }
  })
  .handler(({ data }) => updateStudyProgress(data))
