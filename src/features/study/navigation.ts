import type { StudyCardPosition } from '#/integrations/indexDB/handlers'
import type { CardWindow } from './types'

export type LocalPosition = StudyCardPosition & {
  key: string
  cursors: [null, ...string[]]
  pageOffsets: [0, ...number[]]
}

export type NavigationDirection = 'next' | 'previous' | 'start'

export async function findStudyDestination({
  position,
  page,
  direction,
  skipLearned,
  fetchPage,
  signal,
}: {
  position: LocalPosition
  page: CardWindow
  direction: NavigationDirection
  skipLearned: boolean
  fetchPage: (cursor: string | null) => Promise<CardWindow>
  signal?: AbortSignal
}): Promise<LocalPosition | null> {
  const cursors: LocalPosition['cursors'] = [...position.cursors]
  const pageOffsets: LocalPosition['pageOffsets'] = [...position.pageOffsets]
  const step = direction === 'previous' ? -1 : 1
  let pageIndex = direction === 'start' ? 0 : position.pageIndex
  let currentPage = direction === 'start' ? await fetchPage(null) : page
  let cardIndex = direction === 'start' ? 0 : position.cardIndex + step

  while (!signal?.aborted) {
    for (
      ;
      cardIndex >= 0 && cardIndex < currentPage.cards.length;
      cardIndex += step
    ) {
      const card = currentPage.cards[cardIndex]
      if (!skipLearned || !card.completed)
        return { ...position, cursors, pageOffsets, pageIndex, cardIndex }
    }
    const cursor =
      step === 1
        ? currentPage.nextCursor
        : pageIndex > 0
          ? cursors.at(pageIndex - 1)
          : undefined
    if (cursor === undefined || (step === 1 && cursor === null)) return null
    const nextOffset = pageOffsets[pageIndex] + currentPage.cards.length
    pageIndex += step
    if (step === 1 && cursor !== null) {
      if (
        cursors[pageIndex] !== cursor ||
        pageOffsets[pageIndex] !== nextOffset
      ) {
        cursors.splice(pageIndex, cursors.length, cursor)
        pageOffsets.splice(pageIndex, pageOffsets.length, nextOffset)
      }
    }
    currentPage = await fetchPage(cursor)
    cardIndex = step === 1 ? 0 : currentPage.cards.length - 1
  }
  return null
}
