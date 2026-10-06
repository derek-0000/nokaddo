import { Link } from '@tanstack/react-router'
import StudyProgressChart from './study-progress-chart'
import { cardSurfaceClassName } from '#/components/ui/card'
import { cn } from '#/lib/utils'

import type { CardStudyStats } from '#/integrations/notion/card-study'

type CategoryLinkProps = {
  deckId: string
  label: string
  group: string
  stats: CardStudyStats
}

export default function CategoryLink({
  deckId,
  label,
  group,
  stats,
}: CategoryLinkProps) {
  return (
    <Link
      to="/app/$deckId/study"
      params={{ deckId }}
      search={{ group }}
      className={cn(
        cardSurfaceClassName,
        'flex min-h-24 flex-col overflow-hidden text-left text-sm font-medium transition-colors hover:bg-muted',
      )}
    >
      <div className="flex flex-1 flex-col gap-1 p-3 pb-2">
        <span className="line-clamp-2">{label}</span>
        <span className="text-xs font-normal tabular-nums text-muted-foreground">
          {stats.total.toLocaleString()} cards
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border bg-background/40 px-3 py-2">
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          <span className="text-foreground">
            {stats.completed.toLocaleString()}
          </span>
          /{stats.total.toLocaleString()} learned
        </span>
        <StudyProgressChart {...stats} />
      </div>
    </Link>
  )
}
