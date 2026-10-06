import {
  APIErrorCode,
  APIResponseError,
  RequestTimeoutError,
  UnknownHTTPResponseError,
} from '@notionhq/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Client } from '@notionhq/client'
import type * as NotionSdkModule from '@notionhq/client'
import { isNotionObjectNotFound, withNotionClient } from './client-server'
import { NotionRefreshTokenUnavailableError } from './oauth-server'
import type * as OAuthServerModule from './oauth-server'
import type { NotionConnection } from './session-server'
import type * as SessionServerModule from './session-server'
import { AppError, toPublicError } from '#/lib/errors'

type NotionClientOptions = NonNullable<ConstructorParameters<typeof Client>[0]>

const notionBoundary = vi.hoisted(() => ({
  constructedOptions: [] as Array<NotionClientOptions>,
  tokensByClient: new WeakMap<object, string | undefined>(),
  refreshNotionConnection:
    vi.fn<typeof OAuthServerModule.refreshNotionConnection>(),
  requireNotionConnection:
    vi.fn<typeof SessionServerModule.requireNotionConnection>(),
}))

vi.mock('@notionhq/client', async (importOriginal) => {
  const actual = await importOriginal<typeof NotionSdkModule>()

  class ClientDouble {
    constructor(options: NotionClientOptions = {}) {
      notionBoundary.constructedOptions.push(options)
      notionBoundary.tokensByClient.set(this, options.auth)
    }
  }

  return {
    ...actual,
    Client: ClientDouble,
  }
})

vi.mock('./oauth-server', async (importOriginal) => {
  const actual = await importOriginal<typeof OAuthServerModule>()

  return {
    ...actual,
    refreshNotionConnection: notionBoundary.refreshNotionConnection,
  }
})

vi.mock('./session-server', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionServerModule>()

  return {
    ...actual,
    requireNotionConnection: notionBoundary.requireNotionConnection,
  }
})

const connection: NotionConnection = {
  accessToken: 'old-access-token',
  refreshToken: 'old-refresh-token',
  botId: 'bot-id',
  workspaceId: 'workspace-id',
  workspaceName: 'Workspace',
  workspaceIcon: null,
  user: null,
}

const refreshedConnection: NotionConnection = {
  ...connection,
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
}

type ConnectionContext = Awaited<
  ReturnType<typeof SessionServerModule.requireNotionConnection>
>

function createSessionBoundary() {
  const update = vi.fn<ConnectionContext['session']['update']>()
  const clear = vi.fn<ConnectionContext['session']['clear']>()
  const session: ConnectionContext['session'] = {
    id: 'test-session-id',
    data: { notion: connection },
    update,
    clear,
  }
  update.mockImplementation(async () => session)
  clear.mockImplementation(async () => session)

  return { session, update }
}

function clientToken(client: Client) {
  return notionBoundary.tokensByClient.get(client)
}

function createApiError(
  code: APIErrorCode,
  {
    status = 400,
    detail = 'SENTINEL_PROVIDER_DETAIL',
  }: { status?: number; detail?: string } = {},
) {
  return new APIResponseError({
    code,
    status,
    message: detail,
    headers: new Headers(),
    rawBodyText: JSON.stringify({
      code,
      message: detail,
      access_token: 'SENTINEL_ACCESS_TOKEN',
    }),
    additional_data: undefined,
    request_id: 'SENTINEL_REQUEST_ID',
  })
}

function createUnknownResponseError({
  status,
  body,
}: {
  status: number
  body: string
}) {
  return new UnknownHTTPResponseError({
    status,
    message: 'SENTINEL_UNKNOWN_RESPONSE_DETAIL',
    headers: new Headers(),
    rawBodyText: body,
  })
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

beforeEach(() => {
  notionBoundary.constructedOptions.length = 0
  notionBoundary.tokensByClient = new WeakMap<object, string | undefined>()
  notionBoundary.refreshNotionConnection.mockReset()
  notionBoundary.requireNotionConnection.mockReset()
})

describe('withNotionClient', () => {
  it('uses the current token without refreshing or updating the session', async () => {
    const { session, update } = createSessionBoundary()
    notionBoundary.requireNotionConnection.mockResolvedValue({
      connection,
      session,
    })
    const request = vi.fn(async (client: Client) => clientToken(client))

    await expect(withNotionClient(request)).resolves.toBe(
      connection.accessToken,
    )

    expect(request).toHaveBeenCalledTimes(1)
    expect(notionBoundary.constructedOptions).toEqual([
      expect.objectContaining({ auth: connection.accessToken }),
    ])
    expect(notionBoundary.refreshNotionConnection).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('shares a concurrent refresh, persists it before each retry, and uses the new token', async () => {
    const { session, update } = createSessionBoundary()
    const pendingRefresh = deferred<NotionConnection>()
    const events: Array<string> = []
    notionBoundary.requireNotionConnection.mockResolvedValue({
      connection,
      session,
    })
    notionBoundary.refreshNotionConnection.mockImplementation(async () => {
      events.push('refresh')
      return pendingRefresh.promise
    })
    update.mockImplementation(async () => {
      events.push(`persist:${refreshedConnection.accessToken}`)
      return session
    })
    const request = vi.fn(async (client: Client) => {
      const token = clientToken(client)
      events.push(`request:${token}`)
      if (token === connection.accessToken) throw { status: 401 }
      return token
    })

    const first = withNotionClient(request)
    const second = withNotionClient(request)
    await vi.waitFor(() => {
      expect(notionBoundary.refreshNotionConnection).toHaveBeenCalledTimes(1)
    })
    pendingRefresh.resolve(refreshedConnection)

    await expect(Promise.all([first, second])).resolves.toEqual([
      refreshedConnection.accessToken,
      refreshedConnection.accessToken,
    ])
    expect(update).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledWith({
      notion: refreshedConnection,
      notionReauthorizationRequired: undefined,
    })
    expect(events.filter((event) => event === 'refresh')).toHaveLength(1)
    const firstNewTokenRequest = events.indexOf(
      `request:${refreshedConnection.accessToken}`,
    )
    const lastPersistence = events.lastIndexOf(
      `persist:${refreshedConnection.accessToken}`,
    )
    expect(firstNewTokenRequest).toBeGreaterThan(lastPersistence)
  })

  it.each([
    [
      'invalid grant',
      createUnknownResponseError({
        status: 400,
        body: JSON.stringify({
          error: 'invalid_grant',
          refresh_token: 'SENTINEL_REFRESH_TOKEN',
        }),
      }),
    ],
    ['missing refresh token', new NotionRefreshTokenUnavailableError()],
  ])(
    'clears the connection and requires reauthorization for %s',
    async (_label, refreshFailure) => {
      const { session, update } = createSessionBoundary()
      notionBoundary.requireNotionConnection.mockResolvedValue({
        connection,
        session,
      })
      notionBoundary.refreshNotionConnection.mockRejectedValue(refreshFailure)

      const thrown = await withNotionClient(async () => {
        throw { status: 401 }
      }).catch((error: unknown) => error)

      expect(thrown).toBeInstanceOf(AppError)
      expect(toPublicError(thrown)).toEqual({
        code: 'reauth_required',
        message:
          'Your Notion connection is no longer authorized. Please reconnect.',
        retryable: false,
      })
      expect(JSON.stringify(toPublicError(thrown))).not.toContain('SENTINEL')
      expect(update).toHaveBeenCalledTimes(1)
      expect(update).toHaveBeenCalledWith({
        notion: undefined,
        notionReauthorizationRequired: true,
      })
    },
  )

  it.each([
    [
      'rate limit',
      createApiError(APIErrorCode.RateLimited, { status: 429 }),
      'rate_limited',
    ],
    [
      'request timeout',
      new RequestTimeoutError('SENTINEL_PROVIDER_TIMEOUT'),
      'temporarily_unavailable',
    ],
    [
      'internal server error',
      createApiError(APIErrorCode.InternalServerError, { status: 500 }),
      'temporarily_unavailable',
    ],
    [
      'service overload',
      createApiError(APIErrorCode.ServiceOverload, { status: 503 }),
      'temporarily_unavailable',
    ],
    [
      'service unavailable',
      createApiError(APIErrorCode.ServiceUnavailable, { status: 503 }),
      'temporarily_unavailable',
    ],
    [
      'gateway timeout',
      createApiError(APIErrorCode.GatewayTimeout, { status: 504 }),
      'temporarily_unavailable',
    ],
    [
      'forbidden',
      createApiError(APIErrorCode.RestrictedResource, { status: 403 }),
      'internal',
    ],
    [
      'not found',
      createApiError(APIErrorCode.ObjectNotFound, { status: 404 }),
      'internal',
    ],
    [
      'unknown provider response',
      createUnknownResponseError({
        status: 502,
        body: 'SENTINEL_UNKNOWN_PROVIDER_RESPONSE',
      }),
      'internal',
    ],
    ['unknown error', new Error('SENTINEL_UNKNOWN_PROVIDER_BODY'), 'internal'],
    ['unknown thrown value', 'SENTINEL_RAW_PROVIDER_BODY', 'internal'],
  ])(
    'maps %s to a safe %s error',
    async (_label, providerError, expectedCode) => {
      const { session } = createSessionBoundary()
      notionBoundary.requireNotionConnection.mockResolvedValue({
        connection,
        session,
      })
      vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const thrown = await withNotionClient(async () => {
        throw providerError
      }).catch((error: unknown) => error)
      const publicError = toPublicError(thrown)

      expect(thrown).toBeInstanceOf(AppError)
      expect((thrown as AppError).code).toBe(expectedCode)
      expect(publicError.code).toBe(expectedCode)
      expect(publicError.message).not.toContain('SENTINEL')
      expect(JSON.stringify(publicError)).not.toContain('SENTINEL')
      expect(notionBoundary.refreshNotionConnection).not.toHaveBeenCalled()
    },
  )

  it('identifies a Notion object-not-found cause without exposing provider details', async () => {
    const { session } = createSessionBoundary()
    notionBoundary.requireNotionConnection.mockResolvedValue({
      connection,
      session,
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const thrown = await withNotionClient(async () => {
      throw createApiError(APIErrorCode.ObjectNotFound, {
        status: 404,
        detail: 'SENTINEL provider detail',
      })
    }).catch((error: unknown) => error)

    expect(isNotionObjectNotFound(thrown)).toBe(true)
    expect(isNotionObjectNotFound(new AppError('internal'))).toBe(false)
    expect(JSON.stringify(toPublicError(thrown))).not.toContain('SENTINEL')
  })

  it('maps a second unauthorized response to safe reauthorization without another refresh', async () => {
    const { session, update } = createSessionBoundary()
    notionBoundary.requireNotionConnection.mockResolvedValue({
      connection,
      session,
    })
    notionBoundary.refreshNotionConnection.mockResolvedValue(
      refreshedConnection,
    )
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const unauthorized = createApiError(APIErrorCode.Unauthorized, {
      status: 401,
      detail: 'SENTINEL_UNAUTHORIZED_DETAIL',
    })

    const thrown = await withNotionClient(async () => {
      throw unauthorized
    }).catch((error: unknown) => error)

    expect(toPublicError(thrown)).toEqual({
      code: 'reauth_required',
      message:
        'Your Notion connection is no longer authorized. Please reconnect.',
      retryable: false,
    })
    expect(notionBoundary.refreshNotionConnection).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('preserves known application errors unchanged', async () => {
    const { session } = createSessionBoundary()
    notionBoundary.requireNotionConnection.mockResolvedValue({
      connection,
      session,
    })
    const appError = new AppError('validation')

    const thrown = await withNotionClient(async () => {
      throw appError
    }).catch((error: unknown) => error)

    expect(thrown).toBe(appError)
  })
})
