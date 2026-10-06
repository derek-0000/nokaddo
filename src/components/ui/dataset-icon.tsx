import { Layers } from 'lucide-react'
import { cn } from '#/lib/utils'

type DatasetIconProps = {
  iconUrl?: string | null
  className?: string
}

export default function DatasetIcon({ iconUrl, className }: DatasetIconProps) {
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        className={cn('size-10 shrink-0 rounded-sm object-cover', className)}
      />
    )
  }

  return (
    <div
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-sm bg-muted',
        className,
      )}
    >
      <Layers className="size-4 text-muted-foreground" />
    </div>
  )
}
