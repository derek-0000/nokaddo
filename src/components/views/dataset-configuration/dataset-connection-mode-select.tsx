import { cn } from '#/lib/utils'

export type DatasetConnectionMode = 'grouped' | 'single'

type DatasetConnectionModeSelectProps = {
  value: DatasetConnectionMode
  onValueChange: (value: DatasetConnectionMode) => void
}

const modes: Array<{
  value: DatasetConnectionMode
  title: string
  description: string
}> = [
  {
    value: 'grouped',
    title: 'Groups',
    description: 'Grouped by columns',
  },
  {
    value: 'single',
    title: 'Single Group',
    description: 'All items together',
  },
]

export default function DatasetConnectionModeSelect({
  value,
  onValueChange,
}: DatasetConnectionModeSelectProps) {
  return (
    <div
      className="grid grid-cols-2 gap-2.5"
      role="radiogroup"
      aria-label="Card structure"
    >
      {modes.map((mode) => {
        const selected = value === mode.value

        return (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onValueChange(mode.value)}
            className={cn(
              'flex flex-col rounded-xl border p-3 text-left transition',
              selected
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50',
            )}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-4 shrink-0 place-items-center rounded-full border transition',
                  selected
                    ? 'border-primary bg-primary'
                    : 'border-border bg-background',
                )}
              >
                {selected ? (
                  <span className="size-1.5 rounded-full bg-primary-foreground" />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">
                  {mode.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {mode.description}
                </span>
              </span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
