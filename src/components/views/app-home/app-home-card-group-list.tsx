import { Link } from '@tanstack/react-router'
import { BookX } from 'lucide-react'
import Card from '#/components/ui/card'
import DatasetIcon from '#/components/ui/dataset-icon'
import EmptyState from '#/components/ui/empty-state'
import type { CardGroups } from '#/integrations/notion/api'
import { cn } from '#/lib/utils'

type CardGroup = CardGroups[number]

type AppHomeCardGroupListProps = {
  cardGroups: CardGroups
}

export default function AppHomeCardGroupList({
  cardGroups,
}: AppHomeCardGroupListProps) {
  if (!cardGroups.length) {
    return (
      <EmptyState
        icon={<BookX />}
        message="No decks yet — connect a dataset below."
      />
    )
  }

  return (
    <div
      className="flex gap-5 overflow-x-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Your card groups"
      tabIndex={0}
    >
      {cardGroups.map((cardGroup) => (
        <DeckCard
          key={cardGroup.id}
          cardGroup={cardGroup}
          className="w-32 shrink-0"
        />
      ))}
    </div>
  )
}

function DeckCard({
  cardGroup,
  className,
}: {
  cardGroup: CardGroup
  className?: string
}) {
  return (
    <Link
      to={
        cardGroup.groupingColumnId
          ? '/app/$deckId/groups'
          : '/app/$deckId/study'
      }
      params={{ deckId: cardGroup.id }}
      search={{ group: undefined }}
      className={cn(
        'group relative aspect-square w-full cursor-pointer text-left outline-none',
        className,
      )}
    >
      <Card className="relative flex h-full flex-col overflow-hidden p-3 shadow-sm transition-colors group-hover:bg-muted group-focus-visible:bg-muted">
        <DatasetIcon
          iconUrl={cardGroup.datasetIconUrl}
          className="size-12 rounded-md"
        />
        <div className="mt-auto min-w-0 pt-2">
          <p className="truncate text-sm font-medium">
            {cardGroup.datasetTitle || 'Untitled dataset'}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {cardGroup.groupingColumnName
              ? 'Grouped card deck'
              : 'Single card deck'}
          </p>
        </div>
      </Card>
    </Link>
  )
}
