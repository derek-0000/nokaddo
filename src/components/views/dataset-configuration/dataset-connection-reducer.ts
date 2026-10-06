import type { DatasetConnectionMode } from './dataset-connection-mode-select'

export type CardFace = 'front' | 'back'
export type ColumnId = string

export type DatasetColumn = {
  id: ColumnId
  name: string
  type: string
}

export type CardBindings = Record<CardFace, ColumnId[]>

export type DatasetConnectionState = {
  mode: DatasetConnectionMode
  groupingColumnId: ColumnId | null
  bindings: CardBindings
}

export type DatasetConnectionAction =
  | { type: 'mode-changed'; mode: DatasetConnectionMode }
  | { type: 'grouping-column-changed'; columnId: ColumnId }
  | {
      type: 'card-field-bound'
      face: CardFace
      index: number
      columnId: ColumnId
    }
  | { type: 'card-field-removed'; face: CardFace; index: number }

export function createDatasetConnectionState(
  columns: DatasetColumn[],
): DatasetConnectionState {
  return {
    mode: 'grouped',
    groupingColumnId: columns.at(0)?.id ?? null,
    bindings: {
      front: [],
      back: [],
    },
  }
}

export function datasetConnectionReducer(
  state: DatasetConnectionState,
  action: DatasetConnectionAction,
): DatasetConnectionState {
  switch (action.type) {
    case 'mode-changed':
      return { ...state, mode: action.mode }

    case 'grouping-column-changed':
      return { ...state, groupingColumnId: action.columnId }

    case 'card-field-bound': {
      const fields = [...state.bindings[action.face]]
      fields[action.index] = action.columnId

      return {
        ...state,
        bindings: {
          ...state.bindings,
          [action.face]: fields,
        },
      }
    }

    case 'card-field-removed':
      return {
        ...state,
        bindings: {
          ...state.bindings,
          [action.face]: state.bindings[action.face].filter(
            (_, index) => index !== action.index,
          ),
        },
      }
  }
}
