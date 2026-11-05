import { describe, expect, it } from 'vitest'
import {
  createSelectOptions,
  getActivityPrompt,
  getStudySteps,
  isCorrectAnswer,
  normalizeAnswer,
} from './activities'
import { createStudyQuery } from './query'
import type { CompactCard } from './types'

function card(id: string, values?: string[]): CompactCard {
  return {
    id,
    visited: false,
    completed: false,
    front: [id],
    back: [],
    select: values ? { values, correct: false } : undefined,
  }
}

describe('select options', () => {
  it('includes the current card once with three distinct distractors', () => {
    const current = card('a', ['あ', 'a'])
    const pool = [
      current,
      card('b', ['い', 'i']),
      card('c', ['う', 'u']),
      card('d', ['え', 'e']),
      card('e', ['お', 'o']),
    ]

    const options = createSelectOptions(current, pool)

    expect(options).toHaveLength(4)
    expect(options.filter((option) => option.correct)).toEqual([
      { cardId: 'a', values: ['あ', 'a'], correct: true },
    ])
    expect(new Set(options.map((option) => option.cardId)).size).toBe(4)
  })

  it('skips distractors that look the same as the correct option or are empty', () => {
    const current = card('a', ['Cat'])
    const pool = [
      current,
      card('same', [' cat ']),
      card('empty', ['']),
      card('no-select'),
      card('dog', ['Dog']),
    ]

    expect(
      createSelectOptions(current, pool)
        .map((option) => option.cardId)
        .sort(),
    ).toEqual(['a', 'dog'])
  })

  it('keeps the same order for the same card', () => {
    const current = card('a', ['1'])
    const pool = ['b', 'c', 'd', 'e'].map((id) => card(id, [id]))

    expect(createSelectOptions(current, pool)).toEqual(
      createSelectOptions(current, pool),
    )
  })

  it('returns no options when the card has no select values', () => {
    expect(createSelectOptions(card('a'), [card('b', ['b'])])).toEqual([])
  })
})

describe('written answers', () => {
  it('ignores case, surrounding space, repeated spaces, and width', () => {
    expect(normalizeAnswer('  Ｈello   World ')).toBe('hello world')
    expect(isCorrectAnswer('hello  WORLD', 'Hello world')).toBe(true)
  })

  it('rejects different answers and never accepts an empty expected value', () => {
    expect(isCorrectAnswer('dog', 'cat')).toBe(false)
    expect(isCorrectAnswer('', '  ')).toBe(false)
  })
})

describe('study query activities', () => {
  const configuration = {
    dataSetId: 'source',
    groupingColumnId: null,
    frontColumnIds: ['front'],
    backColumnIds: [],
  }

  it('omits disabled activities so existing query fingerprints stay stable', () => {
    const query = createStudyQuery({
      ...configuration,
      selectOptionColumnIds: [],
      writeAnswerColumnId: null,
    })

    expect(query).not.toHaveProperty('selectPropertyIds', expect.anything())
    expect(query).not.toHaveProperty('writePropertyId', expect.anything())
  })

  it('requests the columns of enabled activities', () => {
    expect(
      createStudyQuery({
        ...configuration,
        selectOptionColumnIds: ['reading', 'meaning'],
        writeAnswerColumnId: 'reading',
      }),
    ).toMatchObject({
      selectPropertyIds: ['reading', 'meaning'],
      writePropertyId: 'reading',
    })
  })
})

describe('study steps', () => {
  it('adds only the activities a card can answer after its faces', () => {
    expect(getStudySteps(card('a'))).toEqual(['front', 'back'])
    expect(
      getStudySteps({
        ...card('a', ['あ']),
        write: { value: 'a', correct: false },
      }),
    ).toEqual(['front', 'back', 'select', 'write'])
    expect(
      getStudySteps({
        ...card('a', ['']),
        write: { value: '  ', correct: false },
      }),
    ).toEqual(['front', 'back'])
  })
})

describe('activity prompt', () => {
  const query = {
    frontPropertyIds: ['word', 'reading'],
    backPropertyIds: ['meaning', 'word'],
    selectPropertyIds: ['word'],
    writePropertyId: 'meaning',
  }
  const vocabulary = {
    ...card('a'),
    front: ['覚える', 'おぼえる'],
    back: ['to memorize', '覚える'],
  }

  it('shows back fields without the columns the activity asks for', () => {
    expect(getActivityPrompt(vocabulary, query, 'select')).toEqual([
      'to memorize',
    ])
    expect(getActivityPrompt(vocabulary, query, 'write')).toEqual(['覚える'])
  })

  it('falls back to front fields when the back has nothing to show', () => {
    expect(
      getActivityPrompt(
        { ...vocabulary, back: ['', '覚える'] },
        query,
        'select',
      ),
    ).toEqual(['おぼえる'])
  })
})
