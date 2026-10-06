import { useQuery } from '@tanstack/react-query'
import { Navigate, createFileRoute } from '@tanstack/react-router'
import StudyScreen from '#/components/views/study/study-screen'
import RoutePendingScreen from '#/components/views/route-pending-screen'
import { notionQueries } from '#/integrations/notion/api'
import type { CardGroupStudyData } from '#/integrations/notion/api'
import { toStoredCardConfigurationFromProperties } from '#/integrations/notion/card-configuration-validators'
import { Route as DeckRoute } from './app_.$deckId'

export const Route = createFileRoute('/_authed/app_/$deckId/study')({
  validateSearch: (search): { group?: string } => ({
    group:
      typeof search.group === 'string' && search.group.length > 0
        ? search.group
        : undefined,
  }),
  component: RouteComponent,
  pendingComponent: RoutePendingScreen,
})

function RouteComponent() {
  const { deckId } = Route.useParams()
  const { group } = Route.useSearch()
  const loaderStudyData = DeckRoute.useLoaderData()
  const { data: refreshedStudyData } = useQuery({
    ...notionQueries.cardGroupStudyData(deckId),
    // Groups refreshes invalidated stats. Keep this session's base counts stable
    // while local progress deltas account for its writes.
    enabled: false,
  })
  const { data: configurationNavigationDestination } = useQuery(
    notionQueries.cardGroupNavigation(deckId),
  )

  if (configurationNavigationDestination !== null) return <RoutePendingScreen />

  return (
    <StudyRouteContent
      deckId={deckId}
      group={group}
      studyData={refreshedStudyData ?? loaderStudyData}
    />
  )
}

function StudyRouteContent({
  deckId,
  group,
  studyData,
}: {
  deckId: string
  group: string | undefined
  studyData: CardGroupStudyData
}) {
  const { deckConfig, groupKeys, groupingColumnType, categoryStats } = studyData
  const cardGroup = toStoredCardConfigurationFromProperties(deckId, deckConfig)
  if (!cardGroup) throw new Error('This deck configuration is incomplete')

  if (cardGroup.groupingColumnId === null)
    return (
      <StudyScreen
        key={deckId}
        cardGroup={cardGroup}
        stats={categoryStats.overall}
      />
    )

  if (!group || !groupKeys.includes(group))
    return <Navigate to="/app/$deckId/groups" params={{ deckId }} replace />

  if (!groupingColumnType)
    throw new Error('This deck grouping property is unavailable')

  return (
    <StudyScreen
      key={`${deckId}:${group}`}
      cardGroup={cardGroup}
      stats={
        categoryStats.byCategory[group] ?? {
          total: 0,
          visited: 0,
          completed: 0,
        }
      }
      category={{ value: group, propertyType: groupingColumnType }}
    />
  )
}
