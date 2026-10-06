import '@tanstack/react-start/server-only'

import { isFullPage } from '@notionhq/client'
import type {
  PageObjectResponse,
  QueryDataSourceParameters,
} from '@notionhq/client'
import {
  NOKADDO_REVIEW_PROPERTIES,
  getReviewCheckbox,
} from './review-property-validators'
import { withNotionClient } from './client-server'
import { normalizeNotionPropertyId, toNotionDatasetItem } from './helpers'
import { elapsedMs, publishStudyTiming } from './study-timing'
import type { CompactCard, StudyQuery } from '#/features/study/types'

export async function queryStudyWindow(
  query: StudyQuery,
  startCursor: string | null,
) {
  const serverStartedAt = performance.now()
  const { response, timing } = await withNotionClient(async (notion) => {
    const cards: CompactCard[] = []
    let nextCursor = startCursor
    let notionQueryMs = 0
    let transformMs = 0
    let sourceRows = 0
    let sourcePages = 0

    const notionQueryStartedAt = performance.now()
    const notionResponse = await notion.dataSources.query({
      ...toStudyQueryParameters(query),
      start_cursor: nextCursor,
      page_size: query.pageSize,
      filter_properties: selectedPropertyIds(query),
      result_type: 'page',
    })
    notionQueryMs += elapsedMs(notionQueryStartedAt)
    sourcePages += 1
    sourceRows += notionResponse.results.length

    const transformStartedAt = performance.now()
    for (const result of notionResponse.results) {
      if (isFullPage(result)) {
        cards.push(toCompactStudyCard(result, query))
      }
    }
    transformMs += elapsedMs(transformStartedAt)
    nextCursor = notionResponse.next_cursor

    return {
      response: { cards, nextCursor },
      timing: { notionQueryMs, transformMs, sourceRows, sourcePages },
    }
  })
  const serverTotalMs = elapsedMs(serverStartedAt)

  publishStudyTiming(
    'study-window',
    [
      { name: 'window-total', durationMs: serverTotalMs },
      {
        name: 'window-notion',
        durationMs: timing.notionQueryMs,
        description: `${timing.sourcePages} pages, ${timing.sourceRows} rows`,
      },
      { name: 'window-transform', durationMs: timing.transformMs },
      {
        name: 'window-app-session',
        durationMs: Math.max(
          0,
          serverTotalMs - timing.notionQueryMs - timing.transformMs,
        ),
      },
    ],
    {
      sourcePages: timing.sourcePages,
      sourceRows: timing.sourceRows,
      returnedCards: response.cards.length,
    },
  )

  return response
}

function toStudyQueryParameters(
  query: StudyQuery,
): Pick<QueryDataSourceParameters, 'data_source_id' | 'filter' | 'sorts'> {
  return {
    data_source_id: query.dataSourceId,
    filter: query.filter,
    sorts: query.sorts,
  }
}

function selectedPropertyIds(query: StudyQuery) {
  return uniquePropertyIds([
    ...query.frontPropertyIds,
    ...query.backPropertyIds,
    NOKADDO_REVIEW_PROPERTIES.visited,
    NOKADDO_REVIEW_PROPERTIES.completed,
    ...(query.groupPropertyId ? [query.groupPropertyId] : []),
  ])
}

function uniquePropertyIds(propertyIds: string[]) {
  return [...new Set(propertyIds)]
}

function toCompactStudyCard(
  page: PageObjectResponse,
  query: StudyQuery,
): CompactCard {
  return {
    id: page.id,
    visited: getReviewCheckbox(
      page.properties,
      NOKADDO_REVIEW_PROPERTIES.visited,
    ),
    completed: getReviewCheckbox(
      page.properties,
      NOKADDO_REVIEW_PROPERTIES.completed,
    ),
    front: query.frontPropertyIds.map((propertyId) =>
      getPageValue(page, propertyId),
    ),
    back: query.backPropertyIds.map((propertyId) =>
      getPageValue(page, propertyId),
    ),
    groupKey: query.groupPropertyId
      ? getPageValue(page, query.groupPropertyId)
      : undefined,
  }
}

function getPageValue(page: PageObjectResponse, propertyId: string) {
  const normalizedPropertyId = normalizeNotionPropertyId(propertyId)
  const item = toNotionDatasetItem(page)

  return (
    item.properties.find(
      (property) =>
        property.id === normalizedPropertyId ||
        normalizeNotionPropertyId(property.id) === normalizedPropertyId,
    )?.value ?? ''
  )
}

export async function updateStudyProgress({
  pageId,
  action,
}: {
  pageId: string
  action: 'visit' | 'learn' | 'unlearn'
}) {
  return withNotionClient(async (notion) => {
    const now = new Date().toISOString()
    await notion.pages.update({
      page_id: pageId,
      properties:
        action === 'unlearn'
          ? {
              [NOKADDO_REVIEW_PROPERTIES.completed]: { checkbox: false },
              [NOKADDO_REVIEW_PROPERTIES.completedAt]: { date: null },
            }
          : {
              [NOKADDO_REVIEW_PROPERTIES.visited]: { checkbox: true },
              [NOKADDO_REVIEW_PROPERTIES.lastVisitedAt]: {
                date: { start: now },
              },
              ...(action === 'learn'
                ? {
                    [NOKADDO_REVIEW_PROPERTIES.completed]: { checkbox: true },
                    [NOKADDO_REVIEW_PROPERTIES.completedAt]: {
                      date: { start: now },
                    },
                  }
                : {}),
            },
    })
    return { pageId, completed: action === 'learn' }
  })
}
