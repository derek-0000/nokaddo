import '@tanstack/react-start/server-only'

import { Client } from '@notionhq/client'
import { redirect } from '@tanstack/react-router'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import {
  NotionRefreshTokenUnavailableError,
  normalizeNotionTokenResponse,
} from './oauth-normalization'
import { getNotionSession } from './session-server'
import type { NotionConnection } from './session-server'
import type { CompleteNotionAuthInput } from './types'
import { serverConfigValue } from '#/lib/server-config'

const NOTION_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize'
export const NOTION_VERSION = '2026-03-11'
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

export { NotionRefreshTokenUnavailableError }

export type NotionOAuthErrorCode =
  | 'oauth_cancelled'
  | 'oauth_state_invalid'
  | 'oauth_exchange_failed'
  | 'configuration_error'

export class NotionOAuthError extends Error {
  readonly code: NotionOAuthErrorCode

  constructor(code: NotionOAuthErrorCode, options?: ErrorOptions) {
    super(code, options)
    this.name = 'NotionOAuthError'
    this.code = code
  }
}

class NotionOAuthConfigurationError extends Error {
  constructor(options: ErrorOptions) {
    super('Notion OAuth configuration is unavailable', options)
    this.name = 'NotionOAuthConfigurationError'
  }
}

function createOAuthClient() {
  return new Client({
    notionVersion: NOTION_VERSION,
    retry: false,
  })
}

export function timesafeMatch(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  const comparisonLength = Math.max(actualBuffer.length, expectedBuffer.length)
  const paddedActual = Buffer.alloc(comparisonLength)
  const paddedExpected = Buffer.alloc(comparisonLength)

  actualBuffer.copy(paddedActual)
  expectedBuffer.copy(paddedExpected)

  const contentMatches = timingSafeEqual(paddedActual, paddedExpected)
  return actualBuffer.length === expectedBuffer.length && contentMatches
}

async function exchangeAuthorizationCode(code: string) {
  let clientId: string
  let clientSecret: string
  let redirectUri: string

  try {
    clientId = serverConfigValue('OAUTH_CLIENT_ID')
    clientSecret = serverConfigValue('OAUTH_CLIENT_SECRET')
    redirectUri = serverConfigValue('OAUTH_REDIRECT_URI')
  } catch (error) {
    throw new NotionOAuthConfigurationError({ cause: error })
  }

  const client = createOAuthClient()

  const result = await client.oauth.token({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })

  return normalizeNotionTokenResponse(result)
}

export async function refreshNotionConnection(
  connection: NotionConnection,
): Promise<NotionConnection> {
  const result = await createOAuthClient().oauth.token({
    client_id: serverConfigValue('OAUTH_CLIENT_ID'),
    client_secret: serverConfigValue('OAUTH_CLIENT_SECRET'),
    grant_type: 'refresh_token',
    refresh_token: connection.refreshToken,
  })

  return normalizeNotionTokenResponse(result)
}

export async function revokeNotionConnection(
  connection: NotionConnection,
): Promise<void> {
  await createOAuthClient().oauth.revoke({
    client_id: serverConfigValue('OAUTH_CLIENT_ID'),
    client_secret: serverConfigValue('OAUTH_CLIENT_SECRET'),
    token: connection.accessToken,
  })
}

export async function beginNotionAuthorization(): Promise<never> {
  const clientId = serverConfigValue('OAUTH_CLIENT_ID')
  const redirectUri = serverConfigValue('OAUTH_REDIRECT_URI')
  const state = randomBytes(32).toString('base64url')
  const session = await getNotionSession()

  await session.update({
    oauthState: {
      value: state,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    },
  })

  const authorizationUrl = new URL(NOTION_AUTHORIZE_URL)
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    owner: 'user',
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  }).toString()

  throw redirect({
    href: authorizationUrl.toString(),
    statusCode: 302,
  })
}

export async function prepareNotionReauthorization() {
  const state = randomBytes(32).toString('base64url')
  const session = await getNotionSession()

  await session.update({
    oauthState: {
      value: state,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    },
  })

  const authorizationUrl = new URL(serverConfigValue('VITE_NOTION_AUTH_URL'))
  authorizationUrl.searchParams.set('state', state)

  return authorizationUrl.toString()
}

export async function completeNotionAuthorization({
  code,
  state,
  error: providerError,
}: CompleteNotionAuthInput) {
  const session = await getNotionSession()
  const storedState = session.data.oauthState

  // A callback is single-use regardless of its outcome. Consuming before
  // classification prevents provider errors and malformed callbacks from
  // leaving a valid state available for replay.
  await session.update({ oauthState: undefined })

  if (providerError !== undefined && providerError !== null) {
    throw new NotionOAuthError('oauth_cancelled')
  }

  if (
    !code ||
    !state ||
    !storedState ||
    storedState.expiresAt <= Date.now() ||
    !timesafeMatch(state, storedState.value)
  ) {
    throw new NotionOAuthError('oauth_state_invalid')
  }

  let connection: NotionConnection

  try {
    connection = await exchangeAuthorizationCode(code)
  } catch (error) {
    if (error instanceof NotionOAuthConfigurationError) {
      console.error('Notion OAuth is misconfigured', error)
      throw new NotionOAuthError('configuration_error', { cause: error })
    }

    console.error('Notion OAuth authorization code exchange failed', error)
    throw new NotionOAuthError('oauth_exchange_failed', { cause: error })
  }

  await session.update({
    notion: connection,
    notionReauthorizationRequired: undefined,
    oauthState: undefined,
  })

  return {
    workspaceId: connection.workspaceId,
    workspaceName: connection.workspaceName,
    workspaceIcon: connection.workspaceIcon,
    user: connection.user,
  }
}
