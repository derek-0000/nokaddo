import { useState } from 'react'
import { Plus } from 'lucide-react'
import ColumnPickerDrawer from './column-picker-drawer'
import type {
  ActivitySettings,
  ColumnId,
  DatasetColumn,
} from './dataset-connection-reducer'
import { STUDY_ACTIVITY_DETAILS } from '../study/study-activity-details'
import { Button } from '#/components/ui/button'
import SectionHeader from '#/components/ui/section-header'
import {
  ACTIVITY_COLUMN_LIMITS,
  STUDY_ACTIVITIES,
} from '#/features/study/activities'
import type { StudyActivity } from '#/features/study/activities'
import { cn } from '#/lib/utils'

type DatasetActivitySettingsProps = {
  columns: DatasetColumn[]
  activities: ActivitySettings
  onToggleActivity: (activity: StudyActivity, enabled: boolean) => void
  onActivityColumnsChange: (
    activity: StudyActivity,
    columnIds: ColumnId[],
  ) => void
}

export default function DatasetActivitySettings({
  columns,
  activities,
  onToggleActivity,
  onActivityColumnsChange,
}: DatasetActivitySettingsProps) {
  const [editingActivity, setEditingActivity] = useState<StudyActivity | null>(
    null,
  )
  const columnNames = new Map(columns.map((column) => [column.id, column.name]))
  const editingColumnIds = editingActivity
    ? activities[editingActivity].columnIds
    : []
  const editingLimit = editingActivity
    ? ACTIVITY_COLUMN_LIMITS[editingActivity]
    : 1

  function toggleColumn(columnId: ColumnId) {
    if (!editingActivity) return

    if (editingColumnIds.includes(columnId)) {
      onActivityColumnsChange(
        editingActivity,
        editingColumnIds.filter((id) => id !== columnId),
      )
    } else if (editingLimit === 1) {
      onActivityColumnsChange(editingActivity, [columnId])
    } else if (editingColumnIds.length < editingLimit) {
      onActivityColumnsChange(editingActivity, [...editingColumnIds, columnId])
    }
  }

  return (
    <section className="flex shrink-0 flex-col gap-3">
      <SectionHeader
        title="Activities"
        description="Practice after each flashcard."
      />
      <div className="flex flex-col gap-2">
        {STUDY_ACTIVITIES.map((activity) => {
          const settings = activities[activity]
          const details = STUDY_ACTIVITY_DETAILS[activity]
          const Icon = details.icon

          return (
            <div
              key={activity}
              className="flex flex-col gap-2 rounded-xl border border-border p-3"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-md transition-colors duration-200 ease-out',
                    settings.enabled
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold">
                    {details.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {details.description}
                  </span>
                </span>
                <ActivitySwitch
                  label={details.label}
                  checked={settings.enabled}
                  onCheckedChange={(enabled) => {
                    onToggleActivity(activity, enabled)
                    if (enabled && settings.columnIds.length === 0) {
                      setEditingActivity(activity)
                    }
                  }}
                />
              </div>
              {settings.enabled ? (
                <ActivityColumns
                  hint={details.columnsHint}
                  columnNames={settings.columnIds.map(
                    (id) => columnNames.get(id) ?? id,
                  )}
                  onEdit={() => setEditingActivity(activity)}
                />
              ) : null}
            </div>
          )
        })}
      </div>

      <ColumnPickerDrawer
        open={editingActivity !== null}
        onClose={() => setEditingActivity(null)}
        title={
          editingActivity
            ? STUDY_ACTIVITY_DETAILS[editingActivity].label
            : 'Choose columns'
        }
        description={
          editingLimit === 1
            ? 'Select the column with the expected answer'
            : `Select up to ${editingLimit} columns to show in each option (${editingColumnIds.length}/${editingLimit} selected)`
        }
        columns={columns}
        selectedColumnIds={editingColumnIds}
        maxSelected={editingLimit}
        onToggleColumn={toggleColumn}
      />
    </section>
  )
}

function ActivitySwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-background after:transition-transform',
        checked ? 'bg-primary after:translate-x-4' : 'bg-muted-foreground/30',
      )}
    />
  )
}

function ActivityColumns({
  hint,
  columnNames,
  onEdit,
}: {
  hint: string
  columnNames: string[]
  onEdit: () => void
}) {
  return (
    <div className="flex flex-col items-start gap-1.5 pl-10">
      {columnNames.length === 0 ? (
        <span className="text-xs text-destructive">
          Choose at least one column.
        </span>
      ) : null}
      <div className="flex max-w-full flex-wrap items-center gap-1.5">
        {columnNames.map((name) => (
          <span
            key={name}
            className="max-w-full truncate rounded-md border border-dashed border-border bg-muted/50 px-2 py-0.5 text-xs font-medium"
          >
            {name}
          </span>
        ))}
        <Button
          type="button"
          variant="soft"
          size="xs"
          onClick={onEdit}
          aria-label={`${hint}: choose columns`}
        >
          <Plus className="size-3.5" />
          {columnNames.length === 0 ? 'Choose' : 'Edit'}
        </Button>
      </div>
    </div>
  )
}
