import { sameGroupingColumnId } from './helpers'

export type CardStudyStats = {
  total: number
  visited: number
  completed: number
}

export type CardStudyRow = {
  visited: boolean
  completed: boolean
  groupValues: readonly string[]
}

export function calculateCardStudyStats(rows: readonly CardStudyRow[]) {
  const overall = emptyCardStudyStats()
  const byCategory = new Map<string, CardStudyStats>()

  for (const row of rows) {
    incrementCardStudyStats(overall, row)

    for (const value of new Set(row.groupValues.filter(Boolean))) {
      const stats = byCategory.get(value) ?? emptyCardStudyStats()
      incrementCardStudyStats(stats, row)
      byCategory.set(value, stats)
    }
  }

  return {
    overall,
    byCategory: Object.fromEntries(byCategory),
  }
}

export function reconcileGroupKeys(
  storedGroupKeys: readonly string[],
  scannedGroupKeys: readonly string[],
) {
  const groupKeys = canonicalizeGroupKeys(scannedGroupKeys)

  return {
    groupKeys,
    shouldSync: !haveSameValues(storedGroupKeys, groupKeys),
  }
}

export function canonicalizeGroupKeys(groupKeys: readonly string[]) {
  return [...new Set(groupKeys.filter(Boolean))].sort(compareStrings)
}

export function groupKeysUpdateForConfiguration({
  storedGroupingColumnId,
  groupingColumnId,
  groupingColumnName,
}: {
  storedGroupingColumnId: string | null
  groupingColumnId: string | null
  groupingColumnName: string | null
}) {
  if (groupingColumnId === null || groupingColumnName === null) return 'clear'
  if (sameGroupingColumnId(storedGroupingColumnId, groupingColumnId)) {
    return 'reuse'
  }
  return 'rebuild'
}

function emptyCardStudyStats(): CardStudyStats {
  return { total: 0, visited: 0, completed: 0 }
}

function incrementCardStudyStats(
  stats: CardStudyStats,
  review: Pick<CardStudyRow, 'visited' | 'completed'>,
) {
  stats.total += 1
  if (review.visited || review.completed) stats.visited += 1
  if (review.completed) stats.completed += 1
}

function haveSameValues(left: readonly string[], right: readonly string[]) {
  const leftSet = new Set(left)
  const rightSet = new Set(right)

  return (
    leftSet.size === rightSet.size &&
    [...leftSet].every((value) => rightSet.has(value))
  )
}

function compareStrings(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}
