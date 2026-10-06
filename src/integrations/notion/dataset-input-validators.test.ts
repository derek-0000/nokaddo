import { describe, expect, it } from 'vitest'
import { AppError } from '#/lib/errors'
import {
  validateCompleteDatasetConnectionInput,
  validateCursorInput,
  validateDatasetId,
  validateGetAvailableDatasetsInput,
  validateGetNotionDatasetItemsInput,
} from './dataset-input-validators'

const validItemsInput = {
  dataSetId: 'source-id',
  limit: 10,
  fields: [{ id: 'title-id', type: 'title' }],
  requirePopulatedField: true,
}

const validConnectionInput = {
  dataSetId: 'source-id',
  datasetTitle: 'Biology',
  datasetIcon: null,
  groupingColumnName: null,
  groupingColumnId: null,
  frontColumnIds: ['front-id'],
  backColumnIds: [],
  nokaddoDatasetId: null,
}

function expectValidation(run: () => unknown) {
  expect(run).toThrowError(
    expect.objectContaining({ code: 'validation' }) as AppError,
  )
}

describe('unknown-safe server input validation', () => {
  const validators = [
    ['dataset ID', validateDatasetId],
    ['available datasets', validateGetAvailableDatasetsInput],
    ['cursor', validateCursorInput],
    ['dataset items', validateGetNotionDatasetItemsInput],
    ['complete connection', validateCompleteDatasetConnectionInput],
  ] as const

  it.each(validators)(
    '%s rejects non-record and missing input',
    (_, validate) => {
      for (const value of [null, [], 'input', 12, true, undefined, {}]) {
        expectValidation(() => validate(value))
      }
    },
  )

  it('always emits the stable public validation error', () => {
    try {
      validateCompleteDatasetConnectionInput({
        ...validConnectionInput,
        dataSetId: 1,
      })
      throw new Error('Expected validation to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect(error).toMatchObject({
        code: 'validation',
        retryable: false,
      })
    }
  })

  it('does not accept required values inherited from a prototype', () => {
    const inheritedDatasetId = Object.create({ dataSetId: 'inherited-id' })
    expectValidation(() => validateDatasetId(inheritedDatasetId))

    const inheritedField = Object.create({ id: 'field-id', type: 'title' })
    expectValidation(() =>
      validateGetNotionDatasetItemsInput({
        ...validItemsInput,
        fields: [inheritedField],
      }),
    )
  })
})

describe('dataset-item input', () => {
  it.each([1, 100])('accepts the inclusive limit boundary %s', (limit) => {
    expect(
      validateGetNotionDatasetItemsInput({ ...validItemsInput, limit }),
    ).toEqual({ ...validItemsInput, limit })
  })

  it.each([0, 101, 1.5, Number.NaN, '10'])(
    'rejects invalid limit %s',
    (limit) => {
      expectValidation(() =>
        validateGetNotionDatasetItemsInput({ ...validItemsInput, limit }),
      )
    },
  )

  it('requires an array of fields with non-empty string IDs and types', () => {
    for (const fields of [
      null,
      {},
      [{ id: '', type: 'title' }],
      [{ id: 'id', type: '' }],
      [{ id: 1, type: 'title' }],
      [null],
    ]) {
      expectValidation(() =>
        validateGetNotionDatasetItemsInput({ ...validItemsInput, fields }),
      )
    }
  })

  it('requires a boolean populated-field flag and a valid dataset ID', () => {
    expectValidation(() =>
      validateGetNotionDatasetItemsInput({
        ...validItemsInput,
        requirePopulatedField: 'true',
      }),
    )
    expectValidation(() =>
      validateGetNotionDatasetItemsInput({
        ...validItemsInput,
        dataSetId: '',
      }),
    )
  })
})

describe('complete-connection structural input', () => {
  it('accepts 1–4 unique front fields, 0–4 unique back fields, and cross-face reuse', () => {
    const input = {
      ...validConnectionInput,
      groupingColumnName: 'Category',
      groupingColumnId: 'category-id',
      frontColumnIds: ['one', 'two', 'three', 'four'],
      backColumnIds: ['one', 'five', 'six', 'seven'],
      nokaddoDatasetId: 'nokaddo-id',
    }

    expect(validateCompleteDatasetConnectionInput(input)).toEqual(input)
  })

  it.each([
    { frontColumnIds: [] },
    { frontColumnIds: ['one', 'two', 'three', 'four', 'five'] },
    { frontColumnIds: ['one', 'one'] },
    { frontColumnIds: [''] },
    { frontColumnIds: 'one' },
    { backColumnIds: ['one', 'two', 'three', 'four', 'five'] },
    { backColumnIds: ['one', 'one'] },
    { backColumnIds: [''] },
    { backColumnIds: null },
  ])('rejects invalid face bindings %#', (override) => {
    expectValidation(() =>
      validateCompleteDatasetConnectionInput({
        ...validConnectionInput,
        ...override,
      }),
    )
  })

  it.each([
    { datasetTitle: '' },
    { groupingColumnName: '' },
    { groupingColumnName: 1 },
    { groupingColumnId: '' },
    { groupingColumnId: 1 },
    { groupingColumnName: 'Category', groupingColumnId: null },
    { groupingColumnName: null, groupingColumnId: 'category-id' },
    { nokaddoDatasetId: '' },
    { nokaddoDatasetId: false },
  ])('rejects invalid scalar fields %#', (override) => {
    expectValidation(() =>
      validateCompleteDatasetConnectionInput({
        ...validConnectionInput,
        ...override,
      }),
    )
  })

  it.each([
    null,
    { type: 'emoji', emoji: '📚' },
    { type: 'external', external: { url: 'https://example.test/icon.png' } },
    { type: 'file', file: { url: 'https://example.test/icon.png' } },
    {
      type: 'custom_emoji',
      custom_emoji: { url: 'https://example.test/icon.png' },
    },
    { type: 'icon', icon: { name: 'book' } },
  ])('accepts supported icon %#', (datasetIcon) => {
    expect(
      validateCompleteDatasetConnectionInput({
        ...validConnectionInput,
        datasetIcon,
      }).datasetIcon,
    ).toEqual(datasetIcon)
  })

  it.each([
    undefined,
    {},
    { type: 'file' },
    { type: 'external', external: null },
    { type: 'emoji', emoji: '' },
    { type: 'unknown' },
  ])('rejects malformed icon %#', (datasetIcon) => {
    expectValidation(() =>
      validateCompleteDatasetConnectionInput({
        ...validConnectionInput,
        datasetIcon,
      }),
    )
  })
})

describe('available-dataset and cursor input', () => {
  it.each([
    [validateGetAvailableDatasetsInput, 'excludedDatasetId'],
    [validateCursorInput, 'cursor'],
  ] as const)('%s accepts null or a non-empty string', (validate, field) => {
    expect(validate({ [field]: null })).toEqual({ [field]: null })
    expect(validate({ [field]: 'next-id' })).toEqual({ [field]: 'next-id' })
  })

  it.each([
    [validateGetAvailableDatasetsInput, 'excludedDatasetId'],
    [validateCursorInput, 'cursor'],
  ] as const)('%s rejects every other field form', (validate, field) => {
    for (const value of ['', undefined, 0, false, {}, []]) {
      expectValidation(() => validate({ [field]: value }))
    }
  })
})
