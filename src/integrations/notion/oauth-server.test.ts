import type { OauthTokenResponse } from '@notionhq/client'
import { describe, expect, it } from 'vitest'
import {
  NotionRefreshTokenUnavailableError,
  normalizeNotionTokenResponse,
} from './oauth-normalization'
import { timesafeMatch } from './oauth-server'

function oauthTokenResponse(
  overrides: Partial<OauthTokenResponse> = {},
): OauthTokenResponse {
  return {
    access_token: 'access-token',
    token_type: 'bearer',
    refresh_token: 'refresh-token',
    bot_id: 'bot-id',
    workspace_icon: 'https://assets.test/workspace.png',
    workspace_name: 'Workspace',
    workspace_id: 'workspace-id',
    owner: {
      type: 'user',
      user: {
        object: 'user',
        type: 'person',
        id: 'user-id',
        name: 'Ada',
        avatar_url: 'https://assets.test/ada.png',
        person: { email: 'ada@example.test' },
      },
    },
    duplicated_template_id: null,
    ...overrides,
  }
}

describe('OAuth state matching', () => {
  it.each([
    ['matching ASCII bytes', 'state-value', 'state-value', true],
    ['matching Unicode bytes', 'á-state', 'á-state', true],
    ['different content', 'state-value', 'state-valuf', false],
    ['different byte lengths', 'short', 'longer-state', false],
    ['same character length but different byte lengths', 'é', 'e', false],
    ['two empty values', '', '', true],
  ])('%s', (_label, actual, expected, result) => {
    expect(timesafeMatch(actual, expected)).toBe(result)
  })
})

describe('OAuth token normalization', () => {
  it('preserves workspace credentials and maps a full user owner', () => {
    expect(normalizeNotionTokenResponse(oauthTokenResponse())).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      botId: 'bot-id',
      workspaceId: 'workspace-id',
      workspaceName: 'Workspace',
      workspaceIcon: 'https://assets.test/workspace.png',
      user: {
        id: 'user-id',
        name: 'Ada',
        email: 'ada@example.test',
        avatarUrl: 'https://assets.test/ada.png',
      },
    })
  })

  it('maps a partial user owner without inventing optional profile data', () => {
    expect(
      normalizeNotionTokenResponse(
        oauthTokenResponse({
          owner: {
            type: 'user',
            user: {
              object: 'user',
              id: 'partial-user-id',
            },
          },
        }),
      ).user,
    ).toEqual({
      id: 'partial-user-id',
      name: null,
      email: null,
      avatarUrl: null,
    })
  })

  it('maps a workspace owner to no user', () => {
    expect(
      normalizeNotionTokenResponse(
        oauthTokenResponse({
          owner: { type: 'workspace', workspace: true },
        }),
      ).user,
    ).toBeNull()
  })

  it.each([null, ''])(
    'rejects a response with refresh_token %j',
    (refreshToken) => {
      expect(() =>
        normalizeNotionTokenResponse(
          oauthTokenResponse({ refresh_token: refreshToken }),
        ),
      ).toThrow(NotionRefreshTokenUnavailableError)
    },
  )
})
