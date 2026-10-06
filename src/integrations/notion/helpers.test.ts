import type { PageObjectResponse, RichTextItemResponse } from '@notionhq/client'
import { describe, expect, it } from 'vitest'
import {
  normalizeNotionPropertyId,
  sameGroupingColumnId,
  toNotionDatasetItem,
  toPopulatedPropertyFilter,
  toTextChunks,
} from './helpers'

type PageProperty = PageObjectResponse['properties'][string]
type PagePropertyType = PageProperty['type']
type PagePropertyOfType<TType extends PagePropertyType> = Extract<
  PageProperty,
  { type: TType }
>
type PagePropertyValue<TType extends PagePropertyType> =
  PagePropertyOfType<TType> extends Record<TType, infer TValue> ? TValue : never

function property<TType extends PagePropertyType>(
  type: TType,
  value: PagePropertyValue<TType>,
  id: string,
): PagePropertyOfType<TType> {
  return { id, type, [type]: value } as PagePropertyOfType<TType>
}

function richText(plainText: string): RichTextItemResponse {
  return {
    type: 'text',
    text: { content: plainText, link: null },
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color: 'default',
    },
    plain_text: plainText,
    href: null,
  }
}

describe('Notion property ID normalization', () => {
  it('decodes valid URL encoding and preserves malformed encoding', () => {
    expect(normalizeNotionPropertyId('title%3Aprimary')).toBe('title:primary')
    expect(normalizeNotionPropertyId('already-normal')).toBe('already-normal')
    expect(normalizeNotionPropertyId('%E0%A4%A')).toBe('%E0%A4%A')
  })

  it('treats encoded and decoded grouping IDs as the same column', () => {
    expect(sameGroupingColumnId('title%3Aprimary', 'title:primary')).toBe(true)
    expect(sameGroupingColumnId('category-id', 'other-id')).toBe(false)
    expect(sameGroupingColumnId(null, 'category-id')).toBe(false)
    expect(sameGroupingColumnId(null, null)).toBe(true)
  })
})

describe('Notion rich-text chunking', () => {
  it('chunks by Unicode code point and handles empty and boundary content', () => {
    expect(toTextChunks('')).toEqual([])

    const unicode = `😀${'a'.repeat(1_999)}界`
    expect(toTextChunks(unicode)).toEqual([
      {
        type: 'text',
        text: { content: `😀${'a'.repeat(1_999)}` },
      },
      { type: 'text', text: { content: '界' } },
    ])

    const maximum = '😀'.repeat(200_000)
    const chunks = toTextChunks(maximum)
    expect(chunks).toHaveLength(100)
    expect(
      chunks.every((chunk) => Array.from(chunk.text.content).length === 2_000),
    ).toBe(true)
    expect(chunks.map((chunk) => chunk.text.content).join('')).toBe(maximum)
  })

  it('rejects content one Unicode code point above Notion’s aggregate limit', () => {
    expect(() => toTextChunks('😀'.repeat(200_001))).toThrow(
      "Rich text content exceeds Notion's 200,000 character limit",
    )
  })

  it('also rejects ASCII content above Notion’s aggregate limit', () => {
    expect(() => toTextChunks('x'.repeat(200_001))).toThrow(
      "Rich text content exceeds Notion's 200,000 character limit",
    )
  })
})

describe('populated-field filtering', () => {
  it.each([
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
  ])('maps supported %s fields to an is-not-empty filter', (type) => {
    expect(toPopulatedPropertyFilter({ id: 'field-id', type })).toEqual({
      property: 'field-id',
      [type]: { is_not_empty: true },
    })
  })

  it.each(['checkbox', 'formula', 'rollup', 'verification', 'button'])(
    'returns no filter for unsupported %s fields',
    (type) => {
      expect(
        toPopulatedPropertyFilter({ id: 'field-id', type }),
      ).toBeUndefined()
    },
  )
})

describe('Notion page normalization', () => {
  it('preserves IDs and formats supported values exactly', () => {
    const page = {
      id: 'page-id',
      properties: {
        Text: property(
          'rich_text',
          [richText('Alpha'), richText('Beta')],
          'text%3Aid',
        ),
        Number: property('number', 42, 'number-id'),
        Checked: property('checkbox', true, 'checked-id'),
        Unchecked: property('checkbox', false, 'unchecked-id'),
        Names: property(
          'multi_select',
          [
            { id: 'red', name: 'Red', color: 'red' },
            { id: 'blue', name: 'Blue', color: 'blue' },
          ],
          'names-id',
        ),
        Date: property(
          'date',
          {
            start: '2026-07-30',
            end: '2026-08-01',
            time_zone: null,
          },
          'date-id',
        ),
        DateOnly: property(
          'date',
          { start: '2026-07-30', end: null, time_zone: null },
          'date-only-id',
        ),
        Unique: property(
          'unique_id',
          { prefix: 'CARD-', number: 7 },
          'unique-id',
        ),
        Formula: property(
          'formula',
          { type: 'number', number: 3 },
          'formula-id',
        ),
        State: property(
          'verification',
          { state: 'verified', date: null, verified_by: null },
          'state-id',
        ),
        Address: property(
          'place',
          { lat: 35, lon: -106, address: '123 Main St' },
          'address-id',
        ),
        Relations: property(
          'relation',
          [{ id: 'related-1' }, { id: 'related-2' }],
          'relations-id',
        ),
        Empty: property('number', null, 'empty-id'),
        Unsupported: property('button', {}, 'unsupported-id'),
      },
    } as unknown as PageObjectResponse

    expect(toNotionDatasetItem(page)).toEqual({
      id: 'page-id',
      properties: [
        { id: 'text:id', name: 'Text', value: 'Alpha, Beta' },
        { id: 'number-id', name: 'Number', value: '42' },
        { id: 'checked-id', name: 'Checked', value: 'Yes' },
        { id: 'unchecked-id', name: 'Unchecked', value: 'No' },
        { id: 'names-id', name: 'Names', value: 'Red, Blue' },
        {
          id: 'date-id',
          name: 'Date',
          value: '2026-07-30 – 2026-08-01',
        },
        { id: 'date-only-id', name: 'DateOnly', value: '2026-07-30' },
        { id: 'unique-id', name: 'Unique', value: 'CARD-7' },
        { id: 'formula-id', name: 'Formula', value: '3' },
        { id: 'state-id', name: 'State', value: 'verified' },
        { id: 'address-id', name: 'Address', value: '123 Main St' },
        {
          id: 'relations-id',
          name: 'Relations',
          value: 'related-1, related-2',
        },
        { id: 'empty-id', name: 'Empty', value: '' },
        { id: 'unsupported-id', name: 'Unsupported', value: '' },
      ],
    })
  })
})
