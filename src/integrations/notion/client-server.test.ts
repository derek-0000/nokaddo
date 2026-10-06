import { APIErrorCode, APIResponseError } from '@notionhq/client'
import { describe, expect, it, vi } from 'vitest'
import {
  executeNotionRequest,
  isNotionObjectNotFound,
  withNotionClient,
} from './client-server'
import type { NotionConnection } from './session-server'
import {
  isNotionInvalidGrant,
  isNotionUnauthorized,
  refreshNotionConnectionWithLock,
} from './token-refresh'
import { AppError } from '#/lib/errors'

const notionBoundary = vi.hoisted(() => ({
  requireNotionConnection: vi.fn(),
}))

vi.mock('./session-server', () => ({
  requireNotionConnection: notionBoundary.requireNotionConnection,
}))

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  return { promise, reject, resolve }
}

describe('Notion token error recognition', () => {
  it('recognizes an object-not-found cause only for internal AppErrors', () => {
    const cause = new APIResponseError({
      code: APIErrorCode.ObjectNotFound,
      status: 404,
      message: 'provider detail',
      headers: new Headers(),
      rawBodyText: 'provider detail',
      additional_data: undefined,
      request_id: 'request-id',
    })

    expect(isNotionObjectNotFound(new AppError('internal', { cause }))).toBe(
      true,
    )
    expect(isNotionObjectNotFound(new AppError('internal'))).toBe(false)
    expect(isNotionObjectNotFound(new AppError('validation', { cause }))).toBe(
      false,
    )
  })

  it('preserves an existing AppError through the Notion client boundary', async () => {
    notionBoundary.requireNotionConnection.mockResolvedValue({
      connection,
      session: { update: vi.fn() },
    })
    const failure = new AppError('validation')

    await expect(
      withNotionClient(async () => {
        throw failure
      }),
    ).rejects.toBe(failure)
  })

  it.each([
    [{ code: 'unauthorized' }, true],
    [{ status: 401 }, true],
    [{ code: 'unauthorized', status: 503 }, true],
    [{ code: 'restricted_resource', status: 403 }, false],
    [{ code: 'unauthorized_typo' }, false],
    [{ status: '401' }, false],
    [{}, false],
    [[], false],
    [null, false],
    ['unauthorized', false],
  ])('recognizes only unauthorized error shapes', (error, expected) => {
    expect(isNotionUnauthorized(error)).toBe(expected)
  })

  it.each([
    JSON.stringify({ code: 'invalid_grant' }),
    JSON.stringify({ error: 'invalid_grant' }),
  ])('recognizes invalid_grant response bodies', (body) => {
    expect(isNotionInvalidGrant({ status: 400, body })).toBe(true)
  })

  it.each([
    ['malformed JSON', { status: 400, body: '{' }],
    [
      'the wrong status',
      { status: 401, body: JSON.stringify({ code: 'invalid_grant' }) },
    ],
    [
      'the wrong key',
      { status: 400, body: JSON.stringify({ message: 'invalid_grant' }) },
    ],
    [
      'the wrong code',
      { status: 400, body: JSON.stringify({ code: 'unauthorized' }) },
    ],
    ['a non-string body', { status: 400, body: { code: 'invalid_grant' } }],
    ['an array body', { status: 400, body: '[]' }],
    ['null', null],
  ])('rejects %s as invalid_grant', (_label, error) => {
    expect(isNotionInvalidGrant(error)).toBe(false)
  })
})

describe('refreshNotionConnectionWithLock', () => {
  it('shares one refresh between concurrent requests for a connection', async () => {
    const pendingRefresh = deferred<NotionConnection>()
    const refresh = vi.fn(() => pendingRefresh.promise)

    const first = refreshNotionConnectionWithLock(connection, refresh)
    const second = refreshNotionConnectionWithLock(connection, refresh)

    expect(first).toBe(second)
    expect(refresh).toHaveBeenCalledTimes(1)
    pendingRefresh.resolve(refreshedConnection)

    await expect(Promise.all([first, second])).resolves.toEqual([
      refreshedConnection,
      refreshedConnection,
    ])
  })

  it('does not share refreshes between different workspace and bot keys', async () => {
    const otherWorkspace = {
      ...connection,
      workspaceId: 'workspace-two',
    }
    const otherBot = {
      ...connection,
      botId: 'bot-two',
    }
    const refresh = vi.fn(async (current: NotionConnection) => ({
      ...current,
      accessToken: `new-${current.workspaceId}-${current.botId}`,
    }))

    const results = await Promise.all([
      refreshNotionConnectionWithLock(connection, refresh),
      refreshNotionConnectionWithLock(otherWorkspace, refresh),
      refreshNotionConnectionWithLock(otherBot, refresh),
    ])

    expect(refresh).toHaveBeenCalledTimes(3)
    expect(results.map((result) => result.accessToken)).toEqual([
      'new-workspace-id-bot-id',
      'new-workspace-two-bot-id',
      'new-workspace-id-bot-two',
    ])
  })

  it('does not share delimiter-ambiguous composite keys', async () => {
    const firstConnection = {
      ...connection,
      workspaceId: 'workspace',
      botId: 'bot:secondary',
    }
    const secondConnection = {
      ...connection,
      workspaceId: 'workspace:bot',
      botId: 'secondary',
    }
    const firstRefresh = deferred<NotionConnection>()
    const secondRefresh = deferred<NotionConnection>()
    const refresh = vi
      .fn<(current: NotionConnection) => Promise<NotionConnection>>()
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(secondRefresh.promise)

    const first = refreshNotionConnectionWithLock(firstConnection, refresh)
    const second = refreshNotionConnectionWithLock(secondConnection, refresh)

    expect(refresh).toHaveBeenCalledTimes(2)
    firstRefresh.resolve({
      ...firstConnection,
      accessToken: 'first-new-token',
    })
    secondRefresh.resolve({
      ...secondConnection,
      accessToken: 'second-new-token',
    })

    await expect(Promise.all([first, second])).resolves.toEqual([
      {
        ...firstConnection,
        accessToken: 'first-new-token',
      },
      {
        ...secondConnection,
        accessToken: 'second-new-token',
      },
    ])
  })

  it('clears the lock after success so a later refresh can run', async () => {
    const refresh = vi.fn(async () => refreshedConnection)

    await refreshNotionConnectionWithLock(connection, refresh)
    await refreshNotionConnectionWithLock(connection, refresh)

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('clears the lock after failure so a later refresh can run', async () => {
    const providerFailure = new Error('SENTINEL_REFRESH_FAILURE')
    const refresh = vi
      .fn<(current: NotionConnection) => Promise<NotionConnection>>()
      .mockRejectedValueOnce(providerFailure)
      .mockResolvedValueOnce(refreshedConnection)

    await expect(
      refreshNotionConnectionWithLock(connection, refresh),
    ).rejects.toBe(providerFailure)
    await expect(
      refreshNotionConnectionWithLock(connection, refresh),
    ).resolves.toBe(refreshedConnection)

    expect(refresh).toHaveBeenCalledTimes(2)
  })
})

describe('executeNotionRequest', () => {
  it('refreshes after an unauthorized response, persists, and retries exactly once', async () => {
    const events: Array<string> = []
    const request = vi.fn(async (accessToken: string) => {
      events.push(`request:${accessToken}`)

      if (accessToken === connection.accessToken) {
        throw { code: 'unauthorized', status: 401 }
      }

      return 'success'
    })
    const refresh = vi.fn(async () => {
      events.push('refresh')
      return refreshedConnection
    })
    const onRefreshed = vi.fn(async (refreshed: NotionConnection) => {
      events.push(`persist:${refreshed.refreshToken}`)
    })

    await expect(
      executeNotionRequest({
        connection,
        request,
        refresh,
        onRefreshed,
      }),
    ).resolves.toBe('success')

    expect(request).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(onRefreshed).toHaveBeenCalledWith(refreshedConnection)
    expect(events).toEqual([
      'request:old-access-token',
      'refresh',
      'persist:new-refresh-token',
      'request:new-access-token',
    ])
  })

  it.each([
    ['forbidden', { code: 'restricted_resource', status: 403 }],
    ['not found', { code: 'object_not_found', status: 404 }],
    ['rate limited', { code: 'rate_limited', status: 429 }],
    ['timeout', { code: 'notionhq_client_request_timeout' }],
    ['server error', { code: 'internal_server_error', status: 500 }],
  ])('does not refresh a %s response', async (_label, requestError) => {
    const request = vi.fn(async () => {
      throw requestError
    })
    const refresh = vi.fn(async () => refreshedConnection)
    const onRefreshed = vi.fn(async () => undefined)

    await expect(
      executeNotionRequest({
        connection,
        request,
        refresh,
        onRefreshed,
      }),
    ).rejects.toBe(requestError)

    expect(request).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    expect(onRefreshed).not.toHaveBeenCalled()
  })

  it('does not retry when persisting the refreshed connection fails', async () => {
    const persistenceFailure = new Error('session write failed')
    const request = vi.fn(async (accessToken: string) => {
      if (accessToken === connection.accessToken) throw { status: 401 }
      return 'should not be returned'
    })

    await expect(
      executeNotionRequest({
        connection,
        request,
        refresh: async () => refreshedConnection,
        onRefreshed: async () => {
          throw persistenceFailure
        },
      }),
    ).rejects.toBe(persistenceFailure)

    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not refresh again when the single retry is unauthorized', async () => {
    const unauthorized = { code: 'unauthorized', status: 401 }
    const request = vi.fn(async () => {
      throw unauthorized
    })
    const refresh = vi.fn(async () => refreshedConnection)

    await expect(
      executeNotionRequest({
        connection,
        request,
        refresh,
        onRefreshed: async () => undefined,
      }),
    ).rejects.toBe(unauthorized)

    expect(request).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
