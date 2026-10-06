import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { Button } from './button'

type BackNavigationProps = Omit<ComponentProps<typeof Link>, 'children'> & {
  label: string
  imageUrl?: string | null
  icon?: ReactNode
}

export default function BackNavigation({
  label,
  imageUrl,
  icon,
  ...linkProps
}: BackNavigationProps) {
  return (
    <Button
      variant="ghost"
      className="w-fit max-w-full shrink-0 self-start pl-1"
      render={<Link {...linkProps} />}
      nativeButton={false}
      aria-label="Back"
    >
      <ChevronLeft className="size-4" />
      {imageUrl ? (
        <img src={imageUrl} alt="" className="size-5 shrink-0 rounded" />
      ) : (
        icon
      )}
      <span className="truncate text-xs font-semibold text-foreground">
        {label}
      </span>
    </Button>
  )
}
