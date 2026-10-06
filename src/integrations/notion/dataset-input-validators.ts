import type { DataSourceObjectResponse } from '@notionhq/client'
import { AppError } from '#/lib/errors'
import type {
  CompleteDatasetConnectionInput,
  GetNotionDatasetItemsInput,
} from './types'

type DatasetIdInput = { dataSetId: string }
type AvailableDatasetsInput = { excludedDatasetId: string | null }
type CursorInput = { cursor: string | null }

export function validateDatasetId(data: unknown): DatasetIdInput {
  const record = requireRecord(data)

  if (!isNonEmptyString(getOwn(record, 'dataSetId'))) {
    throwValidation()
  }

  return record as DatasetIdInput
}

export function validateGetAvailableDatasetsInput(
  data: unknown,
): AvailableDatasetsInput {
  const record = requireRecord(data)

  if (!isNullableNonEmptyString(getOwn(record, 'excludedDatasetId'))) {
    throwValidation()
  }

  return record as AvailableDatasetsInput
}

export function validateCursorInput(data: unknown): CursorInput {
  const record = requireRecord(data)

  if (!isNullableNonEmptyString(getOwn(record, 'cursor'))) {
    throwValidation()
  }

  return record as CursorInput
}

export function validateGetNotionDatasetItemsInput(
  data: unknown,
): GetNotionDatasetItemsInput {
  const record = requireRecord(data)
  validateDatasetId(record)

  if (
    !Number.isInteger(getOwn(record, 'limit')) ||
    (getOwn(record, 'limit') as number) < 1 ||
    (getOwn(record, 'limit') as number) > 100 ||
    !Array.isArray(getOwn(record, 'fields')) ||
    !(getOwn(record, 'fields') as unknown[]).every(isDatasetField) ||
    typeof getOwn(record, 'requirePopulatedField') !== 'boolean'
  ) {
    throwValidation()
  }

  return record as GetNotionDatasetItemsInput
}

export function validateCompleteDatasetConnectionInput(
  data: unknown,
): CompleteDatasetConnectionInput {
  const record = requireRecord(data)
  validateDatasetId(record)

  if (
    !isNonEmptyString(getOwn(record, 'datasetTitle')) ||
    !isValidDatasetIcon(getOwn(record, 'datasetIcon')) ||
    !isNullableNonEmptyString(getOwn(record, 'groupingColumnName')) ||
    !isNullableNonEmptyString(getOwn(record, 'groupingColumnId')) ||
    (getOwn(record, 'groupingColumnName') === null) !==
      (getOwn(record, 'groupingColumnId') === null) ||
    !isColumnIdList(getOwn(record, 'frontColumnIds'), 1, 4) ||
    !isColumnIdList(getOwn(record, 'backColumnIds'), 0, 4) ||
    !isNullableNonEmptyString(getOwn(record, 'nokaddoDatasetId'))
  ) {
    throwValidation()
  }

  return record as CompleteDatasetConnectionInput
}

export function validateUpdateCardGroupInput(data: unknown) {
  const record = requireRecord(data)
  const dataGroupId = getOwn(record, 'dataGroupId')
  const groupingColumnId = getOwn(record, 'groupingColumnId')
  const frontColumnIds = getOwn(record, 'frontColumnIds')
  const backColumnIds = getOwn(record, 'backColumnIds')
  if (
    !isNonEmptyString(dataGroupId) ||
    !isNullableNonEmptyString(groupingColumnId) ||
    !isColumnIdList(frontColumnIds, 1, 4) ||
    !isColumnIdList(backColumnIds, 0, 4)
  )
    throwValidation()
  return { dataGroupId, groupingColumnId, frontColumnIds, backColumnIds }
}

function requireRecord(data: unknown): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throwValidation()
  }

  return data as Record<string, unknown>
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function getOwn(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined
}

function isNullableNonEmptyString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value)
}

function isDatasetField(
  value: unknown,
): value is GetNotionDatasetItemsInput['fields'][number] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const field = value as Record<string, unknown>
  return (
    isNonEmptyString(getOwn(field, 'id')) &&
    isNonEmptyString(getOwn(field, 'type'))
  )
}

function isColumnIdList(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): value is string[] {
  if (
    !Array.isArray(value) ||
    value.length < minimumLength ||
    value.length > maximumLength ||
    !value.every(isNonEmptyString)
  ) {
    return false
  }

  return new Set(value).size === value.length
}

function isValidDatasetIcon(
  icon: unknown,
): icon is DataSourceObjectResponse['icon'] {
  if (icon === null) return true
  if (typeof icon !== 'object' || Array.isArray(icon)) return false

  const record = icon as Record<string, unknown>

  switch (record.type) {
    case 'file':
      return hasNestedNonEmptyString(record, 'file', 'url')
    case 'external':
      return hasNestedNonEmptyString(record, 'external', 'url')
    case 'custom_emoji':
      return hasNestedNonEmptyString(record, 'custom_emoji', 'url')
    case 'emoji':
      return isNonEmptyString(record.emoji)
    case 'icon':
      return hasNestedNonEmptyString(record, 'icon', 'name')
    default:
      return false
  }
}

function hasNestedNonEmptyString(
  record: Record<string, unknown>,
  containerKey: string,
  valueKey: string,
) {
  const container = getOwn(record, containerKey)

  return (
    typeof container === 'object' &&
    container !== null &&
    !Array.isArray(container) &&
    isNonEmptyString(getOwn(container as Record<string, unknown>, valueKey))
  )
}

function throwValidation(): never {
  throw new AppError('validation')
}
