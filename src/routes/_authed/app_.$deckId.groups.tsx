import { useQuery } from '@tanstack/react-query'
import { Navigate, createFileRoute } from '@tanstack/react-router'
import { Layers } from 'lucide-react'
import EmptyState from '#/components/ui/empty-state'
import CategoryLink from '#/components/views/deck/category-link'
import RoutePendingScreen from '#/components/views/route-pending-screen'
import { notionQueries } from '#/integrations/notion/api'
import { toStoredCardConfigurationFromProperties } from '#/integrations/notion/card-configuration-validators'
import { Route as DeckRoute } from './app_.$deckId'

export const Route = createFileRoute('/_authed/app_/$deckId/groups')({
  component: RouteComponent,
  pendingComponent: RoutePendingScreen,
})

function RouteComponent() {
  const { deckId } = Route.useParams()
  const { data: configurationNavigationDestination } = useQuery(
    notionQueries.cardGroupNavigation(deckId),
  )
  const loaderStudyData = DeckRoute.useLoaderData()
  const { data: refreshedStudyData } = useQuery({
    ...notionQueries.cardGroupStudyData(deckId),
    staleTime: 30_000,
  })
  const { categoryStats, groupKeys, deckConfig } =
    refreshedStudyData ?? loaderStudyData

  if (configurationNavigationDestination !== null) return <RoutePendingScreen />

  const cardGroup = toStoredCardConfigurationFromProperties(deckId, deckConfig)
  const categories = groupKeys
  if (!cardGroup?.groupingColumnId) {
    return (
      <Navigate
        to="/app/$deckId/study"
        params={{ deckId }}
        search={{ group: undefined }}
        replace
      />
    )
  }

  return (
    <div className="">
      {categories.length > 0 ? (
        <div className="min-h-0 flex-1">
          <div className="mx-auto grid max-w-2xl grid-cols-2 gap-2 px-4 pb-3 sm:grid-cols-3">
            {categories.map((category) => (
              <CategoryLink
                key={category}
                deckId={deckId}
                label={category}
                group={category}
                stats={
                  categoryStats.byCategory[category] ?? {
                    total: 0,
                    visited: 0,
                    completed: 0,
                  }
                }
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="mx-auto mt-1 w-full max-w-2xl px-4">
          <EmptyState
            icon={<Layers />}
            message="This deck has no categories."
          />
        </div>
      )}
    </div>
  )
}
