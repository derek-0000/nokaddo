import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Layers, LayoutList } from 'lucide-react'
import DatasetFlashcard from './dataset-flashcard'
import type {
  CardBindings,
  ColumnId,
  DatasetColumn,
} from './dataset-connection-reducer'
import type { DatasetConnectionMode } from './dataset-connection-mode-select'
import SectionHeader from '#/components/ui/section-header'
import { notionQueries } from '#/integrations/notion/api'
import { normalizeNotionPropertyId } from '#/integrations/notion/helpers'

type DatasetConnectionPreviewProps = {
  datasetId: string
  columns: DatasetColumn[]
  mode: DatasetConnectionMode
  groupingColumnId: ColumnId | null
  bindings: CardBindings
}

export default function DatasetConnectionPreview({
  datasetId,
  columns,
  mode,
  groupingColumnId,
  bindings,
}: DatasetConnectionPreviewProps) {
  const columnNames = new Map(columns.map((column) => [column.id, column.name]))
  const configuredFields = [...bindings.front, ...bindings.back]
    .map((columnId) => columns.find((column) => column.id === columnId))
    .filter((column) => column !== undefined)
    .map(({ id, type }) => ({ id, type }))
  const previewItem = useQuery(
    notionQueries.datasetPreviewItem(datasetId, configuredFields),
  )

  const groupingColumn = groupingColumnId
    ? (columnNames.get(groupingColumnId) ?? null)
    : null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden pb-1">
      <SectionHeader
        headingLevel={1}
        title="Preview configuration"
        description="Confirm your setup before finishing"
      />

      <ConfigSummary mode={mode} groupingColumn={groupingColumn} />

      <DatasetFlashcard surfaceClassName="overflow-hidden">
        {(face) => {
          const fields = bindings[face]

          if (fields.length === 0) {
            return (
              <PreviewMessage>
                No {face} fields yet. Go back to add some.
              </PreviewMessage>
            )
          }

          if (previewItem.isPending) {
            return (
              <PreviewMessage role="status">Loading an example…</PreviewMessage>
            )
          }

          if (previewItem.isError) {
            return (
              <PreviewMessage role="alert">
                We couldn&apos;t load an example item.
              </PreviewMessage>
            )
          }

          if (!previewItem.data) {
            return (
              <PreviewMessage role="status">
                This dataset has no items to preview.
              </PreviewMessage>
            )
          }

          return (
            <StackedPreview
              fields={fields}
              properties={previewItem.data.properties}
              columnNames={columnNames}
            />
          )
        }}
      </DatasetFlashcard>
    </div>
  )
}

function ConfigSummary({
  mode,
  groupingColumn,
}: {
  mode: DatasetConnectionMode
  groupingColumn: string | null
}) {
  const label =
    mode === 'grouped'
      ? groupingColumn
        ? `Grouped by “${groupingColumn}”`
        : 'No grouping column selected'
      : 'Single list'

  return (
    <div className="flex shrink-0 items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="grid size-7 shrink-0 place-items-center rounded-md border border-border">
        {mode === 'grouped' ? (
          <Layers className="size-3.5 " />
        ) : (
          <LayoutList className="size-3.5 " />
        )}
      </div>
      <p className="min-w-0 truncate text-xs font-semibold">{label}</p>
    </div>
  )
}

function PreviewMessage({
  children,
  role,
}: {
  children: ReactNode
  role?: 'alert' | 'status'
}) {
  return (
    <p role={role} className="px-2 text-center text-xs text-muted-foreground">
      {children}
    </p>
  )
}

function StackedPreview({
  fields,
  properties,
  columnNames,
}: {
  fields: ColumnId[]
  properties: Array<{ id: string; name: string; value: string }>
  columnNames: Map<ColumnId, string>
}) {
  const valuesById = new Map(
    properties.map((property) => [property.id, property.value]),
  )
  const valuesByName = new Map(
    properties.map((property) => [property.name, property.value]),
  )
  const renderedFields = fields.flatMap((columnId, index) => {
    const label = columnNames.get(columnId) ?? columnId
    const normalizedColumnId = normalizeNotionPropertyId(columnId)
    const value = valuesById.has(normalizedColumnId)
      ? valuesById.get(normalizedColumnId)
      : valuesByName.get(label)

    return value ? [{ key: `${columnId}-${index}`, label, value }] : []
  })
  const title = renderedFields.at(0)

  if (!title) return null
  const rest = renderedFields.slice(1)

  return (
    <div className="flex w-full flex-col items-center justify-center gap-2.5 text-center">
      <p
        className="text-base font-semibold tracking-tight text-balance"
        aria-label={title.label}
      >
        {title.value}
      </p>
      {rest.map((field) => (
        <p
          key={field.key}
          className="text-xs leading-snug text-muted-foreground"
          aria-label={field.label}
        >
          {field.value}
        </p>
      ))}
    </div>
  )
}
