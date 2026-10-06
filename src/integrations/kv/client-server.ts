import '@tanstack/react-start/server-only'

import { serverConfigValue } from '#/lib/server-config'

type KvOperation = 'read' | 'write' | 'delete'

export class CloudflareKvRequestError extends Error {
  readonly operation: KvOperation
  readonly status: number

  constructor(operation: KvOperation, status: number) {
    super(`Cloudflare KV ${operation} failed with status ${status}`)
    this.name = 'CloudflareKvRequestError'
    this.operation = operation
    this.status = status
  }
}

export async function getKvValue(key: string) {
  const response = await fetch(kvValueUrl(key), {
    headers: kvAuthorizationHeaders(),
  })

  if (response.status === 404) {
    await assertKvNamespaceAvailable('read')
    return null
  }

  if (!response.ok) {
    throw new CloudflareKvRequestError('read', response.status)
  }

  return await response.text()
}

export async function setKvValue(key: string, value: string) {
  const response = await fetch(kvValueUrl(key), {
    method: 'PUT',
    headers: {
      ...kvAuthorizationHeaders(),
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body: value,
  })

  if (!response.ok) {
    throw new CloudflareKvRequestError('write', response.status)
  }
}

export async function deleteKvValue(key: string) {
  const response = await fetch(kvValueUrl(key), {
    method: 'DELETE',
    headers: kvAuthorizationHeaders(),
  })

  if (response.status === 404) {
    await assertKvNamespaceAvailable('delete')
    return
  }

  if (!response.ok) {
    throw new CloudflareKvRequestError('delete', response.status)
  }
}

function kvValueUrl(key: string) {
  const accountId = encodeURIComponent(
    serverConfigValue('CLOUDFLARE_ACCOUNT_ID'),
  )
  const namespaceId = encodeURIComponent(
    serverConfigValue('CLOUDFLARE_KV_NAMESPACE_ID'),
  )

  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`
}

async function assertKvNamespaceAvailable(operation: KvOperation) {
  const response = await fetch(kvNamespaceUrl(), {
    headers: kvAuthorizationHeaders(),
  })

  if (!response.ok) {
    throw new CloudflareKvRequestError(operation, response.status)
  }
}

function kvNamespaceUrl() {
  const accountId = encodeURIComponent(
    serverConfigValue('CLOUDFLARE_ACCOUNT_ID'),
  )
  const namespaceId = encodeURIComponent(
    serverConfigValue('CLOUDFLARE_KV_NAMESPACE_ID'),
  )

  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`
}

function kvAuthorizationHeaders() {
  return {
    Authorization: `Bearer ${serverConfigValue('CLOUDFLARE_KV_API_TOKEN')}`,
  }
}
