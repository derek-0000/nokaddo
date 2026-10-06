import { MutationObserver } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  workspaceRegistryKeys,
  workspaceRegistryMutations,
  workspaceRegistryQueries,
} from './api'
import { createTestQueryClient } from '../../../test/support/query-client'

const boundaries = vi.hoisted(() => ({
  getWorkspaceAppDatasetId: vi.fn(),
  setWorkspaceAppDatasetId: vi.fn(),
}))

vi.mock('./workspace-registry-functions', () => ({
  getWorkspaceAppDatasetId: boundaries.getWorkspaceAppDatasetId,
  setWorkspaceAppDatasetId: boundaries.setWorkspaceAppDatasetId,
}))

beforeEach(() => {
  for (const boundary of Object.values(boundaries)) boundary.mockReset()

  boundaries.getWorkspaceAppDatasetId.mockResolvedValue('app-dataset-id')
  boundaries.setWorkspaceAppDatasetId.mockResolvedValue('app-dataset-id')
})

describe('Workspace Registry query contracts', () => {
  it('uses isolated, stable keys for each Workspace', () => {
    expect(workspaceRegistryKeys.appDatasetId('workspace-a')).toEqual([
      ...workspaceRegistryKeys.all,
      'workspace-a',
      'app-dataset-id',
    ])
    expect(workspaceRegistryKeys.appDatasetId('workspace-a')).not.toEqual(
      workspaceRegistryKeys.appDatasetId('workspace-b'),
    )
    expect(
      workspaceRegistryMutations.setAppDatasetId('workspace-a').mutationKey,
    ).toEqual([...workspaceRegistryKeys.appDatasetId('workspace-a'), 'set'])
  })

  it('reads the authenticated Workspace mapping through its server function', async () => {
    const queryClient = createTestQueryClient()

    await expect(
      queryClient.fetchQuery(
        workspaceRegistryQueries.appDatasetId('workspace-a'),
      ),
    ).resolves.toBe('app-dataset-id')
    expect(boundaries.getWorkspaceAppDatasetId).toHaveBeenCalledWith()
    expect(workspaceRegistryQueries.appDatasetId('workspace-a').retry).toBe(
      false,
    )
  })

  it('does not retry a failed registry read', async () => {
    const queryClient = createTestQueryClient()
    const failure = new Error('SENTINEL registry unavailable')
    boundaries.getWorkspaceAppDatasetId.mockRejectedValue(failure)

    await expect(
      queryClient.fetchQuery(
        workspaceRegistryQueries.appDatasetId('workspace-a'),
      ),
    ).rejects.toBe(failure)
    expect(boundaries.getWorkspaceAppDatasetId).toHaveBeenCalledOnce()
  })

  it('writes only the App Dataset ID through its authenticated server function', async () => {
    const queryClient = createTestQueryClient()
    const observer = new MutationObserver(
      queryClient,
      workspaceRegistryMutations.setAppDatasetId('workspace-a'),
    )

    await expect(observer.mutate('app-dataset-id')).resolves.toBe(
      'app-dataset-id',
    )
    expect(boundaries.setWorkspaceAppDatasetId).toHaveBeenCalledWith({
      data: { appDatasetId: 'app-dataset-id' },
    })
  })
})
