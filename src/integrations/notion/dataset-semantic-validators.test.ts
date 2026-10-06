import type { DataSourceObjectResponse } from '@notionhq/client'
import { describe, expect, it } from 'vitest'
import type { AppError } from '#/lib/errors'
import { validateCardConfigurationAgainstDataset } from './dataset-semantic-validators'
import {
  NOKADDO_REVIEW_PROPERTIES,
  NOKADDO_REVIEW_PROPERTY_TYPES,
} from './review-property-validators'
import type { CardConfigurationInput } from './types'

const configuration: CardConfigurationInput = {
  dataSetId: 'source-id',
  datasetTitle: 'Biology',
  datasetIcon: null,
  groupingColumnName: 'Category',
  groupingColumnId: 'category-id',
  frontColumnIds: ['title id'],
  backColumnIds: ['answer-id'],
}

const properties = {
  Name: { id: 'title%20id', type: 'title', title: {} },
  Answer: { id: 'answer-id', type: 'rich_text', rich_text: {} },
  Category: { id: 'category-id', type: 'select', select: {} },
} as unknown as DataSourceObjectResponse['properties']

describe('server-side card-configuration semantics', () => {
  it('matches normalized Notion IDs and allows the same ID on both faces', () => {
    expect(() =>
      validateCardConfigurationAgainstDataset(
        {
          ...configuration,
          backColumnIds: ['title%20id'],
        },
        properties,
      ),
    ).not.toThrow()
  })

  it.each([
    { frontColumnIds: ['missing-id'] },
    { backColumnIds: ['missing-id'] },
    { groupingColumnName: 'Missing category' },
  ])('rejects a reference absent from the source schema %#', (override) => {
    expect(() =>
      validateCardConfigurationAgainstDataset(
        { ...configuration, ...override },
        properties,
      ),
    ).toThrowError(expect.objectContaining({ code: 'validation' }) as AppError)
  })

  it('requires an own grouping property and accepts null for single mode', () => {
    expect(() =>
      validateCardConfigurationAgainstDataset(
        { ...configuration, groupingColumnName: 'toString' },
        properties,
      ),
    ).toThrowError(expect.objectContaining({ code: 'validation' }) as AppError)

    expect(() =>
      validateCardConfigurationAgainstDataset(
        {
          ...configuration,
          groupingColumnName: null,
          groupingColumnId: null,
        },
        properties,
      ),
    ).not.toThrow()
  })

  it.each(['multi_select', 'button', 'number'])(
    'rejects unsupported grouping property type %s',
    (type) => {
      expect(() =>
        validateCardConfigurationAgainstDataset(configuration, {
          ...properties,
          Category: { id: 'category-id', type, [type]: {} } as never,
        }),
      ).toThrowError(
        expect.objectContaining({ code: 'validation' }) as AppError,
      )
    },
  )

  it('accepts a text-returning formula as a grouping property', () => {
    expect(() =>
      validateCardConfigurationAgainstDataset(configuration, {
        ...properties,
        Category: {
          id: 'category-id',
          type: 'formula',
          formula: { expression: 'prop("Category")' },
        } as never,
      }),
    ).not.toThrow()
  })

  it('requires the grouping name and stable ID to identify the same property', () => {
    expect(() =>
      validateCardConfigurationAgainstDataset(
        { ...configuration, groupingColumnId: 'other-id' },
        properties,
      ),
    ).toThrowError(expect.objectContaining({ code: 'validation' }) as AppError)
  })

  it.each(Object.values(NOKADDO_REVIEW_PROPERTIES))(
    'rejects review column %s as a card field',
    (name) => {
      const type = NOKADDO_REVIEW_PROPERTY_TYPES[name]
      expect(() =>
        validateCardConfigurationAgainstDataset(
          { ...configuration, frontColumnIds: ['review-id'] },
          {
            ...properties,
            [name]: {
              id: 'review-id',
              name,
              type,
              [type]: {},
            } as never,
          },
        ),
      ).toThrowError(
        expect.objectContaining({ code: 'validation' }) as AppError,
      )
    },
  )
})
