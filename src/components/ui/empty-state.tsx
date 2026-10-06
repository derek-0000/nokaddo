import type { ReactNode } from 'react'
import Card from './card'
import { cn } from '#/lib/utils'

type EmptyStateProps = {
  icon: ReactNode
  message: ReactNode
  className?: string
}

export default function EmptyState({
  icon,
  message,
  className,
}: EmptyStateProps) {
  return (
    <Card
      className={cn(
        'flex flex-col items-center gap-2 p-4 text-center text-xs text-muted-foreground',
        className,
      )}
    >
      <div
        className="flex size-9 items-center justify-center rounded-md border border-border bg-background/40 [&>svg]:size-4"
        aria-hidden
      >
        {icon}
      </div>
      <p>{message}</p>
    </Card>
  )
}
