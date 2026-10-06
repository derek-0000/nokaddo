import type { PageObjectResponse, RichTextItemResponse } from '@notionhq/client'
import { describe, expect, it } from 'vitest'
import {
  NOKADDO_DATASET_PROPERTIES,
  getCardGroupDatasetIconUrl,
  getCardGroupDatasetTitle,
  getCardGroupKeys,
  hasCardGroupConfigProperties,
  requireCardGroupConfigProperties,
  toStoredCardConfiguration,
} from './card-configuration-validators'

type PageProperty = PageObjectResponse['properties'][string]
type PagePropertyType = PageProperty['type']
type PagePropertyOfType<TType extends PagePropertyType> = Extract<
  PageProperty,
  { type: TType }
>
type PagePropertyValue<TType extends PagePropertyType> =
  PagePropertyOfType<TType> extends Record<TType, infer TValue> ? TValue : never

function richText(...plainText: string[]): RichTextItemResponse[] {
  return plainText.map((value) => ({
    type: 'text',
    plain_text: value,
    text: { content: value, link: null },
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default',
    },
    href: null,
  }))
}

function property<TType extends PagePropertyType>(
  type: TType,
  value: PagePropertyValue<TType>,
  id = `property-${type}`,
): PagePropertyOfType<TType> {
  return { id, type, [type]: value } as PagePropertyOfType<TType>
}

function configurationProperties(): PageObjectResponse['properties'] {
  return {
    [NOKADDO_DATASET_PROPERTIES.dataSetId]: property(
      'rich_text',
      richText('source-', 'dataset'),
    ),
    [NOKADDO_DATASET_PROPERTIES.datasetTitle]: property(
      'rich_text',
      richText('Project ', 'Atlas'),
    ),
    [NOKADDO_DATASET_PROPERTIES.datasetIcon]: property('files', [
      {
        type: 'external',
        name: 'icon',
        external: { url: 'https://example.test/icon.png' },
      },
    ]),
    [NOKADDO_DATASET_PROPERTIES.groupingColumn]: property(
      'title',
      richText('Category'),
    ),
    [NOKADDO_DATASET_PROPERTIES.groupingColumnId]: property(
      'rich_text',
      richText('category-id'),
    ),
    [NOKADDO_DATASET_PROPERTIES.groupKeys]: property(
      'rich_text',
      richText('["One",', '"Two"]'),
    ),
    [NOKADDO_DATASET_PROPERTIES.front]: property(
      'rich_text',
      richText('["front-', 'id"]'),
    ),
    [NOKADDO_DATASET_PROPERTIES.back]: property(
      'rich_text',
      richText('["back-id"]'),
    ),
  }
}

function configurationPage(
  properties = configurationProperties(),
): PageObjectResponse {
  return {
    id: 'configuration-page',
    properties,
  } as unknown as PageObjectResponse
}

describe('card configuration property validation', () => {
  it('requires every named property with its expected type', () => {
    const expectedTypes = {
      dataset_id: 'rich_text',
      dataset_title: 'rich_text',
      dataset_icon: 'files',
      grouper_column: 'title',
      grouper_column_id: 'rich_text',
      group_keys: 'rich_text',
      front: 'rich_text',
      back: 'rich_text',
    } as const

    const valid = configurationProperties()
    expect(hasCardGroupConfigProperties(valid)).toBe(true)
    expect(requireCardGroupConfigProperties(valid)).toBe(valid)

    for (const [name, expectedType] of Object.entries(expectedTypes)) {
      const { [name]: _missing, ...withoutProperty } = valid
      expect(hasCardGroupConfigProperties(withoutProperty)).toBe(false)
      expect(() => requireCardGroupConfigProperties(withoutProperty)).toThrow(
        `Card group configuration is missing the "${name}" property`,
      )

      const wrongType = {
        ...valid,
        [name]: property('checkbox', false),
      }
      expect(hasCardGroupConfigProperties(wrongType)).toBe(false)
      expect(() => requireCardGroupConfigProperties(wrongType)).toThrow(
        `Card group configuration property "${name}" must be "${expectedType}", received "checkbox"`,
      )
    }
  })
})

describe('stored card configuration conversion', () => {
  it('joins chunks and returns the complete app shape for valid storage', () => {
    expect(toStoredCardConfiguration(configurationPage())).toEqual({
      id: 'configuration-page',
      dataSetId: 'source-dataset',
      datasetTitle: 'Project Atlas',
      datasetIconUrl: 'https://example.test/icon.png',
      groupingColumnName: 'Category',
      groupingColumnId: 'category-id',
      groupKeys: ['One', 'Two'],
      frontColumnIds: ['front-id'],
      backColumnIds: ['back-id'],
    })
  })

  it.each([
    ['invalid schema', () => ({})],
    [
      'missing dataset ID',
      () => ({
        ...configurationProperties(),
        dataset_id: property('rich_text', []),
      }),
    ],
    [
      'malformed face JSON',
      () => ({
        ...configurationProperties(),
        front: property('rich_text', richText('not-json')),
      }),
    ],
    [
      'non-string face item',
      () => ({
        ...configurationProperties(),
        back: property('rich_text', richText('["valid", 2]')),
      }),
    ],
  ])('returns null for %s', (_case, makeProperties) => {
    expect(toStoredCardConfiguration(configurationPage(makeProperties()))).toBe(
      null,
    )
  })
})

describe('stored group metadata conversion', () => {
  it('parses group keys, joins the title, and maps external and file icons', () => {
    const properties = requireCardGroupConfigProperties(
      configurationProperties(),
    )

    expect(getCardGroupKeys(properties)).toEqual(['One', 'Two'])
    expect(getCardGroupDatasetTitle(properties)).toBe('Project Atlas')
    expect(getCardGroupDatasetIconUrl(properties)).toBe(
      'https://example.test/icon.png',
    )

    const fileIconProperties = requireCardGroupConfigProperties({
      ...configurationProperties(),
      dataset_icon: property('files', [
        {
          type: 'file',
          name: 'icon',
          file: {
            url: 'https://files.test/icon.png',
            expiry_time: '2030-01-01T00:00:00.000Z',
          },
        },
      ]),
    })
    expect(getCardGroupDatasetIconUrl(fileIconProperties)).toBe(
      'https://files.test/icon.png',
    )
  })

  it.each(['not-json', '{"not":"an array"}', '["valid", 2]'])(
    'defaults malformed group keys to empty for %s',
    (groupKeys) => {
      const properties = requireCardGroupConfigProperties({
        ...configurationProperties(),
        group_keys: property('rich_text', richText(groupKeys)),
      })

      expect(getCardGroupKeys(properties)).toEqual([])
    },
  )

  it('returns null when there is no supported icon file', () => {
    const properties = requireCardGroupConfigProperties({
      ...configurationProperties(),
      dataset_icon: property('files', []),
    })

    expect(getCardGroupDatasetIconUrl(properties)).toBeNull()
  })
})
