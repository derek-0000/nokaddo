import { findStudyDestination } from '#/features/study/navigation'
import type { LocalPosition } from '#/features/study/navigation'
import type { CardWindow } from '#/features/study/types'
import { describe, expect, it } from 'vitest'
import { createStudyQuery } from '#/features/study/query'
import {
  calculateCardStudyStats,
  groupKeysUpdateForConfiguration,
  reconcileGroupKeys,
} from './card-study'

const studyConfiguration = {
  dataSetId: 'source-id',
  groupingColumnId: 'category-id',
  frontColumnIds: ['front-id'],
  backColumnIds: ['back-id'],
}

describe('study query categories', () => {
  it.each([
    ['title', { property: 'category-id', title: { equals: 'Biology' } }],
    [
      'rich_text',
      { property: 'category-id', rich_text: { equals: 'Biology' } },
    ],
    ['select', { property: 'category-id', select: { equals: 'Biology' } }],
    ['status', { property: 'category-id', status: { equals: 'Biology' } }],
    [
      'formula',
      {
        property: 'category-id',
        formula: { string: { equals: 'Biology' } },
      },
    ],
  ] as const)(
    'filters a grouped %s property by the selected category',
    (type, filter) => {
      expect(
        createStudyQuery(studyConfiguration, {
          value: 'Biology',
          propertyType: type,
        }),
      ).toMatchObject({
        dataSourceId: 'source-id',
        groupPropertyId: 'category-id',
        filter,
      })
    },
  )

  it('leaves an ungrouped deck unfiltered', () => {
    expect(
      createStudyQuery({
        ...studyConfiguration,
        groupingColumnId: null,
      }),
    ).toEqual({
      dataSourceId: 'source-id',
      filter: undefined,
      sorts: [],
      pageSize: 20,
      frontPropertyIds: ['front-id'],
      backPropertyIds: ['back-id'],
      groupPropertyId: undefined,
    })
  })

  it('rejects a category without a grouping property', () => {
    expect(() =>
      createStudyQuery(
        { ...studyConfiguration, groupingColumnId: null },
        { value: 'Biology', propertyType: 'select' },
      ),
    ).toThrow(/requires a grouping property/i)
  })
})

describe('card study statistics', () => {
  it('returns finite zero statistics when the scan contains no full rows', () => {
    expect(calculateCardStudyStats([])).toEqual({
      overall: { total: 0, visited: 0, completed: 0 },
      byCategory: {},
    })
  })

  it('counts each row once and normalizes completed cards as visited', () => {
    const statistics = calculateCardStudyStats([
      { visited: false, completed: false, groupValues: [] },
      { visited: true, completed: false, groupValues: [] },
      { visited: false, completed: true, groupValues: [] },
      { visited: true, completed: true, groupValues: [] },
    ])

    expect(statistics.overall).toEqual({
      total: 4,
      visited: 3,
      completed: 2,
    })
    expect(statistics.overall.completed).toBeLessThanOrEqual(
      statistics.overall.visited,
    )
    expect(statistics.overall.visited).toBeLessThanOrEqual(
      statistics.overall.total,
    )
  })

  it('counts a row once in each distinct non-empty group and always counts it overall', () => {
    const statistics = calculateCardStudyStats([
      {
        visited: false,
        completed: true,
        groupValues: ['Biology', 'Biology', 'Chemistry', ''],
      },
      { visited: true, completed: false, groupValues: [] },
    ])

    expect(statistics).toEqual({
      overall: { total: 2, visited: 2, completed: 1 },
      byCategory: {
        Biology: { total: 1, visited: 1, completed: 1 },
        Chemistry: { total: 1, visited: 1, completed: 1 },
      },
    })
  })
})

describe('group-key reconciliation', () => {
  it('returns a deterministic live set without syncing equal reordered sets', () => {
    expect(
      reconcileGroupKeys(
        ['Chemistry', 'Biology'],
        ['Biology', 'Chemistry', 'Biology'],
      ),
    ).toEqual({
      groupKeys: ['Biology', 'Chemistry'],
      shouldSync: false,
    })
  })

  it.each([
    [['Biology'], ['Chemistry', 'Biology']],
    [['Biology', 'Chemistry'], ['Biology']],
    [[], ['Biology']],
    [['Biology'], []],
  ])(
    'requests synchronization when the live set adds or removes values',
    (stored, scanned) => {
      expect(reconcileGroupKeys(stored, scanned)).toEqual({
        groupKeys: [...new Set(scanned)].sort(),
        shouldSync: true,
      })
    },
  )
})

describe('group-key updates for configuration edits', () => {
  it('clears keys when grouping is removed', () => {
    expect(
      groupKeysUpdateForConfiguration({
        storedGroupingColumnId: 'category-id',
        groupingColumnId: null,
        groupingColumnName: null,
      }),
    ).toBe('clear')
  })

  it('clears keys when the grouping column has no name', () => {
    expect(
      groupKeysUpdateForConfiguration({
        storedGroupingColumnId: 'category-id',
        groupingColumnId: 'category-id',
        groupingColumnName: null,
      }),
    ).toBe('clear')
  })

  it('reuses stored keys when the grouping column is unchanged', () => {
    expect(
      groupKeysUpdateForConfiguration({
        storedGroupingColumnId: 'category%2Did',
        groupingColumnId: 'category-id',
        groupingColumnName: 'Category',
      }),
    ).toBe('reuse')
  })

  it('rebuilds keys when the grouping column changes', () => {
    expect(
      groupKeysUpdateForConfiguration({
        storedGroupingColumnId: 'category-id',
        groupingColumnId: 'new-id',
        groupingColumnName: 'New',
      }),
    ).toBe('rebuild')
  })
})

describe('study navigation destinations', () => {
  const position: LocalPosition = {
    version: 1,
    key: 'session',
    query: createStudyQuery(studyConfiguration),
    queryFingerprint: 'query',
    pageIndex: 0,
    cardIndex: 0,
    cursors: [null],
    pageOffsets: [0],
  }
  const page = (
    completed: boolean[],
    nextCursor: string | null = null,
  ): CardWindow => ({
    cards: completed.map((value, index) => ({
      id: String(index),
      visited: false,
      completed: value,
      front: [],
      back: [],
    })),
    nextCursor,
  })

  it('searches the current page without fetching or moving the current position', async () => {
    const target = await findStudyDestination({
      position,
      page: page([false, true, false], 'later'),
      direction: 'next',
      skipLearned: true,
      fetchPage: () => {
        throw new Error('Unexpected fetch')
      },
    })
    expect(target).toMatchObject({ pageIndex: 0, cardIndex: 2 })
    expect(position.cardIndex).toBe(0)
  })

  it('crosses learned and empty pages and retains every cursor for previous navigation', async () => {
    const requested: Array<string | null> = []
    const target = await findStudyDestination({
      position,
      page: page([false], 'second'),
      direction: 'next',
      skipLearned: true,
      fetchPage: async (cursor) => {
        requested.push(cursor)
        if (cursor === 'second') return page([true, true], 'third')
        if (cursor === 'third') return page([], 'fourth')
        return page([true, false])
      },
    })
    expect(requested).toEqual(['second', 'third', 'fourth'])
    expect(target).toMatchObject({
      pageIndex: 3,
      cardIndex: 1,
      cursors: [null, 'second', 'third', 'fourth'],
      pageOffsets: [0, 1, 3, 3],
    })
    expect(position.cursors).toEqual([null])
  })

  it('reports exhaustion when all remaining cards are learned', async () => {
    expect(
      await findStudyDestination({
        position,
        page: page([false, true], 'last'),
        direction: 'next',
        skipLearned: true,
        fetchPage: async () => page([true]),
      }),
    ).toBeNull()
  })

  it('keeps normal navigation when skipping is disabled', async () => {
    expect(
      await findStudyDestination({
        position,
        page: page([false, true, false]),
        direction: 'next',
        skipLearned: false,
        fetchPage: () => {
          throw new Error('Unexpected fetch')
        },
      }),
    ).toMatchObject({ cardIndex: 1 })
  })

  it.each<'previous' | 'start'>(['previous', 'start'])(
    'finds an unlearned card for %s across pages',
    async (direction) => {
      expect(
        await findStudyDestination({
          position: {
            ...position,
            pageIndex: 2,
            cursors: [null, 'second', 'third'],
            pageOffsets: [0, 2, 3],
          },
          page: page([false]),
          direction,
          skipLearned: true,
          fetchPage: async (cursor) =>
            cursor === null
              ? page([true, false], 'second')
              : page([true], 'third'),
        }),
      ).toMatchObject({ pageIndex: 0, cardIndex: 1 })
    },
  )

  it('stops fetching more pages when preparation is cancelled', async () => {
    const controller = new AbortController()
    const requested: Array<string | null> = []
    expect(
      await findStudyDestination({
        position,
        page: page([false], 'second'),
        direction: 'next',
        skipLearned: true,
        signal: controller.signal,
        fetchPage: async (cursor) => {
          requested.push(cursor)
          controller.abort()
          return page([true], 'third')
        },
      }),
    ).toBeNull()
    expect(requested).toEqual(['second'])
  })
})
