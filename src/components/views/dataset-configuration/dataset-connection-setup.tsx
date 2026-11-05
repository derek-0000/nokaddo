import { LayoutList } from 'lucide-react'
import DatasetActivitySettings from './dataset-activity-settings'
import DatasetConnectionColumnGroupingList from './dataset-connection-column-grouping-list'
import DatasetConnectionModeSelect from './dataset-connection-mode-select'
import type { DatasetConnectionMode } from './dataset-connection-mode-select'
import type {
  ActivitySettings,
  ColumnId,
  DatasetColumn,
} from './dataset-connection-reducer'
import SectionHeader from '#/components/ui/section-header'
import type { StudyActivity } from '#/features/study/activities'

type DatasetConnectionSetupProps = {
  columns: DatasetColumn[]
  activityColumns: DatasetColumn[]
  mode: DatasetConnectionMode
  groupingColumnId: ColumnId | null
  activities: ActivitySettings
  onModeChange: (mode: DatasetConnectionMode) => void
  onGroupingColumnChange: (columnId: ColumnId) => void
  onToggleActivity: (activity: StudyActivity, enabled: boolean) => void
  onActivityColumnsChange: (
    activity: StudyActivity,
    columnIds: ColumnId[],
  ) => void
}

export default function DatasetConnectionSetup({
  columns,
  activityColumns,
  mode,
  groupingColumnId,
  activities,
  onModeChange,
  onGroupingColumnChange,
  onToggleActivity,
  onActivityColumnsChange,
}: DatasetConnectionSetupProps) {
  return (
    <>
      <section className="shrink-0 space-y-3">
        <SectionHeader
          headingLevel={1}
          title="Configure your dataset connection"
          description="Generate many groups of flashcards or a single large group"
        />
        <DatasetConnectionModeSelect
          value={mode}
          onValueChange={onModeChange}
        />
      </section>

      {mode === 'grouped' ? (
        <DatasetConnectionColumnGroupingList
          columns={columns}
          value={groupingColumnId}
          onValueChange={onGroupingColumnChange}
        />
      ) : (
        <SingleListHint cardCount={24} />
      )}

      <DatasetActivitySettings
        columns={activityColumns}
        activities={activities}
        onToggleActivity={onToggleActivity}
        onActivityColumnsChange={onActivityColumnsChange}
      />
    </>
  )
}

function SingleListHint({ cardCount }: { cardCount: number }) {
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 px-3 py-4 text-center">
      <div className="mx-auto mb-2 grid size-10 place-items-center rounded-lg border border-border bg-background">
        <LayoutList className="size-4" />
      </div>
      <p className="text-sm font-medium">One continuous list</p>
      <p className="text-xs text-muted-foreground">
        All {cardCount} rows connect as a single card deck. No grouping column
        required.
      </p>
    </div>
  )
}
