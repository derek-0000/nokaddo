import '@tanstack/react-start/server-only'

import {
  APIErrorCode,
  Client,
  ClientErrorCode,
  isNotionClientError,
} from '@notionhq/client'
import {
  NOTION_VERSION,
  NotionRefreshTokenUnavailableError,
  refreshNotionConnection,
} from './oauth-server'
import { requireNotionConnection } from './session-server'
import {
  isNotionInvalidGrant,
  isNotionUnauthorized,
  refreshNotionConnectionWithLock,
} from './token-refresh'

import type { NotionConnection } from './session-server'
import { AppError } from '#/lib/errors'

type ExecuteNotionRequestOptions<T> = {
  connection: NotionConnection
  request: (accessToken: string) => Promise<T>
  refresh: () => Promise<NotionConnection>
  onRefreshed: (connection: NotionConnection) => Promise<void>
}

export async function executeNotionRequest<T>({
  connection,
  request,
  refresh,
  onRefreshed,
}: ExecuteNotionRequestOptions<T>) {
  try {
    return await request(connection.accessToken)
  } catch (error) {
    if (!isNotionUnauthorized(error)) throw error
  }

  const refreshedConnection = await refresh()
  await onRefreshed(refreshedConnection)

  return await request(refreshedConnection.accessToken)
}

export async function withNotionClient<T>(
  request: (notion: Client) => Promise<T>,
): Promise<T> {
  const { connection, session } = await requireNotionConnection()

  try {
    return await executeNotionRequest({
      connection,
      request: (accessToken) =>
        request(
          new Client({
            auth: accessToken,
            notionVersion: NOTION_VERSION,
          }),
        ),
      refresh: () =>
        refreshNotionConnectionWithLock(connection, refreshNotionConnection),
      onRefreshed: async (refreshedConnection) => {
        await session.update({
          notion: refreshedConnection,
          notionReauthorizationRequired: undefined,
        })
      },
    })
  } catch (error) {
    if (
      isNotionInvalidGrant(error) ||
      error instanceof NotionRefreshTokenUnavailableError
    ) {
      await session.update({
        notion: undefined,
        notionReauthorizationRequired: true,
      })

      throw new AppError('reauth_required', { cause: error })
    }

    throw toNotionRequestError(error)
  }
}

export function isNotionObjectNotFound(error: unknown) {
  if (!(error instanceof AppError) || error.code !== 'internal') return false

  const cause = error.cause
  return (
    isNotionClientError(cause) && cause.code === APIErrorCode.ObjectNotFound
  )
}

function toNotionRequestError(error: unknown): AppError {
  if (error instanceof AppError) return error

  if (!isNotionClientError(error)) {
    console.error('Unexpected error while calling the Notion API', error)
    return new AppError('internal', { cause: error })
  }

  console.error('Notion API request failed', {
    code: error.code,
    status: 'status' in error ? error.status : undefined,
    requestId: 'request_id' in error ? error.request_id : undefined,
  })

  switch (error.code) {
    case APIErrorCode.Unauthorized:
      return new AppError('reauth_required', { cause: error })
    case APIErrorCode.RateLimited:
      return new AppError('rate_limited', { cause: error })
    case ClientErrorCode.RequestTimeout:
    case APIErrorCode.InternalServerError:
    case APIErrorCode.ServiceOverload:
    case APIErrorCode.ServiceUnavailable:
    case APIErrorCode.GatewayTimeout:
      return new AppError('temporarily_unavailable', { cause: error })
    default:
      return new AppError('internal', { cause: error })
  }
}
