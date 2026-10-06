import { useEffect, useMemo, useRef } from 'react'
import { useInfiniteQuery, useMutation } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import AppHomeCardGroupList from './app-home-card-group-list'
import AppHomeDatasetList from './app-home-dataset-list'
import { Button } from '#/components/ui/button'
import SectionHeader from '#/components/ui/section-header'
import { notionMutations, notionQueries } from '#/integrations/notion/api'
import type { CardGroups } from '#/integrations/notion/api'
import { assignBrowserLocation } from '#/lib/browser-navigation'
import { toPublicError } from '#/lib/errors'

type AppHomeProps = {
  cardGroups: CardGroups
  excludedDatasetId: string | null
}

export default function AppHome({
  cardGroups,
  excludedDatasetId,
}: AppHomeProps) {
  const datasetPageOptions = useMemo(
    () => notionQueries.availableDatasetPages(excludedDatasetId),
    [excludedDatasetId],
  )
  const datasetPages = useInfiniteQuery({
    ...datasetPageOptions,
    staleTime: 30_000,
  })
  const reauthorization = useMutation(notionMutations.reauthorize())
  const loadMoreSentinel = useRef<HTMLDivElement>(null)
  const canAutomaticallyLoadNextPage =
    datasetPages.hasNextPage &&
    !datasetPages.isFetchingNextPage &&
    !datasetPages.isFetchNextPageError
  const canAutomaticallyLoadNextPageRef = useRef(canAutomaticallyLoadNextPage)
  const connectedDatasetIds = useMemo(
    () => new Set(cardGroups.map((cardGroup) => cardGroup.dataSetId)),
    [cardGroups],
  )
  const datasets = useMemo(() => {
    const visibleIds = new Set<string>()

    return (datasetPages.data?.pages ?? []).flatMap((page) =>
      page.datasets.filter((dataset) => {
        if (connectedDatasetIds.has(dataset.id) || visibleIds.has(dataset.id)) {
          return false
        }

        visibleIds.add(dataset.id)
        return true
      }),
    )
  }, [connectedDatasetIds, datasetPages.data?.pages])

  useEffect(() => {
    canAutomaticallyLoadNextPageRef.current = canAutomaticallyLoadNextPage
  }, [canAutomaticallyLoadNextPage])

  useEffect(() => {
    const sentinel = loadMoreSentinel.current
    if (
      !sentinel ||
      !canAutomaticallyLoadNextPage ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return
    }

    const observer = new IntersectionObserver((entries) => {
      if (
        canAutomaticallyLoadNextPageRef.current &&
        entries.some((entry) => entry.isIntersecting)
      ) {
        void datasetPages.fetchNextPage()
      }
    })

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [canAutomaticallyLoadNextPage, datasetPages.fetchNextPage])

  function authorizeMoreDatasets() {
    reauthorization.mutate(undefined, {
      onSuccess: ({ authorizationUrl }) => {
        assignBrowserLocation(authorizationUrl)
      },
    })
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col gap-3 overflow-hidden px-4 pt-15 pb-3">
      <section className="shrink-0 space-y-2">
        <SectionHeader title="Your decks" />
        <AppHomeCardGroupList cardGroups={cardGroups} />
      </section>

      <SectionHeader
        title="Available datasets"
        description="Create a deck from a Notion dataset."
      />
      <AppHomeDatasetList
        datasets={datasets}
        className="min-h-0 shrink overflow-y-auto overscroll-contain"
      />
      {datasetPages.hasNextPage ? (
        <div className="flex shrink-0 flex-col items-center gap-1">
          <div ref={loadMoreSentinel} aria-hidden="true" />
          <Button
            type="button"
            variant="soft"
            size="xs"
            disabled={datasetPages.isFetchingNextPage}
            onClick={() => void datasetPages.fetchNextPage()}
          >
            {datasetPages.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
          {datasetPages.isFetchNextPageError ? (
            <p role="alert" className="text-center text-xs text-destructive">
              {toPublicError(datasetPages.error).message}{' '}
              <button
                type="button"
                className="underline"
                onClick={() => void datasetPages.fetchNextPage()}
              >
                Retry
              </button>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex shrink-0 flex-col items-center gap-1">
        <Button
          variant="soft"
          size="xs"
          onClick={authorizeMoreDatasets}
          disabled={reauthorization.isPending}
        >
          <Plus /> Authorize more datasets
        </Button>
        {reauthorization.isError ? (
          <p role="alert" className="text-destructive text-center text-xs">
            {toPublicError(reauthorization.error).message}{' '}
            <button
              type="button"
              className="underline"
              onClick={authorizeMoreDatasets}
            >
              Retry
            </button>
          </p>
        ) : null}
      </div>
    </div>
  )
}
