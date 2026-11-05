import type { DatasetConnectionMode } from './dataset-connection-mode-select'
import {
  ACTIVITY_COLUMN_LIMITS,
  STUDY_ACTIVITIES,
} from '#/features/study/activities'
import type { StudyActivity } from '#/features/study/activities'

export type CardFace = 'front' | 'back'
export type ColumnId = string

export type DatasetColumn = {
  id: ColumnId
  name: string
  type: string
}

export type CardBindings = Record<CardFace, ColumnId[]>

export type ActivitySettings = Record<
  StudyActivity,
  { enabled: boolean; columnIds: ColumnId[] }
>

export type DatasetConnectionState = {
  mode: DatasetConnectionMode
  groupingColumnId: ColumnId | null
  bindings: CardBindings
  activities: ActivitySettings
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
  | { type: 'activity-toggled'; activity: StudyActivity; enabled: boolean }
  | {
      type: 'activity-columns-changed'
      activity: StudyActivity
      columnIds: ColumnId[]
    }

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
    activities: createActivitySettings({
      selectOptionColumnIds: [],
      writeAnswerColumnId: null,
    }),
  }
}

export function createActivitySettings({
  selectOptionColumnIds,
  writeAnswerColumnId,
}: {
  selectOptionColumnIds: ColumnId[]
  writeAnswerColumnId: ColumnId | null
}): ActivitySettings {
  const writeColumnIds = writeAnswerColumnId ? [writeAnswerColumnId] : []

  return {
    select: {
      enabled: selectOptionColumnIds.length > 0,
      columnIds: selectOptionColumnIds,
    },
    write: { enabled: writeColumnIds.length > 0, columnIds: writeColumnIds },
  }
}

export function hasValidActivitySettings(
  activities: ActivitySettings,
  validColumnIds: ReadonlySet<ColumnId>,
) {
  return STUDY_ACTIVITIES.every((activity) => {
    const { enabled, columnIds } = activities[activity]

    return (
      !enabled ||
      (columnIds.length > 0 &&
        columnIds.length <= ACTIVITY_COLUMN_LIMITS[activity] &&
        columnIds.every((id) => validColumnIds.has(id)))
    )
  })
}

/** Disabled activities are persisted as empty so their columns are cleared. */
export function toActivityConfiguration(activities: ActivitySettings) {
  return {
    selectOptionColumnIds: activities.select.enabled
      ? activities.select.columnIds
      : [],
    writeAnswerColumnId: activities.write.enabled
      ? (activities.write.columnIds.at(0) ?? null)
      : null,
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

    case 'activity-toggled':
      return {
        ...state,
        activities: {
          ...state.activities,
          [action.activity]: {
            ...state.activities[action.activity],
            enabled: action.enabled,
          },
        },
      }

    case 'activity-columns-changed':
      return {
        ...state,
        activities: {
          ...state.activities,
          [action.activity]: {
            ...state.activities[action.activity],
            columnIds: action.columnIds,
          },
        },
      }
  }
}
