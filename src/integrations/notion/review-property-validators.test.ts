import { describe, expect, it } from 'vitest'
import {
  getReviewCheckbox,
  isNokaddoReviewPropertyName,
  NOKADDO_REVIEW_PROPERTIES,
  requireReviewCheckboxColumn,
  validateReviewPropertyType,
} from './review-property-validators'
import {
  buildNotionCheckboxDataSourceProperty,
  buildNotionCheckboxPageProperty,
  buildNotionDateDataSourceProperty,
} from '../../../test/fixtures/notion'

const checkboxColumn = buildNotionCheckboxDataSourceProperty(
  'visited-id',
  'nkdo-visited',
)

describe('review-property validation', () => {
  it('accepts the expected type and returns the required checkbox column', () => {
    expect(() =>
      validateReviewPropertyType(checkboxColumn, 'nkdo-visited', 'checkbox'),
    ).not.toThrow()

    expect(
      requireReviewCheckboxColumn(
        { 'nkdo-visited': checkboxColumn },
        'nkdo-visited',
      ),
    ).toBe(checkboxColumn)
  })

  it('rejects a wrong type with property context', () => {
    const dateColumn = buildNotionDateDataSourceProperty(
      'visited-id',
      'nkdo-visited',
    )

    expect(() =>
      validateReviewPropertyType(dateColumn, 'nkdo-visited', 'checkbox'),
    ).toThrow(/nkdo-visited.*checkbox.*date/)
  })

  it('rejects a missing checkbox column with property context', () => {
    expect(() => requireReviewCheckboxColumn({}, 'nkdo-visited')).toThrow(
      /nkdo-visited.*could not be found/,
    )
  })

  it.each([true, false])('returns the checkbox value %s', (checkbox) => {
    const properties = {
      'nkdo-visited': buildNotionCheckboxPageProperty(checkbox, 'visited-id'),
    }

    expect(getReviewCheckbox(properties, 'nkdo-visited')).toBe(checkbox)
  })

  it.each(Object.values(NOKADDO_REVIEW_PROPERTIES))(
    'recognizes the managed review property %s',
    (name) => {
      expect(isNokaddoReviewPropertyName(name)).toBe(true)
    },
  )

  it('does not treat source content columns as review properties', () => {
    expect(isNokaddoReviewPropertyName('Category')).toBe(false)
  })
})
