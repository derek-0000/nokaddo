import { useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import type { SelectOption } from '#/features/study/activities'
import { cn } from '#/lib/utils'

// Activity content waits for the card to finish shrinking (280ms) so it never
// renders squeezed into the space the card is still giving up.
const ENTER_DELAY_MS = 220

export type AnswerState = 'idle' | 'wrong' | 'correct'

export function SelectOptionGrid({
  options,
  wrongCardIds,
  solved,
  onPick,
}: {
  options: SelectOption[]
  wrongCardIds: ReadonlySet<string>
  solved: boolean
  onPick: (option: SelectOption) => void
}) {
  return (
    <div
      role="group"
      aria-label="Options"
      className="grid max-h-[340px] min-h-0 flex-1 auto-rows-fr grid-cols-2 gap-2.5"
    >
      {options.map((option, index) => {
        const [title, ...details] = option.values
        const label = option.values.filter(Boolean).join(', ') || '—'
        const state: AnswerState =
          solved && option.correct
            ? 'correct'
            : wrongCardIds.has(option.cardId)
              ? 'wrong'
              : 'idle'

        return (
          // The wrapper staggers the entrance so the shake keeps no delay.
          <div
            key={option.cardId}
            className="min-h-0 animate-study-enter"
            style={{ animationDelay: `${ENTER_DELAY_MS + index * 40}ms` }}
          >
            <button
              type="button"
              onClick={() => onPick(option)}
              disabled={solved || state === 'wrong'}
              data-state={state}
              aria-label={state === 'idle' ? label : `${label}, ${state}`}
              className={cn(
                'relative flex size-full min-w-0 flex-col items-center justify-center gap-1 rounded-[14px] border border-border bg-card px-3 py-2 text-center transition-[border-color,background-color,opacity,scale] duration-150 ease-out enabled:hover:border-foreground/25 enabled:active:scale-[0.97] disabled:cursor-default',
                state === 'correct' && 'border-success/80 bg-success/8',
                state === 'wrong' &&
                  'animate-study-shake border-destructive/60 bg-destructive/8',
                solved && !option.correct && 'opacity-40 duration-200',
              )}
            >
              <AnswerMark
                state={state}
                className="absolute top-2.5 right-2.5"
              />
              <span className="w-full truncate text-[22px] font-medium">
                {title || '—'}
              </span>
              {details.some(Boolean) ? (
                <span className="w-full truncate text-xs text-muted-foreground">
                  {details.filter(Boolean).join(' · ')}
                </span>
              ) : null}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export function WriteAnswerInput({
  value,
  state,
  onValueChange,
  onSubmit,
}: {
  value: string
  state: AnswerState
  onValueChange: (value: string, options: { composing: boolean }) => void
  onSubmit: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div
      className="relative animate-study-enter"
      style={{ animationDelay: `${ENTER_DELAY_MS}ms` }}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) =>
          onValueChange(event.target.value, {
            composing: (event.nativeEvent as InputEvent).isComposing,
          })
        }
        onCompositionEnd={(event) =>
          onValueChange(event.currentTarget.value, { composing: false })
        }
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault()
            onSubmit()
          }
        }}
        aria-label="Write the answer"
        aria-invalid={state === 'wrong'}
        data-state={state}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        lang="ja"
        placeholder="書いてください"
        className={cn(
          'h-[72px] w-full rounded-[14px] border border-border bg-card px-12 text-center text-[28px] outline-none transition-[border-color,background-color] duration-150 ease-out placeholder:text-muted-foreground/60 focus:border-foreground/30',
          state === 'correct' &&
            'border-success/80 bg-success/8 focus:border-success/80',
          state === 'wrong' &&
            'animate-study-shake border-destructive/60 bg-destructive/8 focus:border-destructive/60',
        )}
      />
      <AnswerMark
        state={state}
        className="absolute inset-y-0 right-5 my-auto"
      />
      <span role="status" className="sr-only">
        {state === 'correct' ? 'Correct' : state === 'wrong' ? 'Not quite' : ''}
      </span>
    </div>
  )
}

function AnswerMark({
  state,
  className,
}: {
  state: AnswerState
  className?: string
}) {
  if (state === 'idle') return null
  const Icon = state === 'correct' ? Check : X

  return (
    <Icon
      aria-hidden="true"
      strokeWidth={2.5}
      className={cn(
        'size-4 transition-[opacity,scale] duration-200 ease-out-strong starting:scale-90 starting:opacity-0 motion-reduce:starting:scale-100',
        state === 'correct' ? 'text-success' : 'text-destructive',
        className,
      )}
    />
  )
}
