import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getStudyCardPosition,
  setStudyCardPosition,
} from '#/integrations/indexDB/handlers'
import type { StudyCardPosition } from '#/integrations/indexDB/handlers'
import { notionKeys, notionQueries } from '#/integrations/notion/api'
import { saveStudyProgress } from '#/integrations/notion/study-functions'
import type { StudyProgressInput } from '#/integrations/notion/study-functions'
import type { CardStudyStats } from '#/integrations/notion/card-study'
import { notionStudySource } from '#/integrations/notion/study-source'
import { createQueryFingerprint } from '#/features/study/query'
import { findStudyDestination } from '#/features/study/navigation'
import type {
  LocalPosition,
  NavigationDirection,
} from '#/features/study/navigation'
import { NOTION_PREFETCH_INDEX } from '#/features/study/types'
import type { CardWindow, StudyQuery } from '#/features/study/types'

export function useStudy({
  deckId,
  query,
  stats,
}: {
  deckId: string
  query: StudyQuery
  stats: CardStudyStats
}) {
  const session = useStudySession({ deckId, query })
  const positionWriteError = usePersistStudyPosition({
    deckId,
    queryFingerprint: session.queryFingerprint,
    workspaceId: session.workspaceId,
    position: session.position,
  })
  const progress = useStudyProgress({
    deckId,
    workspaceId: session.workspaceId,
    currentCard: session.currentCard,
    positionKey: session.positionKey,
    stats,
  })
  const navigation = useStudyNavigation({
    skipLearned: progress.skipLearned,
    page: session.isRestoring ? undefined : session.page,
    position: session.position,
    positionKey: session.positionKey,
    setLocalPosition: session.setLocalPosition,
    windowOptions: session.windowOptions,
  })
  const loadError =
    session.viewer.error ??
    session.positionQuery.error ??
    session.windowQuery.error

  return {
    currentCard: session.currentCard,
    currentCardNumber:
      session.currentCard && session.position
        ? session.position.pageOffsets[session.position.pageIndex] +
          session.position.cardIndex +
          1
        : undefined,
    skipLearned: progress.skipLearned,
    allLearned: progress.allLearned,
    setSkipLearned: progress.setSkipLearned,
    isPreparingNext: navigation.isPreparingNext,
    hasNextCard: navigation.hasNextCard,
    hasPreviousCard: navigation.hasPreviousCard,
    isPreparingPrevious: navigation.isPreparingPrevious,
    isEmpty:
      session.windowQuery.isSuccess &&
      !session.isRestoring &&
      session.page?.cards.length === 0,
    isLoading:
      !loadError &&
      (session.viewer.isPending ||
        session.positionQuery.isPending ||
        !session.position ||
        session.windowQuery.isPending ||
        session.isRestoring),
    isNavigating: navigation.isNavigating,
    loadError,
    navigationError: navigation.navigationError ?? positionWriteError,
    progressError: progress.progressError,
    isSavingProgress: progress.isSavingProgress,
    isLearning: progress.isLearning,
    toggleLearned: progress.toggleLearned,
    retryProgress: progress.retryProgress,
    progressDelta: progress.progressDelta,
    nextCard: () => navigation.navigate('next'),
    previousCard: () => navigation.navigate('previous'),
    restart: () => navigation.navigate('start'),
    retry: () => retryStudySession(session),
  }
}

function useStudySession({
  deckId,
  query,
}: {
  deckId: string
  query: StudyQuery
}) {
  const queryClient = useQueryClient()
  const queryFingerprint = useMemo(() => createQueryFingerprint(query), [query])
  const viewer = useQuery(notionQueries.viewer())
  const workspaceId = viewer.data?.workspaceId
  const positionKey = `${workspaceId ?? ''}:${deckId}:${queryFingerprint}`
  const windowOptions = useCallback(
    (cursor: string | null) =>
      createStudyWindowOptions({
        workspaceId,
        deckId,
        queryFingerprint,
        query,
        cursor,
      }),
    [workspaceId, deckId, queryFingerprint, query],
  )
  const positionQuery = useQuery({
    queryKey: ['study-card-position', workspaceId, deckId, queryFingerprint],
    queryFn: async () => {
      const saved = workspaceId
        ? await getStudyCardPosition(workspaceId, deckId, queryFingerprint)
        : undefined
      return restoreStudyPosition({
        saved: restorablePosition(saved, queryFingerprint),
        query,
        queryFingerprint,
        positionKey,
        fetchPage: (cursor) => queryClient.fetchQuery(windowOptions(cursor)),
      })
    },
    enabled: Boolean(workspaceId),
    retry: false,
  })
  const [localPosition, setLocalPosition] = useState<LocalPosition | null>(null)
  const rawPosition =
    localPosition?.key === positionKey
      ? localPosition
      : (positionQuery.data ?? null)
  const loadedPageIndex = rawPosition?.pageIndex ?? 0
  const cursor = rawPosition?.cursors[loadedPageIndex] ?? null
  const windowQuery = useQuery({
    ...windowOptions(cursor),
    enabled: Boolean(rawPosition),
  })
  const page = windowQuery.data
  const position = useMemo(
    () => reconcilePosition(rawPosition, page, loadedPageIndex),
    [rawPosition, page, loadedPageIndex],
  )
  const isRestoring = Boolean(position && loadedPageIndex < position.pageIndex)
  const currentCard =
    !isRestoring && position ? page?.cards.at(position.cardIndex) : undefined

  useEffect(() => {
    if (!position || !page || isRestoring) return
    if (
      page.nextCursor &&
      (position.cardIndex >= NOTION_PREFETCH_INDEX ||
        position.cardIndex === page.cards.length - 1)
    ) {
      void queryClient.prefetchQuery(windowOptions(page.nextCursor))
    }
    if (position.pageIndex > 0 && position.cardIndex <= 2) {
      const previousCursor = position.cursors.at(position.pageIndex - 1)
      if (previousCursor !== undefined)
        void queryClient.prefetchQuery(windowOptions(previousCursor))
    }
  }, [position, page, isRestoring, queryClient, windowOptions])

  return {
    viewer,
    workspaceId,
    queryFingerprint,
    positionKey,
    positionQuery,
    position,
    setLocalPosition,
    windowOptions,
    windowQuery,
    page,
    isRestoring,
    currentCard,
  }
}

function usePersistStudyPosition({
  deckId,
  queryFingerprint,
  workspaceId,
  position,
}: {
  deckId: string
  queryFingerprint: string
  workspaceId: string | undefined
  position: LocalPosition | null
}) {
  const queryClient = useQueryClient()
  const persistenceQueue = useRef<Promise<void>>(undefined)
  const [positionWriteError, setPositionWriteError] = useState<unknown>()
  useEffect(() => {
    if (!position || !workspaceId) return
    const { key: _, ...saved } = position
    persistenceQueue.current = (persistenceQueue.current ?? Promise.resolve())
      .then(async () => {
        try {
          await setStudyCardPosition(
            workspaceId,
            deckId,
            queryFingerprint,
            saved,
          )
        } catch {
          await setStudyCardPosition(
            workspaceId,
            deckId,
            queryFingerprint,
            saved,
          )
        }
        queryClient.setQueryData(
          ['study-card-position', workspaceId, deckId, queryFingerprint],
          position,
        )
        setPositionWriteError(undefined)
      })
      .catch(setPositionWriteError)
  }, [position, workspaceId, deckId, queryFingerprint, queryClient])
  return positionWriteError
}

type WindowOptions = ReturnType<typeof createStudyWindowOptions>

function useStudyNavigation({
  page,
  position,
  positionKey,
  setLocalPosition,
  windowOptions,
  skipLearned,
}: {
  page: CardWindow | undefined
  position: LocalPosition | null
  positionKey: string
  setLocalPosition: Dispatch<SetStateAction<LocalPosition | null>>
  windowOptions: (cursor: string | null) => WindowOptions
  skipLearned: boolean
}) {
  const queryClient = useQueryClient()
  const [navigationError, setNavigationError] = useState<unknown>()
  const [isNavigating, setIsNavigating] = useState(false)
  const navigationPending = useRef(false)
  const nextDestination = useStudyDestination({
    direction: 'next',
    positionKey,
    position,
    page,
    windowOptions,
    enabled: skipLearned,
  })
  const previousDestination = useStudyDestination({
    direction: 'previous',
    positionKey,
    position,
    page,
    windowOptions,
    enabled: skipLearned && hasPreviousCard(position),
  })

  async function navigate(direction: NavigationDirection) {
    if (!position || !page || navigationPending.current) return
    const destinations = {
      next: nextDestination,
      previous: previousDestination,
      start: null,
    }
    const prepared = skipLearned ? destinations[direction] : null
    if (isDestinationPreparing(prepared)) return
    navigationPending.current = true
    setIsNavigating(true)
    setNavigationError(undefined)
    try {
      const target = await getStudyNavigationTarget({
        prepared,
        position,
        page,
        direction,
        skipLearned,
        fetchPage: (cursor) => queryClient.fetchQuery(windowOptions(cursor)),
      })
      if (target) {
        setLocalPosition((current) =>
          !current || current.key === positionKey ? target : current,
        )
      }
    } catch (error) {
      setNavigationError(error)
    } finally {
      navigationPending.current = false
      setIsNavigating(false)
    }
  }

  const { destinationError, ...availability } = studyNavigationAvailability({
    skipLearned,
    position,
    page,
    nextDestination,
    previousDestination,
  })
  return {
    ...availability,
    navigationError: navigationError ?? destinationError,
    isNavigating,
    navigate,
  }
}

type StudyDestination = ReturnType<typeof useStudyDestination>

function isDestinationPreparing(destination: StudyDestination | null) {
  return Boolean(
    destination && (destination.isPending || destination.isFetching),
  )
}

async function getStudyNavigationTarget({
  prepared,
  position,
  page,
  direction,
  skipLearned,
  fetchPage,
}: {
  prepared: StudyDestination | null
  position: LocalPosition
  page: CardWindow
  direction: NavigationDirection
  skipLearned: boolean
  fetchPage: (cursor: string | null) => Promise<CardWindow>
}) {
  if (!prepared)
    return findStudyDestination({
      position,
      page,
      direction,
      skipLearned,
      fetchPage,
    })
  if (prepared.isError)
    return (await prepared.refetch({ throwOnError: true })).data
  return prepared.data
}

function studyNavigationAvailability({
  skipLearned,
  position,
  page,
  nextDestination,
  previousDestination,
}: {
  skipLearned: boolean
  position: LocalPosition | null
  page: CardWindow | undefined
  nextDestination: StudyDestination
  previousDestination: StudyDestination
}) {
  if (!skipLearned)
    return {
      hasNextCard: hasNextCard(position, page),
      hasPreviousCard: hasPreviousCard(position),
      isPreparingNext: false,
      isPreparingPrevious: false,
      destinationError: null,
    }
  return {
    hasNextCard: !nextDestination.isSuccess || nextDestination.data !== null,
    hasPreviousCard:
      hasPreviousCard(position) &&
      (previousDestination.isError ||
        (previousDestination.isSuccess && previousDestination.data !== null)),
    isPreparingNext: isDestinationPreparing(nextDestination),
    isPreparingPrevious:
      hasPreviousCard(position) && isDestinationPreparing(previousDestination),
    destinationError: nextDestination.error ?? previousDestination.error,
  }
}

function useStudyDestination({
  direction,
  positionKey,
  position,
  page,
  windowOptions,
  enabled,
}: {
  direction: 'next' | 'previous'
  positionKey: string
  position: LocalPosition | null
  page: CardWindow | undefined
  windowOptions: (cursor: string | null) => WindowOptions
  enabled: boolean
}) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['study-destination', direction, positionKey, position, page],
    queryFn: ({ signal }) =>
      position && page
        ? findStudyDestination({
            position,
            page,
            direction,
            skipLearned: true,
            fetchPage: (cursor) =>
              queryClient.fetchQuery(windowOptions(cursor)),
            signal,
          })
        : null,
    enabled: enabled && Boolean(position && page),
    retry: false,
    staleTime: 0,
  })
}

function useStudyProgress({
  deckId,
  workspaceId,
  currentCard,
  positionKey,
  stats,
}: {
  deckId: string
  workspaceId: string | undefined
  currentCard:
    | Awaited<ReturnType<typeof notionStudySource.fetchWindow>>['cards'][number]
    | undefined
  positionKey: string
  stats: CardStudyStats
}) {
  const queryClient = useQueryClient()
  const [failedProgress, setFailedProgress] = useState<
    Array<{ data: StudyProgressInput; error: unknown }>
  >([])
  const [progressDelta, setProgressDelta] = useState({
    positionKey,
    visited: 0,
    completed: 0,
    skipLearned: false,
  })
  const progress = useMutation({
    mutationFn: (data: StudyProgressInput) => saveStudyProgress({ data }),
    // Serialize visit and completion writes, including fast card navigation.
    scope: { id: `study-progress:${workspaceId}` },
    onError: (error, data) => {
      setFailedProgress((failed) => [
        ...failed.filter(
          (item) =>
            item.data.pageId !== data.pageId ||
            item.data.action !== data.action,
        ),
        { data, error },
      ])
    },
    onSuccess: (result, data) => {
      setFailedProgress((failed) =>
        failed.filter(
          (item) =>
            item.data.pageId !== data.pageId ||
            (item.data.action !== data.action &&
              data.action !== 'learn' &&
              !(data.action === 'unlearn' && item.data.action === 'learn')),
        ),
      )

      const cardBeforeSave = findCachedStudyCard(
        queryClient.getQueriesData<CardWindow>({
          queryKey: ['study-card-window', workspaceId, deckId],
        }),
        result.pageId,
      )
      const completedAfterSave =
        data.action === 'visit' ? cardBeforeSave?.completed : result.completed
      const visitedAfterSave =
        Boolean(cardBeforeSave?.visited) || data.action !== 'unlearn'
      const visitedDelta = cardBeforeSave
        ? Number(visitedAfterSave || completedAfterSave) -
          Number(cardBeforeSave.visited || cardBeforeSave.completed)
        : 0
      const completedDelta =
        cardBeforeSave && data.action !== 'visit'
          ? Number(result.completed) - Number(cardBeforeSave.completed)
          : 0

      if (visitedDelta || completedDelta) {
        setProgressDelta((current) => {
          const delta =
            current.positionKey === positionKey
              ? current
              : { positionKey, visited: 0, completed: 0, skipLearned: false }
          return {
            ...delta,
            visited: delta.visited + visitedDelta,
            completed: delta.completed + completedDelta,
            skipLearned:
              stats.completed + delta.completed + completedDelta >= stats.total
                ? false
                : delta.skipLearned,
          }
        })
      }
      queryClient.setQueriesData<CardWindow>(
        { queryKey: ['study-card-window', workspaceId, deckId] },
        (window) =>
          window && {
            ...window,
            cards: window.cards.map((card) =>
              card.id === result.pageId
                ? {
                    ...card,
                    visited: card.visited || data.action !== 'unlearn',
                    completed:
                      data.action === 'visit'
                        ? card.completed
                        : result.completed,
                  }
                : card,
            ),
          },
      )
      void queryClient.invalidateQueries({
        queryKey: notionKeys.cardGroupStudyData(deckId),
      })
    },
  })
  const allLearned =
    stats.total > 0 &&
    stats.completed +
      (progressDelta.positionKey === positionKey
        ? progressDelta.completed
        : 0) >=
      stats.total
  const currentCardId = currentCard?.id
  const shouldRecordVisit = !allLearned && !currentCard?.completed
  const lastVisit = useRef<{ cardId: string; positionKey: string } | null>(null)
  useEffect(() => {
    if (!currentCardId) return
    if (
      lastVisit.current?.cardId === currentCardId &&
      lastVisit.current.positionKey === positionKey
    )
      return
    lastVisit.current = { cardId: currentCardId, positionKey }
    if (shouldRecordVisit)
      progress.mutate({ pageId: currentCardId, action: 'visit' })
  }, [currentCardId, positionKey, progress.mutate, shouldRecordVisit])
  return {
    allLearned,
    skipLearned:
      progressDelta.positionKey === positionKey &&
      progressDelta.skipLearned &&
      !allLearned,
    setSkipLearned: (enabled: boolean) =>
      setProgressDelta((current) => ({
        ...(current.positionKey === positionKey
          ? current
          : { positionKey, visited: 0, completed: 0 }),
        skipLearned: enabled && !allLearned,
      })),
    progressError: failedProgress.at(0)?.error,
    isSavingProgress: progress.isPending,
    isLearning: progress.isPending && progress.variables.action !== 'visit',
    toggleLearned: () => {
      if (currentCard)
        progress.mutate({
          pageId: currentCard.id,
          action: currentCard.completed ? 'unlearn' : 'learn',
        })
    },
    retryProgress: () => {
      const failed = failedProgress.at(0)
      if (failed) progress.mutate(failed.data)
    },
    progressDelta:
      progressDelta.positionKey === positionKey
        ? progressDelta
        : { positionKey, visited: 0, completed: 0 },
  }
}

function findCachedStudyCard(
  windows: Array<[readonly unknown[], CardWindow | undefined]>,
  pageId: string,
) {
  for (const [, window] of windows) {
    const card = window?.cards.find((candidate) => candidate.id === pageId)
    if (card) return card
  }
  return undefined
}

function hasNextCard(
  position: LocalPosition | null,
  page: Awaited<ReturnType<typeof notionStudySource.fetchWindow>> | undefined,
) {
  return Boolean(
    position &&
    page &&
    (position.cardIndex < page.cards.length - 1 || page.nextCursor),
  )
}

function createStudyWindowOptions({
  workspaceId,
  deckId,
  queryFingerprint,
  query,
  cursor,
}: {
  workspaceId: string | undefined
  deckId: string
  queryFingerprint: string
  query: StudyQuery
  cursor: string | null
}) {
  return queryOptions({
    queryKey: [
      'study-card-window',
      workspaceId,
      deckId,
      queryFingerprint,
      cursor,
    ],
    queryFn: (): Promise<CardWindow> =>
      notionStudySource.fetchWindow(query, cursor),
    // Keep the session's card order while progress writes change Notion rows.
    staleTime: Infinity,
    retry: false,
  })
}

function hasPreviousCard(position: LocalPosition | null) {
  return Boolean(position && (position.cardIndex > 0 || position.pageIndex > 0))
}

function retryStudySession(session: ReturnType<typeof useStudySession>) {
  if (session.viewer.isError) return session.viewer.refetch()
  if (session.positionQuery.isError) return session.positionQuery.refetch()
  return session.windowQuery.refetch()
}

function restorablePosition(
  position: StudyCardPosition | null | undefined,
  fingerprint: string,
) {
  if (
    position?.version !== 1 ||
    position.queryFingerprint !== fingerprint ||
    createQueryFingerprint(position.query) !== fingerprint ||
    !Number.isInteger(position.pageIndex) ||
    position.pageIndex < 0 ||
    !Number.isInteger(position.cardIndex) ||
    position.cardIndex < 0
  )
    return undefined
  if (position.cursors !== undefined && !isCursorHistory(position.cursors))
    return undefined
  if (
    position.pageOffsets !== undefined &&
    (!isPageOffsetHistory(position.pageOffsets) ||
      position.pageOffsets.length > (position.cursors?.length ?? 1))
  )
    return undefined
  return position
}

async function restoreStudyPosition({
  saved,
  query,
  queryFingerprint,
  positionKey,
  fetchPage,
}: {
  saved: StudyCardPosition | undefined
  query: StudyQuery
  queryFingerprint: string
  positionKey: string
  fetchPage: (cursor: string | null) => Promise<CardWindow>
}): Promise<LocalPosition> {
  let position: LocalPosition = {
    version: 1,
    key: positionKey,
    query: saved?.query ?? query,
    queryFingerprint,
    pageIndex: saved?.pageIndex ?? 0,
    cardIndex: saved?.cardIndex ?? 0,
    cursors: saved?.cursors ?? [null],
    pageOffsets: saved?.pageOffsets ?? [0],
  }
  // Older positions need both cursor history and actual page lengths recovered.
  while (
    position.pageIndex >= position.cursors.length ||
    position.pageIndex >= position.pageOffsets.length
  ) {
    const loadedPageIndex =
      Math.min(position.cursors.length, position.pageOffsets.length) - 1
    const page = await fetchPage(position.cursors[loadedPageIndex])
    position = reconcilePosition(position, page, loadedPageIndex)
  }
  return position
}

function reconcilePosition(
  position: LocalPosition,
  page: CardWindow,
  loadedPageIndex: number,
): LocalPosition
function reconcilePosition(
  position: LocalPosition | null,
  page: CardWindow | undefined,
  loadedPageIndex: number,
): LocalPosition | null
function reconcilePosition(
  position: LocalPosition | null,
  page: Awaited<ReturnType<typeof notionStudySource.fetchWindow>> | undefined,
  loadedPageIndex: number,
) {
  if (!position || !page) return position
  const cursors: [null, ...string[]] = [...position.cursors]
  const pageOffsets: [0, ...number[]] = [...position.pageOffsets]
  const nextIndex = loadedPageIndex + 1
  if (page.nextCursor) {
    if (cursors[nextIndex] !== page.nextCursor) {
      cursors.splice(nextIndex, cursors.length, page.nextCursor)
      pageOffsets.splice(nextIndex)
    }
    const nextOffset = pageOffsets[loadedPageIndex] + page.cards.length
    if (pageOffsets[nextIndex] !== nextOffset)
      pageOffsets.splice(nextIndex, pageOffsets.length, nextOffset)
  } else {
    cursors.splice(nextIndex)
    pageOffsets.splice(nextIndex)
  }
  const pageIndex = page.nextCursor
    ? position.pageIndex
    : Math.min(position.pageIndex, loadedPageIndex)
  const cardIndex =
    pageIndex === loadedPageIndex
      ? Math.min(position.cardIndex, Math.max(0, page.cards.length - 1))
      : position.cardIndex
  const cursorHistoryMatches =
    cursors.length === position.cursors.length &&
    cursors.every((value, index) => value === position.cursors[index])
  const offsetHistoryMatches =
    pageOffsets.length === position.pageOffsets.length &&
    pageOffsets.every((value, index) => value === position.pageOffsets[index])
  return pageIndex === position.pageIndex &&
    cardIndex === position.cardIndex &&
    cursorHistoryMatches &&
    offsetHistoryMatches
    ? position
    : { ...position, cursors, pageOffsets, pageIndex, cardIndex }
}

function isCursorHistory(value: unknown): value is [null, ...string[]] {
  return (
    Array.isArray(value) &&
    value[0] === null &&
    value
      .slice(1)
      .every((cursor) => typeof cursor === 'string' && cursor.length > 0)
  )
}

function isPageOffsetHistory(value: unknown): value is [0, ...number[]] {
  return (
    Array.isArray(value) &&
    value[0] === 0 &&
    value.every(
      (offset, index) =>
        typeof offset === 'number' &&
        Number.isSafeInteger(offset) &&
        offset >= 0 &&
        (index === 0 || offset >= value[index - 1]),
    )
  )
}
