import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type StatusScreenProps = {
  icon: LucideIcon
  title: string
  description?: string
  tone?: 'neutral' | 'error'
  actions?: ReactNode
}
export default function StatusScreen({
  icon: Icon,
  title,
  description,
  tone = 'neutral',
  actions,
}: StatusScreenProps) {
  return (
    <div className="h-[80%] flex flex-col items-center justify-center gap-2">
      <div className="overflow-hidden relative p-2 rounded-xl">
        <Icon className={tone === 'error' ? 'z-10 text-destructive' : 'z-10'} />
      </div>
      <div className="text-center">
        <h1 className="text-md font-medium">{title}</h1>
        {description ? (
          <p className="text-muted-foreground text-xs">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
