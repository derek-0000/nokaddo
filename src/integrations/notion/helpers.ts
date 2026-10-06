import type {
  PageObjectResponse,
  QueryDataSourceParameters,
} from '@notionhq/client'

const NOTION_TEXT_CONTENT_LIMIT = 2_000
const NOTION_RICH_TEXT_ITEM_LIMIT = 100

export function normalizeNotionPropertyId(propertyId: string): string {
  try {
    return decodeURIComponent(propertyId)
  } catch {
    return propertyId
  }
}

export function sameGroupingColumnId(
  storedId: string | null,
  nextId: string | null,
) {
  if (storedId === null || nextId === null) return storedId === nextId
  return (
    normalizeNotionPropertyId(storedId) === normalizeNotionPropertyId(nextId)
  )
}

export function toText(content: string) {
  return { type: 'text' as const, text: { content } }
}

export function toTextChunks(content: string) {
  const characters = Array.from(content)
  const maximumLength = NOTION_TEXT_CONTENT_LIMIT * NOTION_RICH_TEXT_ITEM_LIMIT

  if (characters.length > maximumLength) {
    throw new Error(
      `Rich text content exceeds Notion's ${maximumLength.toLocaleString()} character limit`,
    )
  }

  const chunks = []

  for (
    let index = 0;
    index < characters.length;
    index += NOTION_TEXT_CONTENT_LIMIT
  ) {
    chunks.push(
      toText(
        characters.slice(index, index + NOTION_TEXT_CONTENT_LIMIT).join(''),
      ),
    )
  }

  return chunks
}

export function toNotionDatasetItem(page: PageObjectResponse) {
  return {
    id: page.id,
    properties: Object.entries(page.properties).map(([name, property]) => ({
      id: normalizeNotionPropertyId(property.id),
      name,
      value: formatNotionProperty(property),
    })),
  }
}

export function toPopulatedPropertyFilter({
  id,
  type,
}: {
  id: string
  type: string
}): QueryDataSourceParameters['filter'] | undefined {
  const supportsEmptyFilter = [
    'title',
    'rich_text',
    'number',
    'select',
    'multi_select',
    'status',
    'date',
    'people',
    'files',
    'url',
    'email',
    'phone_number',
    'relation',
    'created_by',
    'created_time',
    'last_edited_by',
    'last_edited_time',
    'unique_id',
  ].includes(type)

  if (!supportsEmptyFilter) return undefined

  return {
    property: id,
    [type]: { is_not_empty: true },
  } as QueryDataSourceParameters['filter']
}

function formatNotionProperty(
  property: PageObjectResponse['properties'][string],
): string {
  return formatNotionValue(
    (property as unknown as Record<string, unknown>)[property.type],
  )
}

function formatNotionValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        const formattedItem = formatNotionValue(item)
        return formattedItem ? [formattedItem] : []
      })
      .join(', ')
  }

  if (typeof value !== 'object') return ''

  const record = value as Record<string, unknown>

  if (typeof record.plain_text === 'string') return record.plain_text
  if (typeof record.name === 'string') return record.name

  if (typeof record.start === 'string') {
    return typeof record.end === 'string'
      ? `${record.start} – ${record.end}`
      : record.start
  }

  if (
    (typeof record.prefix === 'string' || record.prefix === null) &&
    typeof record.number === 'number'
  ) {
    return `${record.prefix ?? ''}${record.number}`
  }

  if (typeof record.type === 'string' && Object.hasOwn(record, record.type)) {
    return formatNotionValue(record[record.type])
  }

  if (typeof record.state === 'string') return record.state
  if (typeof record.address === 'string') return record.address
  if (typeof record.id === 'string') return record.id

  return ''
}
