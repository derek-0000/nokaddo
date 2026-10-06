import type { OauthTokenResponse } from '@notionhq/client'
import type { NotionConnection } from './session-server'
import type { NotionUser } from './types'

export class NotionRefreshTokenUnavailableError extends Error {
  constructor() {
    super('Notion OAuth response is missing refresh_token')
    this.name = 'NotionRefreshTokenUnavailableError'
  }
}

function normalizeOwner(owner: OauthTokenResponse['owner']): NotionUser | null {
  if (owner.type !== 'user') return null

  const { user } = owner

  return {
    id: user.id,
    name: 'name' in user ? user.name : null,
    email: 'person' in user ? user.person.email : null,
    avatarUrl: 'avatar_url' in user ? user.avatar_url : null,
  }
}

export function normalizeNotionTokenResponse(
  result: OauthTokenResponse,
): NotionConnection {
  if (!result.refresh_token) {
    throw new NotionRefreshTokenUnavailableError()
  }

  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    botId: result.bot_id,
    workspaceId: result.workspace_id,
    workspaceName: result.workspace_name,
    workspaceIcon: result.workspace_icon,
    user: normalizeOwner(result.owner),
  }
}
