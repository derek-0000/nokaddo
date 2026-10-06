import '@tanstack/react-start/server-only'

import { useSession as getServerSession } from '@tanstack/react-start/server'
import type { SessionConfig } from '@tanstack/react-start/server'
import type { NotionViewer } from './types'
import { AppError } from '#/lib/errors'
import { serverConfigValue } from '#/lib/server-config'

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export type NotionConnection = NotionViewer & {
  accessToken: string
  refreshToken: string
  botId: string
}

type NotionOAuthState = {
  value: string
  expiresAt: number
}

type NotionSessionData = {
  notion?: NotionConnection
  notionReauthorizationRequired?: boolean
  oauthState?: NotionOAuthState
}

function getSessionConfig(): SessionConfig {
  const password = serverConfigValue('SESSION_SECRET')

  const isProduction = process.env.NODE_ENV === 'production'

  return {
    name: isProduction ? '__Host-nfcards' : 'nfcards',
    password,
    maxAge: SESSION_MAX_AGE_SECONDS,
    sessionHeader: false,
    cookie: {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: isProduction,
    },
  }
}

export function getNotionSession() {
  return getServerSession<NotionSessionData>(getSessionConfig())
}

export async function requireNotionConnection() {
  const session = await getNotionSession()
  const connection = session.data.notion

  if (!connection) {
    throw new AppError('unauthenticated')
  }

  return { connection, session }
}
