import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ClientServerModule from './client-server'
import type { Client, DataSourceObjectResponse } from '@notionhq/client'
import type * as OAuthServerModule from './oauth-server'
import type { NotionConnection } from './session-server'
import type * as SessionServerModule from './session-server'
import {
  disconnectNotion,
  getAvailableDatasets,
  getNotionViewer,
  reauthorizeNotion,
} from './auth-functions'
import { AppError, toPublicError } from '#/lib/errors'
import { buildNotionClientDouble } from '../../../test/fixtures/notion-client'
import { buildNotionSearchResponse } from '../../../test/fixtures/notion'

const authBoundary = vi.hoisted(() => ({
  getNotionSession: vi.fn<typeof SessionServerModule.getNotionSession>(),
  prepareNotionReauthorization:
    vi.fn<typeof OAuthServerModule.prepareNotionReauthorization>(),
  revokeNotionConnection:
    vi.fn<typeof OAuthServerModule.revokeNotionConnection>(),
  withNotionClient: vi.fn<typeof ClientServerModule.withNotionClient>(),
}))

const notionBoundary = vi.hoisted(() => ({
  search: vi.fn<Client['search']>(),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      handler: (handler: (...args: never[]) => unknown) => handler,
    }

    return builder
  },
}))

vi.mock('./session-server', () => ({
  getNotionSession: authBoundary.getNotionSession,
}))

vi.mock('./oauth-server', () => ({
  prepareNotionReauthorization: authBoundary.prepareNotionReauthorization,
  revokeNotionConnection: authBoundary.revokeNotionConnection,
}))

vi.mock('./client-server', () => ({
  withNotionClient: authBoundary.withNotionClient,
}))

const connection: NotionConnection = {
  accessToken: 'sentinel-access-token',
  refreshToken: 'sentinel-refresh-token',
  botId: 'sentinel-bot-id',
  workspaceId: 'workspace-id',
  workspaceName: 'Workspace name',
  workspaceIcon: 'https://assets.test/workspace-icon.png',
  user: {
    id: 'user-id',
    name: 'Nora',
    email: 'nora@example.test',
    avatarUrl: 'https://assets.test/avatar.png',
  },
}

type AuthSession = Awaited<
  ReturnType<typeof SessionServerModule.getNotionSession>
>

function createSession(notion?: NotionConnection) {
  const data: AuthSession['data'] = notion ? { notion } : {}
  const update = vi.fn<AuthSession['update']>()
  const clear = vi.fn<AuthSession['clear']>()
  const session: AuthSession = {
    id: 'auth-test-session',
    data,
    update,
    clear,
  }

  update.mockImplementation(async () => session)
  clear.mockImplementation(async () => {
    delete data.notion
    return session
  })

  return { clear, data, session }
}

describe('public Notion authentication functions', () => {
  beforeEach(() => {
    authBoundary.getNotionSession.mockReset()
    authBoundary.prepareNotionReauthorization.mockReset()
    authBoundary.revokeNotionConnection.mockReset()
    authBoundary.withNotionClient.mockReset()
    notionBoundary.search.mockReset()
  })

  it('returns null when the session has no Notion connection', async () => {
    const { session } = createSession()
    authBoundary.getNotionSession.mockResolvedValue(session)

    await expect(getNotionViewer()).resolves.toBeNull()
  })

  it('returns only the public workspace and user projection', async () => {
    const { session } = createSession(connection)
    authBoundary.getNotionSession.mockResolvedValue(session)

    const viewer = await getNotionViewer()

    expect(viewer).toEqual({
      workspaceId: 'workspace-id',
      workspaceName: 'Workspace name',
      workspaceIcon: 'https://assets.test/workspace-icon.png',
      user: {
        id: 'user-id',
        name: 'Nora',
        email: 'nora@example.test',
        avatarUrl: 'https://assets.test/avatar.png',
      },
    })
    const serializedViewer = JSON.stringify(viewer)
    expect(serializedViewer).not.toContain(connection.accessToken)
    expect(serializedViewer).not.toContain(connection.refreshToken)
    expect(serializedViewer).not.toContain(connection.botId)
  })

  it('revokes before clearing the session', async () => {
    const events: string[] = []
    const { clear, session } = createSession(connection)
    clear.mockImplementation(async () => {
      events.push('clear')
      return session
    })
    authBoundary.getNotionSession.mockResolvedValue(session)
    authBoundary.revokeNotionConnection.mockImplementation(async () => {
      events.push('revoke')
    })

    await expect(disconnectNotion()).resolves.toEqual({ success: true })

    expect(events).toEqual(['revoke', 'clear'])
    expect(authBoundary.revokeNotionConnection).toHaveBeenCalledWith(connection)
  })

  it('clears an already-disconnected session without attempting revocation', async () => {
    const { clear, session } = createSession()
    authBoundary.getNotionSession.mockResolvedValue(session)

    await expect(disconnectNotion()).resolves.toEqual({ success: true })

    expect(authBoundary.revokeNotionConnection).not.toHaveBeenCalled()
    expect(clear).toHaveBeenCalledOnce()
  })

  it('preserves the session after a safe revocation failure and permits retry', async () => {
    const providerFailure = new Error(
      'sentinel-provider-body sentinel-access-token',
    )
    const { clear, data, session } = createSession(connection)
    authBoundary.getNotionSession.mockResolvedValue(session)
    authBoundary.revokeNotionConnection
      .mockRejectedValueOnce(providerFailure)
      .mockResolvedValueOnce(undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    let failure: unknown
    try {
      await disconnectNotion()
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(AppError)
    expect(toPublicError(failure)).toEqual({
      code: 'disconnect_failed',
      message: 'We could not disconnect Notion. Please try again.',
      retryable: true,
    })
    expect(JSON.stringify(toPublicError(failure))).not.toContain('sentinel')
    expect(data.notion).toBe(connection)
    expect(clear).not.toHaveBeenCalled()

    await expect(disconnectNotion()).resolves.toEqual({ success: true })

    expect(authBoundary.revokeNotionConnection).toHaveBeenCalledTimes(2)
    expect(clear).toHaveBeenCalledOnce()
  })

  it('returns only the public reauthorization URL', async () => {
    const authorizationUrl =
      'https://notion.example.test/authorize?state=public-state'
    authBoundary.prepareNotionReauthorization.mockResolvedValue(
      authorizationUrl,
    )

    await expect(reauthorizeNotion()).resolves.toEqual({ authorizationUrl })
  })

  it('returns one filtered, normalized, deduplicated discovery page', async () => {
    const first = availableDataset('source-1', 'First occurrence')
    const duplicate = availableDataset('source-1', 'Duplicate occurrence')
    const excluded = availableDataset('configuration-source', 'Nokaddo')
    const second = availableDataset('source-2', 'Second')
    notionBoundary.search.mockResolvedValue(
      buildNotionSearchResponse({
        results: [
          first,
          { object: 'page', id: 'unsupported-result' },
          excluded,
          duplicate,
          second,
        ],
        next_cursor: 'cursor-2',
        has_more: true,
      }),
    )
    authBoundary.withNotionClient.mockImplementation(async (request) =>
      request(buildNotionClientDouble({ search: notionBoundary.search })),
    )

    await expect(
      getAvailableDatasets({
        data: {
          excludedDatasetId: 'configuration-source',
          cursor: 'cursor-1',
        },
      }),
    ).resolves.toEqual({
      datasets: [
        {
          id: 'source-1',
          title: 'First occurrence',
          description: undefined,
          iconUrl: undefined,
          coverUrl: undefined,
        },
        {
          id: 'source-2',
          title: 'Second',
          description: undefined,
          iconUrl: undefined,
          coverUrl: undefined,
        },
      ],
      nextCursor: 'cursor-2',
    })
    expect(notionBoundary.search).toHaveBeenCalledOnce()
    expect(notionBoundary.search).toHaveBeenCalledWith({
      filter: { value: 'data_source', property: 'object' },
      start_cursor: 'cursor-1',
    })
  })
})

function availableDataset(id: string, title: string) {
  return {
    object: 'data_source',
    id,
    title: [{ plain_text: title }],
    description: [],
    icon: null,
    cover: null,
  } as unknown as DataSourceObjectResponse
}
