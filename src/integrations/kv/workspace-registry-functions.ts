import { createServerFn } from '@tanstack/react-start'
import { deleteKvValue, getKvValue, setKvValue } from './client-server'
import {
  isNotionObjectNotFound,
  withNotionClient,
} from '#/integrations/notion/client-server'
import { requireNotionConnection } from '#/integrations/notion/session-server'
import { AppError } from '#/lib/errors'

type SetWorkspaceAppDatasetInput = {
  appDatasetId: string
}

export const getWorkspaceAppDatasetId = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { connection } = await requireNotionConnection()
  return await resolveStoredAppDatasetId(connection.workspaceId)
})

export const setWorkspaceAppDatasetId = createServerFn({ method: 'POST' })
  .validator(validateSetWorkspaceAppDatasetInput)
  .handler(async ({ data }) => {
    const { connection } = await requireNotionConnection()
    const storedAppDatasetId = await resolveStoredAppDatasetId(
      connection.workspaceId,
    )

    if (storedAppDatasetId !== null) return storedAppDatasetId

    await setKvValue(connection.workspaceId, data.appDatasetId)
    return data.appDatasetId
  })

async function resolveStoredAppDatasetId(workspaceId: string) {
  const appDatasetId = validateStoredAppDatasetId(await getKvValue(workspaceId))

  if (appDatasetId === null) return null

  try {
    await withNotionClient((notion) =>
      notion.dataSources.retrieve({ data_source_id: appDatasetId }),
    )
    return appDatasetId
  } catch (error) {
    if (!isNotionObjectNotFound(error)) throw error

    await deleteKvValue(workspaceId)
    return null
  }
}

function validateSetWorkspaceAppDatasetInput(
  data: unknown,
): SetWorkspaceAppDatasetInput {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new AppError('validation')
  }

  const record = data as Record<string, unknown>
  const appDatasetId = Object.hasOwn(record, 'appDatasetId')
    ? record.appDatasetId
    : undefined

  if (typeof appDatasetId !== 'string' || appDatasetId.length === 0) {
    throw new AppError('validation')
  }

  return { appDatasetId }
}

function validateStoredAppDatasetId(value: string | null) {
  if (value === null) return null
  if (value.length > 0) return value

  throw new AppError('internal')
}
