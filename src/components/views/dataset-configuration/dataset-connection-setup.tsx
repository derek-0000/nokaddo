import { LayoutList } from 'lucide-react'
import DatasetConnectionColumnGroupingList from './dataset-connection-column-grouping-list'
import DatasetConnectionModeSelect from './dataset-connection-mode-select'
import type { DatasetConnectionMode } from './dataset-connection-mode-select'
import type { ColumnId, DatasetColumn } from './dataset-connection-reducer'
import SectionHeader from '#/components/ui/section-header'

type DatasetConnectionSetupProps = {
  columns: DatasetColumn[]
  mode: DatasetConnectionMode
  groupingColumnId: ColumnId | null
  onModeChange: (mode: DatasetConnectionMode) => void
  onGroupingColumnChange: (columnId: ColumnId) => void
}

export default function DatasetConnectionSetup({
  columns,
  mode,
  groupingColumnId,
  onModeChange,
  onGroupingColumnChange,
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
