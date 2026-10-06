import type { DataSourceObjectResponse } from '@notionhq/client'

export function hasAvailableDatasetFields(
  dataset: unknown,
): dataset is DataSourceObjectResponse {
  if (
    typeof dataset !== 'object' ||
    dataset === null ||
    Array.isArray(dataset)
  ) {
    return false
  }

  const record = dataset as Record<string, unknown>

  return (
    getOwn(record, 'object') === 'data_source' &&
    isNonEmptyString(getOwn(record, 'id')) &&
    isPlainTextArray(getOwn(record, 'title')) &&
    isPlainTextArray(getOwn(record, 'description')) &&
    isValidIcon(getOwn(record, 'icon')) &&
    isValidCover(getOwn(record, 'cover'))
  )
}

function getOwn(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isPlainTextArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) &&
        typeof getOwn(item as Record<string, unknown>, 'plain_text') ===
          'string',
    )
  )
}

function isValidIcon(value: unknown): boolean {
  if (value === null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return false

  const icon = value as Record<string, unknown>

  switch (getOwn(icon, 'type')) {
    case 'file':
      return hasUrl(getOwn(icon, 'file'))
    case 'external':
      return hasUrl(getOwn(icon, 'external'))
    case 'custom_emoji':
      return hasUrl(getOwn(icon, 'custom_emoji'))
    case 'emoji':
      return isNonEmptyString(getOwn(icon, 'emoji'))
    case 'icon':
      return hasNamedIcon(getOwn(icon, 'icon'))
    default:
      return false
  }
}

function isValidCover(value: unknown): boolean {
  if (value === null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return false

  const cover = value as Record<string, unknown>
  return (
    (getOwn(cover, 'type') === 'file' && hasUrl(getOwn(cover, 'file'))) ||
    (getOwn(cover, 'type') === 'external' && hasUrl(getOwn(cover, 'external')))
  )
}

function hasUrl(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    isNonEmptyString(getOwn(value as Record<string, unknown>, 'url'))
  )
}

function hasNamedIcon(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    isNonEmptyString(getOwn(value as Record<string, unknown>, 'name'))
  )
}
