import { vi } from 'vitest'
import type { NotionConnection } from '../../src/integrations/notion/session-server'
import type { NotionViewer } from '../../src/integrations/notion/types'
import type * as SessionServerModule from '../../src/integrations/notion/session-server'
import { createFixtureBuilder } from './build'

export const buildNotionViewer = createFixtureBuilder<NotionViewer>(() => ({
  workspaceId: 'fixture-workspace-id',
  workspaceName: 'Fixture workspace',
  workspaceIcon: null,
  user: {
    id: 'fixture-user-id',
    name: 'Ada',
    email: 'ada@example.test',
    avatarUrl: null,
  },
}))

export const buildNotionConnection = createFixtureBuilder<NotionConnection>(
  () => ({
    ...buildNotionViewer(),
    accessToken: 'fixture-access-token',
    refreshToken: 'fixture-refresh-token',
    botId: 'fixture-bot-id',
  }),
)

export type NotionSessionFixture = Awaited<
  ReturnType<typeof SessionServerModule.getNotionSession>
>
export type NotionSessionDataFixture = NotionSessionFixture['data']

export function buildNotionSession(
  data: NotionSessionDataFixture = {},
): NotionSessionFixture {
  const session = {
    id: 'fixture-session-id',
    data,
    update: vi.fn<NotionSessionFixture['update']>(),
    clear: vi.fn<NotionSessionFixture['clear']>(),
  } as NotionSessionFixture

  vi.mocked(session.update).mockImplementation(async (sessionUpdate) => {
    const patch =
      typeof sessionUpdate === 'function'
        ? sessionUpdate(session.data)
        : sessionUpdate

    if (patch) {
      Object.assign(session.data, patch)

      for (const key of Object.keys(patch) as Array<
        keyof NotionSessionDataFixture
      >) {
        if (patch[key] === undefined) delete session.data[key]
      }
    }

    return session
  })
  vi.mocked(session.clear).mockResolvedValue(session)

  return session
}
