import { mutationOptions, queryOptions } from '@tanstack/react-query'
import {
  getWorkspaceAppDatasetId,
  setWorkspaceAppDatasetId,
} from './workspace-registry-functions'

export const workspaceRegistryKeys = {
  all: ['workspace-registry'] as const,
  appDatasetId: (workspaceId: string) =>
    ['workspace-registry', workspaceId, 'app-dataset-id'] as const,
}

export const workspaceRegistryQueries = {
  appDatasetId: (workspaceId: string) =>
    queryOptions({
      queryKey: workspaceRegistryKeys.appDatasetId(workspaceId),
      queryFn: () => getWorkspaceAppDatasetId(),
      retry: false,
    }),
}

export const workspaceRegistryMutations = {
  setAppDatasetId: (workspaceId: string) =>
    mutationOptions({
      mutationKey: [...workspaceRegistryKeys.appDatasetId(workspaceId), 'set'],
      mutationFn: (appDatasetId: string) =>
        setWorkspaceAppDatasetId({ data: { appDatasetId } }),
    }),
}
