import type { OauthTokenResponse } from '@notionhq/client'
import { createFixtureBuilder } from './build'

export const buildNotionOAuthResponse =
  createFixtureBuilder<OauthTokenResponse>(() => ({
    access_token: 'fixture-access-token',
    token_type: 'bearer',
    refresh_token: 'fixture-refresh-token',
    bot_id: 'fixture-bot-id',
    workspace_icon: 'https://assets.test/workspace.png',
    workspace_name: 'Fixture workspace',
    workspace_id: 'fixture-workspace-id',
    owner: {
      type: 'user',
      user: {
        object: 'user',
        type: 'person',
        id: 'fixture-user-id',
        name: 'Ada',
        avatar_url: null,
        person: { email: 'ada@example.test' },
      },
    },
    duplicated_template_id: null,
  }))
