import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ColumnId, DatasetColumn } from './dataset-connection-reducer'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '#/components/ui/drawer'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

type ColumnPickerDrawerProps = {
  open: boolean
  onClose: () => void
  title: ReactNode
  description: ReactNode
  columns: DatasetColumn[]
  selectedColumnIds: ColumnId[]
  maxSelected: number
  onToggleColumn: (columnId: ColumnId) => void
}

export default function ColumnPickerDrawer({
  open,
  onClose,
  title,
  description,
  columns,
  selectedColumnIds,
  maxSelected,
  onToggleColumn,
}: ColumnPickerDrawerProps) {
  const selected = new Set(selectedColumnIds)
  // A single-choice picker replaces its selection instead of hitting a limit.
  const replacesSelection = maxSelected === 1

  return (
    <Drawer
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
      showSwipeHandle
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {columns.map((column) => {
            const isSelected = selected.has(column.id)
            const selectionLimitReached =
              !replacesSelection &&
              selectedColumnIds.length >= maxSelected &&
              !isSelected

            return (
              <button
                key={column.id}
                type="button"
                aria-pressed={isSelected}
                disabled={selectionLimitReached}
                onClick={() => onToggleColumn(column.id)}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent',
                  isSelected && 'bg-primary/5 font-semibold',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{column.name}</span>
                {isSelected ? (
                  <Check
                    className="size-4 shrink-0 text-primary"
                    strokeWidth={2.5}
                  />
                ) : null}
              </button>
            )
          })}
        </div>
        <DrawerFooter>
          <Button type="button" onClick={onClose} className="w-full" size="lg">
            Done
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
