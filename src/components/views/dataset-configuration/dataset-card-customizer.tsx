import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import ColumnPickerDrawer from './column-picker-drawer'
import DatasetFlashcard from './dataset-flashcard'
import type {
  CardBindings,
  CardFace,
  ColumnId,
  DatasetColumn,
} from './dataset-connection-reducer'
import { Button } from '#/components/ui/button'
import SectionHeader from '#/components/ui/section-header'
import { cn } from '#/lib/utils'

const MAX_FIELDS = 4

type DatasetCardCustomizerProps = {
  columns: DatasetColumn[]
  bindings: CardBindings
  onBindColumn: (face: CardFace, index: number, columnId: ColumnId) => void
  onRemoveField: (face: CardFace, index: number) => void
}

export default function DatasetCardCustomizer(
  props: DatasetCardCustomizerProps,
) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden pb-1">
      <SectionHeader
        headingLevel={1}
        title="Card customization"
        description="Add content to your flashcards"
      />
      <DatasetCardFields {...props} layout="flashcard" />
    </div>
  )
}

export function DatasetCardFields({
  columns,
  bindings,
  onBindColumn,
  onRemoveField,
  layout,
}: DatasetCardCustomizerProps & { layout: 'flashcard' | 'sections' }) {
  const [editingFace, setEditingFace] = useState<CardFace | null>(null)

  function toggleColumn(columnId: ColumnId) {
    if (!editingFace) return

    const fields = bindings[editingFace]
    const selectedIndex = fields.indexOf(columnId)

    if (selectedIndex >= 0) {
      onRemoveField(editingFace, selectedIndex)
    } else if (fields.length < MAX_FIELDS) {
      onBindColumn(editingFace, fields.length, columnId)
    }
  }

  const columnNames = new Map(columns.map((column) => [column.id, column.name]))
  const editingFields = editingFace ? bindings[editingFace] : []

  function renderFace(face: CardFace, emptyLayout: 'inline' | 'section') {
    const fields = bindings[face]
    const canAdd = fields.length < MAX_FIELDS

    if (fields.length === 0 && emptyLayout === 'section') {
      return <EmptyFace onAdd={() => setEditingFace(face)} />
    }

    return (
      <div className="flex w-full flex-col gap-2">
        {fields.map((columnId, index) => (
          <FieldSlot
            key={columnId}
            column={columnNames.get(columnId) ?? columnId}
            isTitle={index === 0}
            onEdit={() => setEditingFace(face)}
            onRemove={() => onRemoveField(face, index)}
          />
        ))}

        {canAdd ? (
          <Button
            type="button"
            variant="soft"
            size="xs"
            onClick={() => setEditingFace(face)}
            className="mt-1 self-center"
          >
            <Plus className="size-3.5" />
            Add field
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <>
      {layout === 'flashcard' ? (
        <DatasetFlashcard>
          {(face) => renderFace(face, 'inline')}
        </DatasetFlashcard>
      ) : (
        (['front', 'back'] satisfies CardFace[]).map((face) => (
          <section
            key={face}
            aria-label={face === 'front' ? 'Front' : 'Back'}
            className="space-y-3 rounded-xl border p-3"
          >
            <h2 className="text-sm font-semibold">
              {face === 'front' ? 'Front' : 'Back'}
            </h2>
            {renderFace(face, 'section')}
          </section>
        ))
      )}

      <ColumnPickerDrawer
        open={editingFace !== null}
        onClose={() => setEditingFace(null)}
        title="Choose fields"
        description={`Select up to ${MAX_FIELDS} fields for the ${editingFace ?? 'card'} (${editingFields.length}/${MAX_FIELDS} selected)`}
        columns={columns}
        selectedColumnIds={editingFields}
        maxSelected={MAX_FIELDS}
        onToggleColumn={toggleColumn}
      />
    </>
  )
}

function EmptyFace({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      aria-label="Add field"
      onClick={onAdd}
      className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-center transition hover:border-foreground/20 hover:bg-muted/35"
    >
      <span className="max-w-56 text-xs text-pretty text-muted-foreground">
        Empty side
      </span>
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium">
        <Plus className="size-3.5" />
        Add field
      </span>
    </button>
  )
}

function FieldSlot({
  column,
  isTitle,
  onEdit,
  onRemove,
}: {
  column: string
  isTitle: boolean
  onEdit: () => void
  onRemove: () => void
}) {
  return (
    <div
      className={cn(
        'flex w-full items-center gap-1 rounded-lg border border-dashed border-border bg-muted/30 px-1.5 py-1 transition hover:bg-muted/50',
        isTitle && 'bg-muted/50',
      )}
    >
      <button
        type="button"
        onClick={onEdit}
        className={cn(
          'min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left outline-none',
          isTitle
            ? 'text-sm font-semibold text-foreground'
            : 'text-xs font-medium text-muted-foreground',
        )}
      >
        {column}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/70 transition hover:bg-muted hover:text-foreground"
        aria-label={`Remove ${column} field`}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
