import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
} from '@tanstack/react-query'
import {
  disconnectNotion,
  getAvailableDatasets,
  getNotionViewer,
  reauthorizeNotion,
} from './auth-functions'
import {
  completeDatasetConnection,
  getNotionDataset,
  getNotionDatasetItems,
} from './dataset-functions'
import {
  deleteCardGroup,
  updateCardGroup,
  getCardGroupConfig,
  getCardGroups,
  getCardGroupStudyData,
} from './card-functions'
import type { NotionDatasetField } from './types'

export type CardGroups = Awaited<ReturnType<typeof getCardGroups>>
export type CardGroupConfig = Awaited<ReturnType<typeof getCardGroupConfig>>
export type CardGroupStudyData = Awaited<
  ReturnType<typeof getCardGroupStudyData>
>
export type NotionDataset = Awaited<ReturnType<typeof getNotionDataset>>
export type NotionDatasetItems = Awaited<
  ReturnType<typeof getNotionDatasetItems>
>
export type NotionDatasetItem = NotionDatasetItems[number]
export type NotionDatasetPreviewItem = NotionDatasetItem | null
export type AvailableDatasetPage = Awaited<
  ReturnType<typeof getAvailableDatasets>
>
export type AvailableDatasets = AvailableDatasetPage['datasets']
export type CardGroupNavigationDestination = 'groups' | 'study' | null

export type NotionDatasetItemsOptions = {
  limit: number
  fields?: NotionDatasetField[]
  requirePopulatedField?: boolean
}

export const notionKeys = {
  all: ['notion'] as const,
  viewer: ['notion', 'viewer'] as const,
  availableDatasets: (excludedDatasetId: string | null) =>
    ['notion', 'available-datasets', excludedDatasetId] as const,
  availableDatasetPages: (excludedDatasetId: string | null) =>
    ['notion', 'available-dataset-pages', excludedDatasetId] as const,
  cardGroupsAll: ['notion', 'card-groups'] as const,
  cardGroups: (nokaddoDatasetId: string) =>
    [...notionKeys.cardGroupsAll, nokaddoDatasetId] as const,
  cardGroupConfig: (dataGroupId: string) =>
    ['notion', 'card-group-config', dataGroupId] as const,
  cardGroupStudyData: (dataGroupId: string) =>
    ['notion', 'card-group-study-data', dataGroupId] as const,
  cardGroupUpdates: ['notion', 'update-card-group'] as const,
  cardGroupNavigation: (dataGroupId: string) =>
    ['notion', 'card-group-navigation', dataGroupId] as const,
  dataset: (dataSetId: string) => ['notion', 'dataset', dataSetId] as const,
  datasetItems: (dataSetId: string, options: NotionDatasetItemsOptions) =>
    [...notionKeys.dataset(dataSetId), 'items', options] as const,
  datasetPreviewItem: (dataSetId: string, fields: NotionDatasetField[]) =>
    [...notionKeys.dataset(dataSetId), 'preview-item', 4, fields] as const,
}

export const notionQueries = {
  viewer: () =>
    queryOptions({
      queryKey: notionKeys.viewer,
      queryFn: () => getNotionViewer(),
      retry: false,
      staleTime: 30_000,
    }),
  availableDatasets: (excludedDatasetId: string | null) =>
    queryOptions({
      queryKey: notionKeys.availableDatasets(excludedDatasetId),
      queryFn: async () =>
        (
          await getAvailableDatasets({
            data: { excludedDatasetId, cursor: null },
          })
        ).datasets,
      retry: false,
    }),
  availableDatasetPages: (excludedDatasetId: string | null) => {
    const pendingPages = new Map<string | null, Promise<AvailableDatasetPage>>()

    return infiniteQueryOptions({
      queryKey: notionKeys.availableDatasetPages(excludedDatasetId),
      queryFn: ({ pageParam }) => {
        const pendingPage = pendingPages.get(pageParam)
        if (pendingPage) return pendingPage

        const request = getAvailableDatasets({
          data: { excludedDatasetId, cursor: pageParam },
        }).finally(() => {
          if (pendingPages.get(pageParam) === request) {
            pendingPages.delete(pageParam)
          }
        })
        pendingPages.set(pageParam, request)
        return request
      },
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      retry: false,
    })
  },
  cardGroups: (nokaddoDatasetId: string) =>
    queryOptions({
      queryKey: notionKeys.cardGroups(nokaddoDatasetId),
      queryFn: () => getCardGroups({ data: { dataSetId: nokaddoDatasetId } }),
      retry: false,
    }),
  dataset: (dataSetId: string) =>
    queryOptions({
      queryKey: notionKeys.dataset(dataSetId),
      queryFn: () => getNotionDataset({ data: { dataSetId } }),
      retry: false,
    }),
  datasetItems: (
    dataSetId: string,
    {
      limit,
      fields = [],
      requirePopulatedField = false,
    }: NotionDatasetItemsOptions,
  ) =>
    queryOptions({
      queryKey: notionKeys.datasetItems(dataSetId, {
        limit,
        fields,
        requirePopulatedField,
      }),
      queryFn: () =>
        getNotionDatasetItems({
          data: { dataSetId, limit, fields, requirePopulatedField },
        }),
      retry: false,
    }),
  datasetPreviewItem: (dataSetId: string, fields: NotionDatasetField[]) =>
    queryOptions({
      queryKey: notionKeys.datasetPreviewItem(dataSetId, fields),
      queryFn: async () => {
        const items = await getNotionDatasetItems({
          data: {
            dataSetId,
            limit: 1,
            fields,
            requirePopulatedField: true,
          },
        })

        return items.at(0) ?? null
      },
      retry: false,
    }),
  getCardGroupConfig: (dataGroupId: string) =>
    queryOptions({
      queryKey: notionKeys.cardGroupConfig(dataGroupId),
      queryFn: () => getCardGroupConfig({ data: { dataGroupId } }),
      retry: false,
    }),
  cardGroupStudyData: (dataGroupId: string) =>
    queryOptions({
      queryKey: notionKeys.cardGroupStudyData(dataGroupId),
      queryFn: () => getCardGroupStudyData({ data: { dataGroupId } }),
      retry: false,
    }),
  cardGroupNavigation: (dataGroupId: string) =>
    queryOptions({
      queryKey: notionKeys.cardGroupNavigation(dataGroupId),
      queryFn: (): CardGroupNavigationDestination => null,
      initialData: null,
      enabled: false,
    }),
}

export const notionMutations = {
  completeDatasetConnection: () =>
    mutationOptions({
      mutationKey: [...notionKeys.all, 'complete-dataset-connection'],
      mutationFn: completeDatasetConnection,
    }),
  updateCardGroup: () =>
    mutationOptions({
      mutationKey: notionKeys.cardGroupUpdates,
      mutationFn: updateCardGroup,
    }),
  deleteCardGroup: () =>
    mutationOptions({
      mutationKey: [...notionKeys.all, 'delete-card-group'],
      mutationFn: deleteCardGroup,
    }),
  disconnect: () =>
    mutationOptions({
      mutationKey: [...notionKeys.all, 'disconnect'],
      mutationFn: () => disconnectNotion(),
    }),
  reauthorize: () =>
    mutationOptions({
      mutationKey: [...notionKeys.all, 'reauthorize'],
      mutationFn: () => reauthorizeNotion(),
    }),
}
