import { describe, expect, it } from 'vitest'
import { AppError, appErrorSerializationAdapter, toPublicError } from './errors'
import type { AppErrorCode } from './errors'

const retryabilityByCode = {
  unauthenticated: false,
  reauth_required: false,
  rate_limited: true,
  temporarily_unavailable: true,
  disconnect_failed: true,
  conflict: false,
  validation: false,
  internal: true,
} satisfies Record<AppErrorCode, boolean>

const appErrorCodes = Object.keys(retryabilityByCode) as AppErrorCode[]

describe('AppError taxonomy', () => {
  it.each(appErrorCodes)(
    'defines a non-empty safe message and explicit retryability for %s',
    (code) => {
      const error = new AppError(code)

      expect(error).toBeInstanceOf(Error)
      expect(error.code).toBe(code)
      expect(error.message.trim().length).toBeGreaterThan(0)
      expect(error.retryable).toBe(retryabilityByCode[code])
    },
  )

  it('defines conflict as non-retryable', () => {
    expect(toPublicError(new AppError('conflict'))).toMatchObject({
      code: 'conflict',
      retryable: false,
    })
  })
})

describe('safe error normalization', () => {
  it('preserves a cause without exposing its message', () => {
    const cause = new Error('boom')
    const error = new AppError('internal', { cause })

    expect(error.cause).toBe(cause)
    expect(error.message).not.toContain(cause.message)
  })

  it('collapses unknown errors to a generic internal error', () => {
    const publicError = toPublicError(new Error('raw secret detail'))

    expect(publicError).toEqual({
      code: 'internal',
      message: expect.any(String),
      retryable: true,
    })
    expect(publicError.message).not.toContain('raw secret detail')
  })

  it.each([
    null,
    undefined,
    'nope',
    42,
    false,
    ['provider detail'],
    { message: 'forged app error', code: 'validation' },
  ])('collapses non-error value %# to a generic internal error', (value) => {
    expect(toPublicError(value)).toEqual({
      code: 'internal',
      message: expect.any(String),
      retryable: true,
    })
  })
})

describe('app error serialization', () => {
  it('recognizes AppError instances only', () => {
    expect(appErrorSerializationAdapter.test(new AppError('internal'))).toBe(
      true,
    )
    expect(appErrorSerializationAdapter.test(new Error('internal'))).toBe(false)
    expect(
      appErrorSerializationAdapter.test({
        code: 'internal',
        message: 'forged',
      }),
    ).toBe(false)
  })

  it.each(appErrorCodes)(
    'serializes only %s and restores taxonomy-derived behavior',
    (code) => {
      const original = new AppError(code, {
        cause: new Error('private cause'),
      })

      const serialized = appErrorSerializationAdapter.toSerializable(original)
      const restored = appErrorSerializationAdapter.fromSerializable(serialized)

      expect(serialized).toBe(code)
      expect(restored).toBeInstanceOf(AppError)
      expect(restored.code).toBe(code)
      expect(restored.message).toBe(original.message)
      expect(restored.retryable).toBe(retryabilityByCode[code])
      expect(restored.cause).toBeUndefined()
    },
  )
})

describe('public error non-disclosure', () => {
  const secretInputs = [
    {
      sentinel: 'access-token-secret',
      thrown: { access_token: 'access-token-secret' },
    },
    {
      sentinel: 'refresh-token-secret',
      thrown: { refresh_token: 'refresh-token-secret' },
    },
    {
      sentinel: 'authorization-code-secret',
      thrown: { code: 'authorization-code-secret' },
    },
    {
      sentinel: 'oauth-state-secret',
      thrown: { state: 'oauth-state-secret' },
    },
    {
      sentinel: 'sdk-body-secret',
      thrown: { body: '{"raw":"sdk-body-secret"}' },
    },
    {
      sentinel: 'arbitrary-thrown-message-secret',
      thrown: new Error('arbitrary-thrown-message-secret'),
    },
  ]

  it.each(secretInputs)(
    'does not disclose sentinel value $sentinel',
    ({ sentinel, thrown }) => {
      const normalizedUnknown = toPublicError(thrown)
      const normalizedAppError = toPublicError(
        new AppError('internal', { cause: thrown }),
      )

      expect(normalizedUnknown).toEqual({
        code: 'internal',
        message: expect.any(String),
        retryable: true,
      })
      expect(JSON.stringify(normalizedUnknown)).not.toContain(sentinel)
      expect(JSON.stringify(normalizedAppError)).not.toContain(sentinel)
    },
  )
})
