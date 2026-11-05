import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { Loader, TriangleAlert } from 'lucide-react'
import StudyCard from './study-card'
import { useStudy } from './use-study'
import StudyProgressChart from '../deck/study-progress-chart'
import { Button } from '#/components/ui/button'
import { createStudyQuery } from '#/features/study/query'
import type { StudyCategorySelection } from '#/features/study/query'
import type { CardGroups } from '#/integrations/notion/api'
import type { CardStudyStats } from '#/integrations/notion/card-study'
import { toPublicError } from '#/lib/errors'
import type { CompactCard, StudyQuery } from '#/features/study/types'

type CardGroup = CardGroups[number]

type StudyScreenProps = {
  cardGroup: CardGroup
  category?: StudyCategorySelection
  stats: CardStudyStats
}

export default function StudyScreen({
  cardGroup,
  category,
  stats,
}: StudyScreenProps) {
  const query = useMemo(
    () => createStudyQuery(cardGroup, category),
    [cardGroup, category],
  )
  const study = useStudy({ deckId: cardGroup.id, query, stats })
  const displayedStats = {
    total: stats.total,
    visited: Math.min(
      stats.total,
      Math.max(0, stats.visited + study.progressDelta.visited),
    ),
    completed: Math.min(
      stats.total,
      Math.max(0, stats.completed + study.progressDelta.completed),
    ),
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col gap-1 overflow-hidden px-4">
      <header className="mb-2 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-x-3">
        <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
          <input
            type="checkbox"
            role="switch"
            checked={study.skipLearned}
            disabled={study.allLearned}
            onChange={(event) => study.setSkipLearned(event.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-4 w-7 rounded-full bg-muted-foreground/30 transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-3 after:rounded-full after:bg-background after:transition-transform peer-disabled:opacity-50 peer-checked:bg-primary peer-checked:after:translate-x-3 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
          />
          {study.allLearned ? 'All Learned' : 'Skip learned'}
        </label>
        <StudyProgressChart {...displayedStats} />
        <h1 className="truncate text-right text-xs font-medium text-muted-foreground">
          {category?.value ?? 'All cards'}
        </h1>
      </header>

      <main className="flex min-h-0 flex-1 flex-col pb-[max(1rem,env(safe-area-inset-bottom))]">
        <StudyContent
          study={study}
          query={query}
          total={displayedStats.total}
        />
      </main>
    </div>
  )
}

type StudyState = ReturnType<typeof useStudy>

function StudyContent({
  study,
  query,
  total,
}: {
  study: StudyState
  query: StudyQuery
  total: number
}) {
  if (study.isLoading) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center"
        role="status"
        aria-label="Loading"
      >
        <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (study.loadError) {
    return (
      <StudyMessage
        icon={<TriangleAlert />}
        title="We couldn't open this deck"
        description={toPublicError(study.loadError).message}
        action={
          <Button variant="soft" size="sm" onClick={() => void study.retry()}>
            Try again
          </Button>
        }
      />
    )
  }
  if (study.isEmpty) {
    return (
      <StudyMessage
        icon={<TriangleAlert />}
        title="This deck has no cards"
        description="No cards match this study selection."
      />
    )
  }
  return study.currentCard ? (
    <ActiveStudyCard
      card={study.currentCard}
      study={study}
      query={query}
      total={total}
    />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col" />
  )
}

function ActiveStudyCard({
  card,
  study,
  query,
  total,
}: {
  card: CompactCard
  study: StudyState
  query: StudyQuery
  total: number
}) {
  const navigationButtonRef = useRef<HTMLButtonElement>(null)
  const previousCardId = useRef<string | null>(null)

  useEffect(() => {
    if (previousCardId.current) navigationButtonRef.current?.focus()
    previousCardId.current = card.id
  }, [card.id])

  return (
    <>
      <StudyCard
        key={card.id}
        card={card}
        study={study}
        query={query}
        total={total}
        navigationButtonRef={navigationButtonRef}
      />
      {study.navigationError ? (
        <p
          className="mt-2 shrink-0 text-center text-xs text-destructive"
          role="alert"
        >
          {toPublicError(study.navigationError).message}
        </p>
      ) : null}
    </>
  )
}

function StudyMessage({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center">
      <div className="text-muted-foreground">{icon}</div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="max-w-xs text-xs text-muted-foreground">{description}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
