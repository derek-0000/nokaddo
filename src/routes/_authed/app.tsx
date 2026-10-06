import { createFileRoute } from '@tanstack/react-router'
import AppHome from '#/components/views/app-home/app-home'
import NotionRouteErrorScreen from '#/components/views/notion-route-error-screen'
import RoutePendingScreen from '#/components/views/route-pending-screen'
import { workspaceRegistryQueries } from '#/integrations/kv/api'
import { notionQueries } from '#/integrations/notion/api'
import { AppError } from '#/lib/errors'

export const Route = createFileRoute('/_authed/app')({
  ssr: false,
  loader: async ({ context }) => {
    const viewer = await context.queryClient.ensureQueryData(
      notionQueries.viewer(),
    )

    if (!viewer) throw new AppError('unauthenticated')

    const appDatasetId = await context.queryClient.fetchQuery(
      workspaceRegistryQueries.appDatasetId(viewer.workspaceId),
    )
    const [datasetPages, cardGroups] = await Promise.all([
      context.queryClient.ensureInfiniteQueryData(
        notionQueries.availableDatasetPages(appDatasetId),
      ),
      appDatasetId
        ? context.queryClient.fetchQuery(notionQueries.cardGroups(appDatasetId))
        : Promise.resolve([]),
    ])

    // One deck per dataset for now — hide datasets that already have a deck.
    const connectedDatasetIds = new Set(
      cardGroups.map((cardGroup) => cardGroup.dataSetId),
    )
    const availableDatasets = datasetPages.pages.reduce(
      (datasets, page) => {
        datasets.push(
          ...page.datasets.filter(
            (dataset) => !connectedDatasetIds.has(dataset.id),
          ),
        )
        return datasets
      },
      [] as (typeof datasetPages.pages)[number]['datasets'],
    )

    return {
      datasets: availableDatasets,
      cardGroups,
      excludedDatasetId: appDatasetId,
    }
  },
  pendingComponent: RoutePendingScreen,
  errorComponent: ({ error }) => (
    <NotionRouteErrorScreen
      error={error}
      title="We couldn't load your card groups and datasets"
    />
  ),
  component: RouteComponent,
})

function RouteComponent() {
  const { cardGroups, excludedDatasetId } = Route.useLoaderData()

  return (
    <AppHome cardGroups={cardGroups} excludedDatasetId={excludedDatasetId} />
  )
}
