import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getNotionSession, requireNotionConnection } from './session-server'
import type * as ReactStartServerModule from '@tanstack/react-start/server'
import {
  buildNotionConnection,
  buildNotionSession,
} from '../../../test/fixtures/session'
import { AppError } from '#/lib/errors'

const sessionBoundary = vi.hoisted(() => ({
  useSession: vi.fn<typeof ReactStartServerModule.useSession>(),
}))

vi.mock('@tanstack/react-start/server', () => ({
  useSession: sessionBoundary.useSession,
}))

const connection = buildNotionConnection({
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  botId: 'bot-id',
  workspaceId: 'workspace-id',
  workspaceName: 'Workspace',
  workspaceIcon: null,
  user: null,
})

type TestSession = Awaited<ReturnType<typeof getNotionSession>>

function createSession(data: TestSession['data'] = {}): TestSession {
  return buildNotionSession(data)
}

beforeEach(() => {
  sessionBoundary.useSession.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Notion session access', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 's'.repeat(32))
  })

  it('rejects a session without a connection', async () => {
    sessionBoundary.useSession.mockResolvedValue(createSession())

    await expect(requireNotionConnection()).rejects.toEqual(
      new AppError('unauthenticated'),
    )
  })

  it('returns both the connection and its session', async () => {
    const session = createSession({ notion: connection })
    sessionBoundary.useSession.mockResolvedValue(session)

    await expect(requireNotionConnection()).resolves.toEqual({
      connection,
      session,
    })
  })
})

describe('Notion session cookie configuration', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_SECRET', 's'.repeat(32))
  })

  it('uses a non-secure development cookie and a 30-day maximum age', () => {
    vi.stubEnv('NODE_ENV', 'development')
    sessionBoundary.useSession.mockResolvedValue(createSession())

    getNotionSession()

    expect(sessionBoundary.useSession).toHaveBeenCalledWith({
      name: 'nfcards',
      password: 's'.repeat(32),
      maxAge: 60 * 60 * 24 * 30,
      sessionHeader: false,
      cookie: {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: false,
      },
    })
  })

  it('uses a secure host-only production cookie', () => {
    vi.stubEnv('NODE_ENV', 'production')
    sessionBoundary.useSession.mockResolvedValue(createSession())

    getNotionSession()

    expect(sessionBoundary.useSession).toHaveBeenCalledWith({
      name: '__Host-nfcards',
      password: 's'.repeat(32),
      maxAge: 60 * 60 * 24 * 30,
      sessionHeader: false,
      cookie: {
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: true,
      },
    })
  })
})
