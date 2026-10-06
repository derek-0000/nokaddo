import type { ComponentProps } from 'react'
import { cn } from '#/lib/utils'

export const cardSurfaceClassName =
  'rounded-xl border border-border bg-surface/40'

export default function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(cardSurfaceClassName, className)} {...props} />
}
