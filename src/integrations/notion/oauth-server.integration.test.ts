import type { Client, OauthTokenResponse } from '@notionhq/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NotionOAuthError,
  beginNotionAuthorization,
  completeNotionAuthorization,
  prepareNotionReauthorization,
  refreshNotionConnection,
  revokeNotionConnection,
} from './oauth-server'
import type { NotionConnection } from './session-server'
import type * as SessionServerModule from './session-server'
import type * as CryptoModule from 'node:crypto'
import {
  buildNotionOAuthResponse,
  buildNotionSession,
} from '../../../test/fixtures'

const boundaries = vi.hoisted(() => ({
  getNotionSession: vi.fn<typeof SessionServerModule.getNotionSession>(),
  randomBytes: vi.fn<(size: number) => Buffer>(),
  token: vi.fn<Client['oauth']['token']>(),
  revoke: vi.fn<Client['oauth']['revoke']>(),
}))

vi.mock('./session-server', () => ({
  getNotionSession: boundaries.getNotionSession,
}))

vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof CryptoModule>()

  return {
    ...original,
    randomBytes: boundaries.randomBytes,
  }
})

vi.mock('@notionhq/client', () => ({
  Client: class {
    oauth = {
      token: boundaries.token,
      revoke: boundaries.revoke,
    }
  },
}))

beforeEach(() => {
  boundaries.getNotionSession.mockReset()
  boundaries.randomBytes.mockReset()
  boundaries.token.mockReset()
  boundaries.revoke.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

type StoredSession = Awaited<
  ReturnType<typeof SessionServerModule.getNotionSession>
>
type StoredSessionData = StoredSession['data']

function createSession(data: StoredSessionData = {}): StoredSession {
  return buildNotionSession(data)
}

function oauthTokenResponse(
  overrides: Partial<OauthTokenResponse> = {},
): OauthTokenResponse {
  return buildNotionOAuthResponse({
    access_token: 'provider-access-token',
    refresh_token: 'provider-refresh-token',
    bot_id: 'provider-bot-id',
    workspace_name: 'Workspace',
    workspace_id: 'workspace-id',
    owner: {
      type: 'user',
      user: {
        object: 'user',
        type: 'person',
        id: 'user-id',
        name: 'Ada',
        avatar_url: null,
        person: { email: 'ada@example.test' },
      },
    },
    ...overrides,
  })
}

async function expectOAuthError(
  promise: Promise<unknown>,
  code: NotionOAuthError['code'],
) {
  const error = await promise.catch((caught: unknown) => caught)

  expect(error).toBeInstanceOf(NotionOAuthError)
  expect(error).toMatchObject({ code, message: code })
  return error as NotionOAuthError
}

describe('beginning Notion authorization', () => {
  beforeEach(() => {
    vi.stubEnv('OAUTH_CLIENT_ID', 'client-id')
    vi.stubEnv('OAUTH_REDIRECT_URI', 'https://app.test/oauth/callback')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'))
    boundaries.randomBytes.mockReturnValue(Buffer.alloc(32, 7))
  })

  it('stores a random state for ten minutes and redirects with exact provider parameters', async () => {
    const session = createSession()
    boundaries.getNotionSession.mockResolvedValue(session)

    const thrown = await beginNotionAuthorization().catch(
      (error: unknown) => error,
    )
    const expectedState = Buffer.alloc(32, 7).toString('base64url')

    expect(boundaries.randomBytes).toHaveBeenCalledWith(32)
    expect(session.update).toHaveBeenCalledWith({
      oauthState: {
        value: expectedState,
        expiresAt: Date.parse('2026-07-30T12:10:00.000Z'),
      },
    })
    expect(thrown).toBeInstanceOf(Response)
    expect((thrown as Response).status).toBe(302)

    const location = (thrown as Response).headers.get('Location')
    expect(location).not.toBeNull()
    const authorizationUrl = new URL(location!)
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      'https://api.notion.com/v1/oauth/authorize',
    )
    expect(Object.fromEntries(authorizationUrl.searchParams)).toEqual({
      client_id: 'client-id',
      owner: 'user',
      redirect_uri: 'https://app.test/oauth/callback',
      response_type: 'code',
      state: expectedState,
    })
  })
})

describe('completing Notion authorization', () => {
  beforeEach(() => {
    vi.stubEnv('OAUTH_CLIENT_ID', 'client-id')
    vi.stubEnv('OAUTH_CLIENT_SECRET', 'client-secret')
    vi.stubEnv('OAUTH_REDIRECT_URI', 'https://app.test/oauth/callback')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'))
  })

  it('consumes and rejects missing, expired, and mismatched state', async () => {
    const cases: Array<{
      label: string
      data: StoredSessionData
      input: { code: string | null; state: string | null }
    }> = [
      {
        label: 'missing stored state',
        data: {},
        input: { code: 'code', state: 'state' },
      },
      {
        label: 'expired stored state',
        data: {
          oauthState: {
            value: 'state',
            expiresAt: Date.parse('2026-07-30T11:59:59.999Z'),
          },
        },
        input: { code: 'code', state: 'state' },
      },
      {
        label: 'state expiring at the current instant',
        data: {
          oauthState: {
            value: 'state',
            expiresAt: Date.parse('2026-07-30T12:00:00.000Z'),
          },
        },
        input: { code: 'code', state: 'state' },
      },
      {
        label: 'mismatched stored state',
        data: {
          oauthState: {
            value: 'expected-state',
            expiresAt: Date.parse('2026-07-30T12:10:00.000Z'),
          },
        },
        input: { code: 'code', state: 'wrong-state' },
      },
    ]

    for (const testCase of cases) {
      const session = createSession(testCase.data)
      boundaries.getNotionSession.mockResolvedValueOnce(session)

      await expectOAuthError(
        completeNotionAuthorization(testCase.input),
        'oauth_state_invalid',
      )
      expect(session.update, testCase.label).toHaveBeenCalledWith({
        oauthState: undefined,
      })
    }

    expect(boundaries.token).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: 'only code',
      input: { code: 'authorization-code', state: null, error: null },
    },
    {
      label: 'only state',
      input: { code: null, state: 'callback-state', error: null },
    },
  ])(
    'consumes state and maps a partial callback with $label',
    async ({ input }) => {
      const session = createSession({
        oauthState: {
          value: 'callback-state',
          expiresAt: Date.parse('2026-07-30T12:10:00.000Z'),
        },
      })
      boundaries.getNotionSession.mockResolvedValue(session)

      await expectOAuthError(
        completeNotionAuthorization(input),
        'oauth_state_invalid',
      )

      expect(session.update).toHaveBeenCalledWith({ oauthState: undefined })
      expect(boundaries.token).not.toHaveBeenCalled()
    },
  )

  it('consumes state and maps an explicit provider error without disclosing its detail', async () => {
    const sentinel = 'provider_denied_SENTINEL'
    const session = createSession({
      oauthState: {
        value: 'callback-state',
        expiresAt: Date.parse('2026-07-30T12:10:00.000Z'),
      },
    })
    boundaries.getNotionSession.mockResolvedValue(session)

    const error = await expectOAuthError(
      completeNotionAuthorization({
        code: 'authorization-code_SENTINEL',
        state: 'callback-state',
        error: sentinel,
      }),
      'oauth_cancelled',
    )

    expect(session.update).toHaveBeenCalledWith({ oauthState: undefined })
    expect(JSON.stringify(error)).not.toContain(sentinel)
    expect(boundaries.token).not.toHaveBeenCalled()

    await expectOAuthError(
      completeNotionAuthorization({
        code: 'authorization-code',
        state: 'callback-state',
      }),
      'oauth_state_invalid',
    )
    expect(boundaries.token).not.toHaveBeenCalled()
  })

  it('treats an empty explicit provider error parameter as cancellation', async () => {
    const session = createSession({
      oauthState: {
        value: 'callback-state',
        expiresAt: Date.parse('2026-07-30T12:10:00.000Z'),
      },
    })
    boundaries.getNotionSession.mockResolvedValue(session)

    await expectOAuthError(
      completeNotionAuthorization({
        code: null,
        state: null,
        error: '',
      }),
      'oauth_cancelled',
    )

    expect(session.update).toHaveBeenCalledWith({ oauthState: undefined })
    expect(boundaries.token).not.toHaveBeenCalled()
  })

  it('exchanges a valid callback and stores only the normalized connection markers', async () => {
    const session = createSession({
      notionReauthorizationRequired: true,
      oauthState: {
        value: 'callback-state',
        expiresAt: Date.parse('2026-07-30T12:10:00.000Z'),
      },
    })
    boundaries.getNotionSession.mockResolvedValue(session)
    boundaries.token.mockResolvedValue(oauthTokenResponse())

    await expect(
      completeNotionAuthorization({
        code: 'authorization-code',
        state: 'callback-state',
      }),
    ).resolves.toEqual({
      workspaceId: 'workspace-id',
      workspaceName: 'Workspace',
      workspaceIcon: 'https://assets.test/workspace.png',
      user: {
        id: 'user-id',
        name: 'Ada',
        email: 'ada@example.test',
        avatarUrl: null,
      },
    })

    expect(boundaries.token).toHaveBeenCalledWith({
      client_id: 'client-id',
      client_secret: 'client-secret',
      grant_type: 'authorization_code',
      code: 'authorization-code',
      redirect_uri: 'https://app.test/oauth/callback',
    })
    expect(session.update).toHaveBeenNthCalledWith(1, {
      oauthState: undefined,
    })
    expect(session.update).toHaveBeenNthCalledWith(2, {
      notion: {
        accessToken: 'provider-access-token',
        refreshToken: 'provider-refresh-token',
        botId: 'provider-bot-id',
        workspaceId: 'workspace-id',
        workspaceName: 'Workspace',
        workspaceIcon: 'https://assets.test/workspace.png',
        user: {
          id: 'user-id',
          name: 'Ada',
          email: 'ada@example.test',
          avatarUrl: null,
        },
      },
      notionReauthorizationRequired: undefined,
      oauthState: undefined,
    })

    const replayError = await expectOAuthError(
      completeNotionAuthorization({
        code: 'authorization-code',
        state: 'callback-state',
      }),
      'oauth_state_invalid',
    )
    expect(replayError.message).not.toContain('authorization-code')
    expect(boundaries.token).toHaveBeenCalledTimes(1)
  })

  it.each(['OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET', 'OAUTH_REDIRECT_URI'])(
    'maps missing %s configuration to a safe configuration error after consuming state',
    async (missingKey) => {
      vi.stubEnv(missingKey, '')
      const session = createSession({
        oauthState: {
          value: 'callback-state',
          expiresAt: Date.parse('2026-07-30T12:10:00.000Z'),
        },
      })
      boundaries.getNotionSession.mockResolvedValue(session)
      vi.spyOn(console, 'error').mockImplementation(() => undefined)

      const error = await expectOAuthError(
        completeNotionAuthorization({
          code: 'authorization-code',
          state: 'callback-state',
        }),
        'configuration_error',
      )

      expect(error.message).not.toContain(missingKey)
      expect(JSON.stringify(error)).not.toContain(missingKey)
      expect(session.update).toHaveBeenCalledTimes(1)
      expect(boundaries.token).not.toHaveBeenCalled()
    },
  )

  it('maps provider failures to a safe exchange error', async () => {
    const sentinel = 'raw-provider-body_SENTINEL'
    const session = createSession({
      oauthState: {
        value: 'callback-state',
        expiresAt: Date.parse('2026-07-30T12:10:00.000Z'),
      },
    })
    boundaries.getNotionSession.mockResolvedValue(session)
    boundaries.token.mockRejectedValue(new Error(`${sentinel} is required`))
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const error = await expectOAuthError(
      completeNotionAuthorization({
        code: 'authorization-code_SENTINEL',
        state: 'callback-state',
      }),
      'oauth_exchange_failed',
    )

    expect(error.message).not.toContain(sentinel)
    expect(JSON.stringify(error)).not.toContain(sentinel)
    expect(session.data.notion).toBeUndefined()
  })

  it('does not create a connection when the provider omits the refresh token', async () => {
    const session = createSession({
      oauthState: {
        value: 'callback-state',
        expiresAt: Date.parse('2026-07-30T12:10:00.000Z'),
      },
    })
    boundaries.getNotionSession.mockResolvedValue(session)
    boundaries.token.mockResolvedValue(
      oauthTokenResponse({ refresh_token: null }),
    )
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expectOAuthError(
      completeNotionAuthorization({
        code: 'authorization-code',
        state: 'callback-state',
      }),
      'oauth_exchange_failed',
    )

    expect(session.data.notion).toBeUndefined()
    expect(session.update).toHaveBeenCalledTimes(1)
  })
})

describe('preparing Notion reauthorization', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VITE_NOTION_AUTH_URL',
      'https://public.test/connect?owner=user&prompt=consent#continue',
    )
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-30T12:00:00.000Z'))
    boundaries.randomBytes.mockReturnValue(Buffer.alloc(32, 9))
  })

  it('stores a fresh expiring state without dropping configured URL parameters', async () => {
    const session = createSession({
      oauthState: {
        value: 'previous-state',
        expiresAt: Date.parse('2026-07-30T12:05:00.000Z'),
      },
    })
    boundaries.getNotionSession.mockResolvedValue(session)

    const result = await prepareNotionReauthorization()
    const expectedState = Buffer.alloc(32, 9).toString('base64url')

    expect(boundaries.randomBytes).toHaveBeenCalledWith(32)
    expect(expectedState).not.toBe('previous-state')
    expect(session.update).toHaveBeenCalledWith({
      oauthState: {
        value: expectedState,
        expiresAt: Date.parse('2026-07-30T12:10:00.000Z'),
      },
    })

    const url = new URL(result)
    expect(url.origin + url.pathname).toBe('https://public.test/connect')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      owner: 'user',
      prompt: 'consent',
      state: expectedState,
    })
    expect(url.hash).toBe('#continue')
  })
})

describe('refreshing a Notion connection', () => {
  const connection: NotionConnection = {
    accessToken: 'old-access-token',
    refreshToken: 'current-refresh-token',
    botId: 'bot-id',
    workspaceId: 'workspace-id',
    workspaceName: 'Workspace',
    workspaceIcon: null,
    user: null,
  }

  beforeEach(() => {
    vi.stubEnv('OAUTH_CLIENT_ID', 'client-id')
    vi.stubEnv('OAUTH_CLIENT_SECRET', 'client-secret')
  })

  it('sends the current refresh token and normalizes rotated credentials', async () => {
    boundaries.token.mockResolvedValue(
      oauthTokenResponse({
        access_token: 'new-access-token',
        refresh_token: 'rotated-refresh-token',
      }),
    )

    await expect(refreshNotionConnection(connection)).resolves.toMatchObject({
      accessToken: 'new-access-token',
      refreshToken: 'rotated-refresh-token',
      botId: 'provider-bot-id',
      workspaceId: 'workspace-id',
    })
    expect(boundaries.token).toHaveBeenCalledWith({
      client_id: 'client-id',
      client_secret: 'client-secret',
      grant_type: 'refresh_token',
      refresh_token: 'current-refresh-token',
    })
  })
})

describe('revoking a Notion connection', () => {
  const connection: NotionConnection = {
    accessToken: 'access-token_SENTINEL',
    refreshToken: 'refresh-token_SENTINEL',
    botId: 'bot-id',
    workspaceId: 'workspace-id',
    workspaceName: 'Workspace',
    workspaceIcon: null,
    user: null,
  }

  beforeEach(() => {
    vi.stubEnv('OAUTH_CLIENT_ID', 'client-id')
    vi.stubEnv('OAUTH_CLIENT_SECRET', 'client-secret')
  })

  it('sends app credentials and the current access token and resolves on success', async () => {
    boundaries.revoke.mockResolvedValue({})

    await expect(revokeNotionConnection(connection)).resolves.toBeUndefined()

    expect(boundaries.revoke).toHaveBeenCalledWith({
      client_id: 'client-id',
      client_secret: 'client-secret',
      token: 'access-token_SENTINEL',
    })
  })

  it('does not report success when the provider rejects revocation', async () => {
    const providerError = new Error('revocation failed')
    boundaries.revoke.mockRejectedValue(providerError)

    await expect(revokeNotionConnection(connection)).rejects.toBe(providerError)
  })
})
