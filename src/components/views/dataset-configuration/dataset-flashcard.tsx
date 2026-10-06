import { useState } from 'react'
import type { ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import type { CardFace } from './dataset-connection-reducer'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

type FlipPhase = 'idle' | 'out' | 'in'

type DatasetFlashcardProps = {
  children: (face: CardFace) => ReactNode
  renderControls?: (controls: {
    reset: () => void
    flip: () => void
    hasFlipped: boolean
    isFlipping: boolean
  }) => ReactNode
  surfaceClassName?: string
  topRightLabel?: ReactNode
}

export default function DatasetFlashcard({
  children,
  surfaceClassName,
  renderControls,
  topRightLabel,
}: DatasetFlashcardProps) {
  const [face, setFace] = useState<CardFace>('front')
  const [hasFlipped, setHasFlipped] = useState(false)
  const [phase, setPhase] = useState<FlipPhase>('idle')

  function handleFlip() {
    if (phase !== 'idle') return
    setHasFlipped(true)
    setPhase('out')
  }

  function handleAnimationEnd() {
    if (phase === 'out') {
      setFace((currentFace) => (currentFace === 'front' ? 'back' : 'front'))
      setPhase('in')
      return
    }

    if (phase === 'in') setPhase('idle')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-3">
      <div
        className={cn(
          'relative min-h-0 w-full flex-1',
          phase !== 'idle' && 'perspective-[1000px]',
        )}
      >
        <div
          role="group"
          aria-label={`Flashcard ${face}`}
          className={cn(
            'absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border bg-card px-4',
            phase === 'idle' && 'transform-none',
            phase === 'out' && 'animate-card-flip-out',
            phase === 'in' && 'animate-card-flip-in',
            surfaceClassName,
          )}
          onAnimationEnd={handleAnimationEnd}
          onClick={renderControls ? handleFlip : undefined}
          onKeyDown={
            renderControls
              ? (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleFlip()
                  }
                }
              : undefined
          }
          tabIndex={renderControls ? 0 : undefined}
          aria-description={
            renderControls
              ? 'Click or press Enter or Space to flip the card'
              : undefined
          }
        >
          <span className="absolute top-3 text-xs text-muted-foreground">
            {face === 'front' ? 'Front' : 'Back'}
          </span>
          {topRightLabel ? (
            <span className="absolute top-3 right-3 text-xs tabular-nums text-muted-foreground">
              {topRightLabel}
            </span>
          ) : null}
          {children(face)}
        </div>
      </div>

      {renderControls ? (
        renderControls({
          reset: () => {
            setFace('front')
            setHasFlipped(false)
            setPhase('idle')
          },
          flip: handleFlip,
          hasFlipped,
          isFlipping: phase !== 'idle',
        })
      ) : (
        <Button
          type="button"
          variant="soft"
          size="xs"
          onClick={handleFlip}
          disabled={phase !== 'idle'}
          className="shrink-0"
        >
          <RotateCcw className="size-3.5" />
          Flip
        </Button>
      )}
    </div>
  )
}
