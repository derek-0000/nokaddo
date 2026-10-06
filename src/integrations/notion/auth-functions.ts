import { createServerFn } from '@tanstack/react-start'
import type { DataSourceObjectResponse } from '@notionhq/client'
import {
  prepareNotionReauthorization,
  revokeNotionConnection,
} from './oauth-server'
import { getNotionSession } from './session-server'
import { withNotionClient } from './client-server'
import {
  validateCursorInput,
  validateGetAvailableDatasetsInput,
} from './dataset-input-validators'
import { hasAvailableDatasetFields } from './dataset-response-validators'
import { AppError } from '#/lib/errors'

export const getNotionViewer = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getNotionSession()
    const connection = session.data.notion

    if (!connection) return null

    return {
      workspaceId: connection.workspaceId,
      workspaceName: connection.workspaceName,
      workspaceIcon: connection.workspaceIcon,
      user: connection.user,
    }
  },
)

export const disconnectNotion = createServerFn({ method: 'POST' }).handler(
  async () => {
    const session = await getNotionSession()
    const connection = session.data.notion

    // Revoke the Notion OAuth token first so "Disconnect" truly severs access.
    // If revocation fails we keep the session intact and surface the failure so
    // the UI can preserve state and let the user retry.
    if (connection) {
      try {
        await revokeNotionConnection(connection)
      } catch (error) {
        console.error('Failed to revoke Notion token during disconnect', error)
        throw new AppError('disconnect_failed', { cause: error })
      }
    }

    await session.clear()

    return { success: true }
  },
)

export const reauthorizeNotion = createServerFn({ method: 'POST' }).handler(
  async () => ({
    authorizationUrl: await prepareNotionReauthorization(),
  }),
)

export const getAvailableDatasets = createServerFn({ method: 'GET' })
  .validator((data: unknown) => ({
    ...validateGetAvailableDatasetsInput(data),
    ...validateCursorInput(data),
  }))
  .handler(
    async ({ data }) =>
      await withNotionClient(async (notion) => {
        const response = await notion.search({
          filter: {
            value: 'data_source',
            property: 'object',
          },
          start_cursor: data.cursor ?? undefined,
        })

        const datasets = []
        const seenDatasetIds = new Set<string>()

        for (const result of response.results) {
          if (
            result.id === data.excludedDatasetId ||
            seenDatasetIds.has(result.id) ||
            !hasAvailableDatasetFields(result)
          ) {
            continue
          }

          seenDatasetIds.add(result.id)
          datasets.push(toAvailableDataset(result))
        }

        return { datasets, nextCursor: response.next_cursor }
      }),
  )

export function toAvailableDataset(dataset: DataSourceObjectResponse) {
  const title = dataset.title.map((item) => item.plain_text).join('')
  const description = dataset.description
    .map((item) => item.plain_text)
    .join('')

  return {
    id: dataset.id,
    title: title || 'Untitled',
    description: description || undefined,
    iconUrl: getDataSourceIconUrl(dataset.icon),
    coverUrl: getDataSourceCoverUrl(dataset.cover),
  }
}

function getDataSourceIconUrl(icon: DataSourceObjectResponse['icon']) {
  switch (icon?.type) {
    case 'file':
      return icon.file.url
    case 'external':
      return icon.external.url
    case 'custom_emoji':
      return icon.custom_emoji.url
    default:
      return undefined
  }
}

function getDataSourceCoverUrl(cover: DataSourceObjectResponse['cover']) {
  switch (cover?.type) {
    case 'file':
      return cover.file.url
    case 'external':
      return cover.external.url
    default:
      return undefined
  }
}
