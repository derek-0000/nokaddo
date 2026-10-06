import { Check } from 'lucide-react'
import type { ColumnId, DatasetColumn } from './dataset-connection-reducer'
import SectionHeader from '#/components/ui/section-header'
import { cn } from '#/lib/utils'

type DatasetConnectionColumnGroupingListProps = {
  columns: DatasetColumn[]
  value: ColumnId | null
  onValueChange: (value: ColumnId) => void
  layout?: 'fill' | 'compact'
}

export default function DatasetConnectionColumnGroupingList({
  columns,
  value,
  onValueChange,
  layout = 'fill',
}: DatasetConnectionColumnGroupingListProps) {
  const columnList = (
    <div
      role="radiogroup"
      aria-label="Column to group by"
      className={cn(
        'overflow-y-auto overscroll-contain',
        layout === 'fill'
          ? 'max-h-full'
          : 'max-h-48 min-h-24 touch-pan-y rounded-xl border border-border bg-muted/50',
      )}
    >
      {columns.map((column, index) => {
        const selected = value === column.id

        return (
          <button
            key={column.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onValueChange(column.id)}
            className={cn(
              'flex min-h-12 w-full items-center gap-3 px-4 text-left transition active:bg-muted',
              index > 0 && 'border-t border-border',
              selected && 'bg-background',
            )}
          >
            <span
              className={cn(
                'flex-1 truncate text-xs',
                selected ? 'font-semibold' : 'font-medium',
              )}
            >
              {column.name}
            </span>
            {selected ? (
              <Check
                className="size-4 shrink-0 text-primary"
                strokeWidth={2.5}
              />
            ) : null}
          </button>
        )
      })}
    </div>
  )

  return (
    <section
      className={cn(
        'flex min-h-0 flex-col gap-3',
        layout === 'fill' && 'flex-1 overflow-hidden',
      )}
    >
      <SectionHeader
        title="Group by column"
        description="Each distinct value becomes a group name."
      />
      {layout === 'fill' ? (
        <div className="min-h-0 overflow-hidden rounded-xl border border-border bg-muted/50">
          {columnList}
        </div>
      ) : (
        columnList
      )}
    </section>
  )
}
