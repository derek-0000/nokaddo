import { describe, expect, it } from 'vitest'
import type { AppError } from '#/lib/errors'
import { validateDataGroupId } from './card-input-validators'

describe('card-group ID input', () => {
  it('accepts a non-empty typed ID', () => {
    expect(validateDataGroupId({ dataGroupId: 'group-id' })).toEqual({
      dataGroupId: 'group-id',
    })
  })

  it.each([
    null,
    [],
    'group-id',
    1,
    {},
    { dataGroupId: '' },
    { dataGroupId: 1 },
  ])('rejects malformed unknown input %# as a validation error', (input) => {
    expect(() => validateDataGroupId(input)).toThrowError(
      expect.objectContaining({ code: 'validation' }) as AppError,
    )
  })

  it('rejects a group ID inherited from a prototype', () => {
    expect(() =>
      validateDataGroupId(Object.create({ dataGroupId: 'inherited-id' })),
    ).toThrowError(expect.objectContaining({ code: 'validation' }) as AppError)
  })
})
