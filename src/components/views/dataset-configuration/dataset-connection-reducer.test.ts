import { describe, expect, it } from 'vitest'
import {
  createDatasetConnectionState,
  datasetConnectionReducer,
} from './dataset-connection-reducer'
import type {
  CardFace,
  DatasetConnectionState,
} from './dataset-connection-reducer'

const stateWithBindings = (): DatasetConnectionState => ({
  mode: 'grouped',
  groupingColumnId: 'group',
  bindings: {
    front: ['front-a', 'front-b', 'front-c'],
    back: ['back-a', 'back-b', 'back-c'],
  },
})

describe('dataset connection initial state', () => {
  it('defaults to grouped mode, the first column, and empty faces', () => {
    expect(
      createDatasetConnectionState([
        { id: 'first', name: 'First', type: 'title' },
        { id: 'second', name: 'Second', type: 'rich_text' },
      ]),
    ).toEqual({
      mode: 'grouped',
      groupingColumnId: 'first',
      bindings: {
        front: [],
        back: [],
      },
    })
  })

  it('selects no grouping column when there are no columns', () => {
    expect(createDatasetConnectionState([]).groupingColumnId).toBeNull()
  })
})

describe('dataset connection mode and grouping changes', () => {
  it('changes mode immutably and preserves grouping and bindings', () => {
    const state = stateWithBindings()
    const next = datasetConnectionReducer(state, {
      type: 'mode-changed',
      mode: 'single',
    })

    expect(next).not.toBe(state)
    expect(next).toEqual({ ...state, mode: 'single' })
    expect(next.bindings).toBe(state.bindings)
  })

  it('changes grouping immutably and preserves mode and bindings', () => {
    const state = stateWithBindings()
    const next = datasetConnectionReducer(state, {
      type: 'grouping-column-changed',
      columnId: 'new-group',
    })

    expect(next).not.toBe(state)
    expect(next).toEqual({ ...state, groupingColumnId: 'new-group' })
    expect(next.bindings).toBe(state.bindings)
  })
})

describe('dataset connection bindings', () => {
  it.each(['front', 'back'] as const)(
    'replaces only the requested %s slot without mutating prior state',
    (face) => {
      const state = stateWithBindings()
      const otherFace: CardFace = face === 'front' ? 'back' : 'front'
      const originalRequestedFace = state.bindings[face]
      const next = datasetConnectionReducer(state, {
        type: 'card-field-bound',
        face,
        index: 1,
        columnId: 'replacement',
      })

      expect(next).not.toBe(state)
      expect(next.bindings).not.toBe(state.bindings)
      expect(next.bindings[face]).toEqual([
        `${face}-a`,
        'replacement',
        `${face}-c`,
      ])
      expect(next.bindings[face]).not.toBe(originalRequestedFace)
      expect(next.bindings[otherFace]).toBe(state.bindings[otherFace])
      expect(state.bindings[face]).toEqual([
        `${face}-a`,
        `${face}-b`,
        `${face}-c`,
      ])
    },
  )

  it.each(['front', 'back'] as const)(
    'removes only the requested %s slot and compacts order',
    (face) => {
      const state = stateWithBindings()
      const otherFace: CardFace = face === 'front' ? 'back' : 'front'
      const originalRequestedFace = state.bindings[face]
      const next = datasetConnectionReducer(state, {
        type: 'card-field-removed',
        face,
        index: 1,
      })

      expect(next).not.toBe(state)
      expect(next.bindings).not.toBe(state.bindings)
      expect(next.bindings[face]).toEqual([`${face}-a`, `${face}-c`])
      expect(next.bindings[face]).not.toBe(originalRequestedFace)
      expect(next.bindings[otherFace]).toBe(state.bindings[otherFace])
      expect(state.bindings[face]).toEqual([
        `${face}-a`,
        `${face}-b`,
        `${face}-c`,
      ])
    },
  )
})
