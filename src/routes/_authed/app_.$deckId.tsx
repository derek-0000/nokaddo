import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Outlet, createFileRoute, useRouterState } from '@tanstack/react-router'
import BackNavigation from '#/components/ui/back-navigation'
import DeckSettingsDrawer from '#/components/views/deck/deck-settings-drawer'
import RoutePendingScreen from '#/components/views/route-pending-screen'
import { notionKeys, notionQueries } from '#/integrations/notion/api'
import {
  toStoredCardConfigurationFromProperties,
  getCardGroupDatasetIconUrl,
  getCardGroupDatasetTitle,
} from '#/integrations/notion/card-configuration-validators'

export const Route = createFileRoute('/_authed/app_/$deckId')({
  loader: async ({ context, params }) => {
    const studyData = await context.queryClient.fetchQuery({
      ...notionQueries.cardGroupStudyData(params.deckId),
      staleTime: 30_000,
    })
    const cardGroup = toStoredCardConfigurationFromProperties(
      params.deckId,
      studyData.deckConfig,
    )

    if (!cardGroup) throw new Error('This deck configuration is incomplete')

    const dataset = await context.queryClient.fetchQuery(
      notionQueries.dataset(cardGroup.dataSetId),
    )

    return { ...studyData, dataset }
  },
  pendingComponent: RoutePendingScreen,
  pendingMs: 0,
  component: DeckLayout,
})

function DeckLayout() {
  const { deckId } = Route.useParams()
  const queryClient = useQueryClient()
  const { data: configurationNavigationDestination } = useQuery(
    notionQueries.cardGroupNavigation(deckId),
  )
  const { deckConfig, dataset } = Route.useLoaderData()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const cardGroup = toStoredCardConfigurationFromProperties(deckId, deckConfig)
  const configurationNavigationReachedDestination =
    configurationNavigationDestination === 'study'
      ? cardGroup?.groupingColumnId === null && pathname.endsWith('/study')
      : configurationNavigationDestination === 'groups'
        ? cardGroup?.groupingColumnId !== null && pathname.endsWith('/groups')
        : false

  useEffect(() => {
    if (!configurationNavigationReachedDestination) return

    queryClient.setQueryData(notionKeys.cardGroupNavigation(deckId), null)
  }, [configurationNavigationReachedDestination, deckId, queryClient])

  if (!cardGroup) throw new Error('This deck configuration is incomplete')
  const deckTitle = getCardGroupDatasetTitle(deckConfig) || 'Untitled dataset'
  const returnToGroups =
    cardGroup.groupingColumnId !== null && pathname.endsWith('/study')

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-transparent">
      <header className="sticky top-0 z-10 mb-3">
        <div className="h-12" aria-hidden />
        <div className="border-b border-border bg-background/50 px-4 py-2 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              {returnToGroups ? (
                <BackNavigation
                  to="/app/$deckId/groups"
                  params
                  label={deckTitle}
                  imageUrl={getCardGroupDatasetIconUrl(deckConfig)}
                />
              ) : (
                <BackNavigation
                  to="/app"
                  label={deckTitle}
                  imageUrl={getCardGroupDatasetIconUrl(deckConfig)}
                />
              )}
            </div>

            <DeckSettingsDrawer
              cardGroup={cardGroup}
              dataset={dataset}
              deckId={deckId}
              deckTitle={deckTitle}
            />
          </div>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-2">
        {configurationNavigationDestination !== null ? (
          <RoutePendingScreen />
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  )
}
