import type { ReactNode } from 'react'
import { cn } from '#/lib/utils'

type SectionHeaderProps = {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  headingLevel?: 1 | 2
  className?: string
}

export default function SectionHeader({
  title,
  description,
  icon,
  headingLevel = 2,
  className,
}: SectionHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'

  return (
    <header
      className={cn(
        'flex shrink-0 items-center gap-3 bg-transparent',
        className,
      )}
    >
      {icon}
      <div className="min-w-0 flex-1 space-y-1">
        <Heading className="font-medium">{title}</Heading>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </header>
  )
}
