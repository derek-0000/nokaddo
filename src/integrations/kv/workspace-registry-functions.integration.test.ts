import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getWorkspaceAppDatasetId,
  setWorkspaceAppDatasetId,
} from './workspace-registry-functions'
import { buildNotionConnection } from '../../../test/fixtures/session'
import { AppError } from '#/lib/errors'

const boundaries = vi.hoisted(() => ({
  deleteKvValue: vi.fn(),
  getKvValue: vi.fn(),
  requireNotionConnection: vi.fn(),
  setKvValue: vi.fn(),
  withNotionClient: vi.fn(),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data
    const builder = {
      validator: (next: (data: unknown) => unknown) => {
        validate = next
        return builder
      },
      handler:
        (handler: (context: { data: never }) => unknown) =>
        (context?: { data?: unknown }) =>
          handler({ data: validate(context?.data) as never }),
    }

    return builder
  },
}))

vi.mock('./client-server', () => ({
  deleteKvValue: boundaries.deleteKvValue,
  getKvValue: boundaries.getKvValue,
  setKvValue: boundaries.setKvValue,
}))

vi.mock('#/integrations/notion/client-server', () => ({
  isNotionObjectNotFound: vi.fn(),
  withNotionClient: boundaries.withNotionClient,
}))

vi.mock('#/integrations/notion/session-server', () => ({
  requireNotionConnection: boundaries.requireNotionConnection,
}))

const connection = buildNotionConnection({
  workspaceId: 'authenticated-workspace-id',
})

beforeEach(() => {
  for (const boundary of Object.values(boundaries)) boundary.mockReset()

  boundaries.requireNotionConnection.mockResolvedValue({
    connection,
    session: {},
  })
  boundaries.getKvValue.mockResolvedValue(null)
  boundaries.setKvValue.mockResolvedValue(undefined)
  const notionClient = {
    dataSources: {
      retrieve: vi.fn().mockResolvedValue({}),
    },
  }
  boundaries.withNotionClient.mockImplementation(
    async (request: (client: typeof notionClient) => Promise<unknown>) =>
      request(notionClient),
  )
})

describe('authenticated Workspace Registry', () => {
  it('reads the App Dataset ID using only the authenticated Workspace key', async () => {
    boundaries.getKvValue.mockResolvedValue('app-dataset-id')

    await expect(getWorkspaceAppDatasetId()).resolves.toBe('app-dataset-id')
    expect(boundaries.getKvValue).toHaveBeenCalledWith(
      'authenticated-workspace-id',
    )
  })

  it('represents an unregistered Workspace as null', async () => {
    await expect(getWorkspaceAppDatasetId()).resolves.toBeNull()
  })

  it('establishes the first App Dataset ID for the authenticated Workspace', async () => {
    await expect(
      setWorkspaceAppDatasetId({
        data: { appDatasetId: 'created-app-dataset-id' },
      }),
    ).resolves.toBe('created-app-dataset-id')
    expect(boundaries.getKvValue).toHaveBeenCalledWith(
      'authenticated-workspace-id',
    )
    expect(boundaries.setKvValue).toHaveBeenCalledWith(
      'authenticated-workspace-id',
      'created-app-dataset-id',
    )
  })

  it('retains an established ID without issuing another write', async () => {
    boundaries.getKvValue.mockResolvedValue('established-app-dataset-id')

    await expect(
      setWorkspaceAppDatasetId({
        data: { appDatasetId: 'replacement-app-dataset-id' },
      }),
    ).resolves.toBe('established-app-dataset-id')
    expect(boundaries.setKvValue).not.toHaveBeenCalled()
  })

  it('clears a stored ID when its App Dataset was deleted from Notion', async () => {
    const { isNotionObjectNotFound } =
      await import('#/integrations/notion/client-server')
    boundaries.getKvValue.mockResolvedValue('deleted-app-dataset-id')
    boundaries.withNotionClient.mockRejectedValue(new AppError('internal'))
    vi.mocked(isNotionObjectNotFound).mockReturnValue(true)

    await expect(getWorkspaceAppDatasetId()).resolves.toBeNull()
    expect(boundaries.deleteKvValue).toHaveBeenCalledWith(
      'authenticated-workspace-id',
    )
    expect(boundaries.withNotionClient).toHaveBeenCalledOnce()
  })

  it('clears a stale ID before establishing a replacement App Dataset', async () => {
    const { isNotionObjectNotFound } =
      await import('#/integrations/notion/client-server')
    boundaries.getKvValue.mockResolvedValue('deleted-app-dataset-id')
    boundaries.withNotionClient.mockRejectedValue(new AppError('internal'))
    vi.mocked(isNotionObjectNotFound).mockReturnValue(true)

    await expect(
      setWorkspaceAppDatasetId({ data: { appDatasetId: 'replacement-id' } }),
    ).resolves.toBe('replacement-id')
    expect(boundaries.deleteKvValue).toHaveBeenCalledWith(
      'authenticated-workspace-id',
    )
    expect(boundaries.setKvValue).toHaveBeenCalledWith(
      'authenticated-workspace-id',
      'replacement-id',
    )
  })

  it('keeps registry failures as errors when the App Dataset still exists', async () => {
    const { isNotionObjectNotFound } =
      await import('#/integrations/notion/client-server')
    const failure = new AppError('internal')
    boundaries.getKvValue.mockResolvedValue('app-dataset-id')
    boundaries.withNotionClient.mockRejectedValue(failure)
    vi.mocked(isNotionObjectNotFound).mockReturnValue(false)

    await expect(getWorkspaceAppDatasetId()).rejects.toBe(failure)
    expect(boundaries.deleteKvValue).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    null,
    {},
    { appDatasetId: '' },
    { appDatasetId: 42 },
    Object.create({ appDatasetId: 'inherited-id' }),
  ])(
    'rejects invalid write input %# before authentication or storage',
    async (data) => {
      await expect(
        Promise.resolve().then(() => setWorkspaceAppDatasetId({ data })),
      ).rejects.toEqual(new AppError('validation'))
      expect(boundaries.requireNotionConnection).not.toHaveBeenCalled()
      expect(boundaries.getKvValue).not.toHaveBeenCalled()
      expect(boundaries.setKvValue).not.toHaveBeenCalled()
    },
  )

  it('rejects a corrupt empty stored value instead of treating it as absent', async () => {
    boundaries.getKvValue.mockResolvedValue('')

    await expect(getWorkspaceAppDatasetId()).rejects.toEqual(
      new AppError('internal'),
    )
    await expect(
      setWorkspaceAppDatasetId({ data: { appDatasetId: 'new-id' } }),
    ).rejects.toEqual(new AppError('internal'))
    expect(boundaries.setKvValue).not.toHaveBeenCalled()
  })

  it('requires an authenticated Notion connection before reading KV', async () => {
    boundaries.requireNotionConnection.mockRejectedValue(
      new AppError('unauthenticated'),
    )

    await expect(getWorkspaceAppDatasetId()).rejects.toEqual(
      new AppError('unauthenticated'),
    )
    expect(boundaries.getKvValue).not.toHaveBeenCalled()
  })

  it('requires an authenticated Notion connection before writing KV', async () => {
    boundaries.requireNotionConnection.mockRejectedValue(
      new AppError('unauthenticated'),
    )

    await expect(
      setWorkspaceAppDatasetId({ data: { appDatasetId: 'new-id' } }),
    ).rejects.toEqual(new AppError('unauthenticated'))
    expect(boundaries.getKvValue).not.toHaveBeenCalled()
    expect(boundaries.setKvValue).not.toHaveBeenCalled()
  })

  it('does not write when the authenticated Workspace registry read fails', async () => {
    const storageFailure = new Error('SENTINEL registry read failure')
    boundaries.getKvValue.mockRejectedValue(storageFailure)

    await expect(
      setWorkspaceAppDatasetId({ data: { appDatasetId: 'new-id' } }),
    ).rejects.toBe(storageFailure)
    expect(boundaries.setKvValue).not.toHaveBeenCalled()
  })
})
