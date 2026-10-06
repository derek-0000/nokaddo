import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import DatasetConnection from '#/components/views/dataset-configuration/dataset-connection'
import NotionRouteErrorScreen from '#/components/views/notion-route-error-screen'
import RoutePendingScreen from '#/components/views/route-pending-screen'
import { workspaceRegistryQueries } from '#/integrations/kv/api'
import { notionQueries } from '#/integrations/notion/api'
import { AppError } from '#/lib/errors'
import BackNavigation from '#/components/ui/back-navigation'

export const Route = createFileRoute('/_authed/app_/$datasetId/connect')({
  beforeLoad: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      notionQueries.dataset(params.datasetId),
    )
  },
  loader: async ({ context }) => {
    const viewer = await context.queryClient.ensureQueryData(
      notionQueries.viewer(),
    )

    if (!viewer) throw new AppError('unauthenticated')

    return {
      workspaceId: viewer.workspaceId,
      appDatasetId: await context.queryClient.fetchQuery(
        workspaceRegistryQueries.appDatasetId(viewer.workspaceId),
      ),
    }
  },
  pendingComponent: RoutePendingScreen,
  errorComponent: ({ error }) => (
    <NotionRouteErrorScreen
      error={error}
      title="We couldn't load this dataset"
    />
  ),
  component: RouteComponent,
})

function RouteComponent() {
  const { datasetId } = Route.useParams()
  const { workspaceId, appDatasetId } = Route.useLoaderData()
  const { data: dataset } = useSuspenseQuery(notionQueries.dataset(datasetId))

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col overflow-hidden px-4 pt-15 pb-3">
      <header className="flex shrink-0 items-center">
        <BackNavigation
          to="/app"
          label={dataset.title}
          imageUrl={dataset.iconUrl}
        />
      </header>
      <div className="min-h-0 flex-1">
        <DatasetConnection
          dataset={dataset}
          workspaceId={workspaceId}
          appDatasetId={appDatasetId}
        />
      </div>
    </div>
  )
}
