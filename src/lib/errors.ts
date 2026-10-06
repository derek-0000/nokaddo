import { createSerializationAdapter } from '@tanstack/react-router'

/**
 * Stable, public error taxonomy shared across the app.
 *
 * These codes are safe to expose to the client and let UI components decide how
 * to react (retry, reconnect, sign in, ...) without inspecting error strings.
 */
export type AppErrorCode =
  | 'unauthenticated'
  | 'reauth_required'
  | 'rate_limited'
  | 'temporarily_unavailable'
  | 'disconnect_failed'
  | 'conflict'
  | 'validation'
  | 'internal'

export type PublicError = {
  code: AppErrorCode
  message: string
  retryable: boolean
}

const DEFAULT_MESSAGES: Record<AppErrorCode, string> = {
  unauthenticated: 'Please connect your Notion account to continue.',
  reauth_required:
    'Your Notion connection is no longer authorized. Please reconnect.',
  rate_limited:
    'Notion is receiving too many requests. Please try again shortly.',
  temporarily_unavailable:
    'Notion is temporarily unavailable. Please try again.',
  disconnect_failed: 'We could not disconnect Notion. Please try again.',
  conflict: 'This dataset is already connected with a different configuration.',
  validation: 'The request was invalid. Please check your input and try again.',
  internal: 'Something went wrong on our end. Please try again.',
}

const DEFAULT_RETRYABLE: Record<AppErrorCode, boolean> = {
  unauthenticated: false,
  reauth_required: false,
  rate_limited: true,
  temporarily_unavailable: true,
  disconnect_failed: true,
  conflict: false,
  validation: false,
  internal: true,
}

/**
 * A typed error that carries a stable {@link AppErrorCode}. Because it extends
 * `Error`, throwing it from a server function still behaves like a normal error,
 * but the registered serialization adapter (see {@link appErrorSerializationAdapter})
 * preserves the code across the RPC boundary. Public messages and retry behavior
 * are derived from that code so a server error cannot accidentally expose raw
 * details to the client.
 */
export class AppError extends Error {
  readonly code: AppErrorCode
  readonly retryable: boolean

  constructor(code: AppErrorCode, options?: ErrorOptions) {
    super(DEFAULT_MESSAGES[code], options)
    this.name = 'AppError'
    this.code = code
    this.retryable = DEFAULT_RETRYABLE[code]
  }
}

/**
 * Normalizes any thrown value into a safe {@link PublicError}. Unknown errors
 * collapse to a generic `internal` error so raw messages never leak to the UI.
 */
export function toPublicError(value: unknown): PublicError {
  if (value instanceof AppError) {
    return {
      code: value.code,
      message: DEFAULT_MESSAGES[value.code],
      retryable: DEFAULT_RETRYABLE[value.code],
    }
  }

  return {
    code: 'internal',
    message: DEFAULT_MESSAGES.internal,
    retryable: DEFAULT_RETRYABLE.internal,
  }
}

/**
 * Registers {@link AppError} with the TanStack Start serializer so it survives
 * the server-function boundary with its code intact. Without this,
 * Start's default `ShallowErrorPlugin` would serialize only `message`.
 */
export const appErrorSerializationAdapter = createSerializationAdapter({
  key: 'AppError',
  test: (value): value is AppError => value instanceof AppError,
  toSerializable: (error: AppError) => error.code,
  fromSerializable: (code: AppErrorCode) => new AppError(code),
})
