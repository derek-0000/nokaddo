import type { CompactCard, StudyQuery } from './types'

export type StudyActivity = 'select' | 'write'

export const STUDY_ACTIVITIES = ['select', 'write'] as const

export const ACTIVITY_COLUMN_LIMITS: Record<StudyActivity, number> = {
  select: 4,
  write: 1,
}

export const SELECT_OPTION_COUNT = 4

/** The steps a card walks through with the Next button, in order. */
export type StudyStep = 'front' | 'back' | StudyActivity

export function getStudySteps(card: CompactCard): StudyStep[] {
  return [
    'front',
    'back',
    // Activities cannot be skipped, so only offer the ones a card can answer.
    ...STUDY_ACTIVITIES.filter((activity) =>
      activity === 'select'
        ? card.select?.values.some((value) => value.trim())
        : card.write?.value.trim(),
    ),
  ]
}

/**
 * Card fields shown during an activity: the back, or the front when the back
 * has nothing to show. The columns the activity asks for are left out so the
 * card never gives the answer away, and the content stays the same while the
 * activity is answered.
 */
export function getActivityPrompt(
  card: CompactCard,
  query: Pick<
    StudyQuery,
    | 'frontPropertyIds'
    | 'backPropertyIds'
    | 'selectPropertyIds'
    | 'writePropertyId'
  >,
  activity: StudyActivity,
) {
  const answerPropertyIds = new Set(
    activity === 'select'
      ? (query.selectPropertyIds ?? [])
      : query.writePropertyId
        ? [query.writePropertyId]
        : [],
  )
  const visibleValues = (values: string[], propertyIds: string[]) =>
    values.filter(
      (value, index) =>
        value.trim() && !answerPropertyIds.has(propertyIds[index] ?? ''),
    )
  const back = visibleValues(card.back, query.backPropertyIds)

  return back.length > 0
    ? back
    : visibleValues(card.front, query.frontPropertyIds)
}

export type SelectOption = {
  cardId: string
  values: string[]
  correct: boolean
}

/**
 * Builds the options for the select activity from the current card and other
 * cards already loaded in the study window. Distractors with the same content
 * as the correct option are skipped so every option is distinguishable.
 */
export function createSelectOptions(
  card: CompactCard,
  pool: readonly CompactCard[],
  count = SELECT_OPTION_COUNT,
): SelectOption[] {
  if (!card.select) return []

  const correct = {
    cardId: card.id,
    values: card.select.values,
    correct: true,
  }
  const seen = new Set([optionKey(correct.values)])
  const distractors: SelectOption[] = []

  for (const candidate of seededShuffle(pool, card.id)) {
    if (distractors.length >= count - 1) break
    if (candidate.id === card.id || !candidate.select) continue

    const key = optionKey(candidate.select.values)
    if (!key || seen.has(key)) continue

    seen.add(key)
    distractors.push({
      cardId: candidate.id,
      values: candidate.select.values,
      correct: false,
    })
  }

  return seededShuffle([correct, ...distractors], `${card.id}:options`)
}

export function normalizeAnswer(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function isCorrectAnswer(attempt: string, expected: string) {
  const normalizedExpected = normalizeAnswer(expected)

  return (
    normalizedExpected.length > 0 &&
    normalizeAnswer(attempt) === normalizedExpected
  )
}

function optionKey(values: readonly string[]) {
  return values.some((value) => value.trim())
    ? JSON.stringify(values.map(normalizeAnswer))
    : ''
}

// Seeded so options keep their order while the same card stays on screen.
function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const shuffled = [...items]
  let state = hashSeed(seed)

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0
    state = Math.imul(state ^ (state >>> 13), 3266489909) >>> 0
    state = (state ^ (state >>> 16)) >>> 0
    const swapIndex = state % (index + 1)
    ;[shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ]
  }

  return shuffled
}

function hashSeed(seed: string) {
  let hash = 2166136261

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}
