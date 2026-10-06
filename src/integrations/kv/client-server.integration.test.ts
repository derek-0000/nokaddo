import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CloudflareKvRequestError,
  deleteKvValue,
  getKvValue,
  setKvValue,
} from './client-server'

const cloudflareConfig = {
  CLOUDFLARE_ACCOUNT_ID: 'account/id',
  CLOUDFLARE_KV_NAMESPACE_ID: 'namespace id',
  CLOUDFLARE_KV_API_TOKEN: 'SENTINEL-cloudflare-token',
}

beforeEach(() => {
  for (const [name, value] of Object.entries(cloudflareConfig)) {
    vi.stubEnv(name, value)
  }
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Cloudflare KV REST boundary', () => {
  it('reads an encoded key with the restricted bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('app-dataset-id'))

    await expect(getKvValue('workspace/id with spaces')).resolves.toBe(
      'app-dataset-id',
    )
    expect(fetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account%2Fid/storage/kv/namespaces/namespace%20id/values/workspace%2Fid%20with%20spaces',
      {
        headers: {
          Authorization: 'Bearer SENTINEL-cloudflare-token',
        },
      },
    )
  })

  it('returns null for an absent key', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('provider detail', { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    await expect(getKvValue('missing-workspace')).resolves.toBeNull()
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.cloudflare.com/client/v4/accounts/account%2Fid/storage/kv/namespaces/namespace%20id',
      {
        headers: {
          Authorization: 'Bearer SENTINEL-cloudflare-token',
        },
      },
    )
  })

  it('rejects a namespace-level 404 instead of treating it as an absent key', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('provider detail', { status: 404 }))
      .mockResolvedValueOnce(new Response('provider detail', { status: 404 }))

    await expect(getKvValue('missing-workspace')).rejects.toEqual(
      new CloudflareKvRequestError('read', 404),
    )
  })

  it('treats a missing-key response as a write failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('provider detail', { status: 404 }),
    )

    await expect(setKvValue('workspace-id', 'app-dataset-id')).rejects.toEqual(
      new CloudflareKvRequestError('write', 404),
    )
  })

  it('writes the App Dataset ID as a plain value', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }))

    await expect(
      setKvValue('workspace-id', 'app-dataset-id'),
    ).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account%2Fid/storage/kv/namespaces/namespace%20id/values/workspace-id',
      {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer SENTINEL-cloudflare-token',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: 'app-dataset-id',
      },
    )
  })

  it('deletes a registry key with the restricted bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(deleteKvValue('workspace-id')).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account%2Fid/storage/kv/namespaces/namespace%20id/values/workspace-id',
      {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer SENTINEL-cloudflare-token',
        },
      },
    )
  })

  it('treats deleting an already absent registry key as success', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('provider detail', { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))

    await expect(deleteKvValue('missing-workspace')).resolves.toBeUndefined()
  })

  it('rejects deleting against a missing namespace instead of treating it as success', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response('provider detail', { status: 404 }))
      .mockResolvedValueOnce(new Response('provider detail', { status: 404 }))

    await expect(deleteKvValue('missing-workspace')).rejects.toEqual(
      new CloudflareKvRequestError('delete', 404),
    )
  })

  it.each([
    ['read', () => getKvValue('workspace-id')],
    ['write', () => setKvValue('workspace-id', 'app-dataset-id')],
    ['delete', () => deleteKvValue('workspace-id')],
  ] as const)(
    'rejects a failed %s without exposing its response body',
    async (operation, request) => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response('SENTINEL private provider response', { status: 503 }),
      )

      const error = await request().catch((caught: unknown) => caught)

      expect(error).toEqual(new CloudflareKvRequestError(operation, 503))
      expect(JSON.stringify(error)).not.toContain('private provider response')
      expect((error as Error).message).not.toContain(
        'private provider response',
      )
    },
  )

  it.each([
    ['read', () => getKvValue('workspace-id')],
    ['write', () => setKvValue('workspace-id', 'app-dataset-id')],
  ] as const)('propagates transport failures from %s', async (_, request) => {
    const transportFailure = new Error('SENTINEL transport failure')
    vi.mocked(fetch).mockRejectedValueOnce(transportFailure)

    await expect(request()).rejects.toBe(transportFailure)
  })
})
