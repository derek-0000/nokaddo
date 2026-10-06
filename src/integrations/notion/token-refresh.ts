import type { NotionConnection } from './session-server'

// This only coordinates refreshes within one server process. Replace it with a
// database lock or compare-and-swap before running multiple application instances.
const inFlightRefreshes = new Map<string, Promise<NotionConnection>>()

export function isNotionUnauthorized(error: unknown) {
  if (!error || typeof error !== 'object') return false

  return (
    ('code' in error && error.code === 'unauthorized') ||
    ('status' in error && error.status === 401)
  )
}

export function isNotionInvalidGrant(error: unknown) {
  if (
    !error ||
    typeof error !== 'object' ||
    !('status' in error) ||
    error.status !== 400 ||
    !('body' in error) ||
    typeof error.body !== 'string'
  ) {
    return false
  }

  try {
    const body = JSON.parse(error.body) as unknown

    return (
      !!body &&
      typeof body === 'object' &&
      (('code' in body && body.code === 'invalid_grant') ||
        ('error' in body && body.error === 'invalid_grant'))
    )
  } catch {
    return false
  }
}

export function refreshNotionConnectionWithLock(
  connection: NotionConnection,
  refresh: (connection: NotionConnection) => Promise<NotionConnection>,
) {
  const key = JSON.stringify([connection.workspaceId, connection.botId])
  const existingRefresh = inFlightRefreshes.get(key)

  if (existingRefresh) return existingRefresh

  const pendingRefresh = refresh(connection)
  inFlightRefreshes.set(key, pendingRefresh)

  const clearRefresh = () => {
    if (inFlightRefreshes.get(key) === pendingRefresh) {
      inFlightRefreshes.delete(key)
    }
  }

  void pendingRefresh.then(clearRefresh, clearRefresh)

  return pendingRefresh
}
