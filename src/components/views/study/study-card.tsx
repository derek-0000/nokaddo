import { useLayoutEffect, useRef, useState } from 'react'
import type { AnimationEvent, ReactNode, RefObject } from 'react'
import { ChevronLeft, ChevronRight, CircleCheck } from 'lucide-react'
import { SelectOptionGrid, WriteAnswerInput } from './study-activities'
import type { AnswerState } from './study-activities'
import { STUDY_ACTIVITY_DETAILS } from './study-activity-details'
import type { useStudy } from './use-study'
import { Button } from '#/components/ui/button'
import {
  createSelectOptions,
  getActivityPrompt,
  getStudySteps,
  isCorrectAnswer,
} from '#/features/study/activities'
import type {
  SelectOption,
  StudyActivity,
  StudyStep,
} from '#/features/study/activities'
import type { CompactCard, StudyQuery } from '#/features/study/types'
import { toPublicError } from '#/lib/errors'
import { cn } from '#/lib/utils'

type StudyState = ReturnType<typeof useStudy>
type FlipPhase = 'idle' | 'out' | 'in'

const STEP_LABELS: Record<StudyStep, string> = {
  front: 'Front',
  back: 'Back',
  select: STUDY_ACTIVITY_DETAILS.select.label,
  write: STUDY_ACTIVITY_DETAILS.write.label,
}

function isActivityStep(step: StudyStep): step is StudyActivity {
  return step === 'select' || step === 'write'
}

/**
 * One card view: Next walks the faces and then each activity before moving to
 * the next card. Activities must be answered correctly to continue.
 */
export default function StudyCard({
  card,
  study,
  query,
  total,
  navigationButtonRef,
}: {
  card: CompactCard
  study: StudyState
  query: StudyQuery
  total: number
  navigationButtonRef: RefObject<HTMLButtonElement | null>
}) {
  const steps = getStudySteps(card)
  const [stepIndex, setStepIndex] = useState(0)
  const [flip, setFlip] = useState<{ phase: FlipPhase; target: number }>({
    phase: 'idle',
    target: 0,
  })
  // Options stay fixed for the card view so result writes don't reshuffle them.
  const [options] = useState(() =>
    createSelectOptions(card, study.activityPool),
  )
  const [wrongCardIds, setWrongCardIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const [selectSolved, setSelectSolved] = useState(false)
  const [written, setWritten] = useState('')
  const [composing, setComposing] = useState(false)
  const [writtenRejected, setWrittenRejected] = useState(false)
  // Only the first attempt of each activity in a card view is saved.
  const attempted = useRef(new Set<StudyActivity>())
  const cardRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const exitingRef = useRef<HTMLDivElement>(null)
  const resizeFrom = useRef<number | null>(null)
  // The previous step's text, kept in place while it fades out.
  const [exiting, setExiting] = useState<{
    face: 'front' | 'back'
    values: string[]
    top: number
  } | null>(null)

  const step = steps.at(stepIndex) ?? 'front'
  const isLastStep = stepIndex >= steps.length - 1
  const isFlipping = flip.phase !== 'idle'
  const expectedAnswer = card.write?.value ?? ''
  const writeState: AnswerState =
    !composing && isCorrectAnswer(written, expectedAnswer)
      ? 'correct'
      : writtenRejected
        ? 'wrong'
        : 'idle'
  const solved: Record<StudyActivity, boolean> = {
    select: selectSolved,
    write: writeState === 'correct',
  }
  // Next checks a written answer that hasn't been judged yet.
  const canCheckWritten =
    step === 'write' && writeState === 'idle' && !composing && !!written.trim()
  const blockedByActivity =
    isActivityStep(step) && !solved[step] && !canCheckWritten

  function record(activity: StudyActivity, correct: boolean) {
    if (attempted.current.has(activity)) return
    attempted.current.add(activity)
    study.recordActivityResult({ pageId: card.id, activity, correct })
  }

  function goToStep(target: number) {
    const turnsCard = [stepIndex, target].every(
      (index) => steps[index] === 'front' || steps[index] === 'back',
    )
    if (turnsCard && target !== stepIndex) {
      setFlip({ phase: 'out', target })
      return
    }
    const cardElement = cardRef.current
    const content = contentRef.current
    if (cardElement && content && canAnimate(cardElement)) {
      const cardBox = cardElement.getBoundingClientRect()
      resizeFrom.current = cardBox.height
      setExiting({
        face: step === 'front' ? 'front' : 'back',
        values: stepValues(step),
        top: content.getBoundingClientRect().top - cardBox.top,
      })
    }
    setStepIndex(target)
  }

  // Entering or leaving an activity changes the card's height. Animate from
  // the measured height so the card eases into place instead of snapping.
  // The old text fades out where it was while the new text waits for the
  // resize to settle, so neither is seen sliding with the card's center.
  useLayoutEffect(() => {
    const element = cardRef.current
    const from = resizeFrom.current
    resizeFrom.current = null
    if (!element || from === null) return
    const to = element.getBoundingClientRect().height
    const resizes = Math.abs(from - to) >= 1
    if (resizes) {
      const frame = { flexGrow: 0, flexShrink: 0, maxHeight: 'none' }
      element.animate(
        [
          { ...frame, flexBasis: `${from}px` },
          { ...frame, flexBasis: `${to}px` },
        ],
        { duration: 280, easing: 'cubic-bezier(0.77, 0, 0.175, 1)' },
      )
    }
    contentRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 200,
      delay: resizes ? 220 : 80,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      fill: 'backwards',
    })
    const fadeOut = exitingRef.current?.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 120, easing: 'ease-out', fill: 'forwards' },
    )
    if (fadeOut)
      void fadeOut.finished.then(
        () => setExiting(null),
        () => {},
      )
    else setExiting(null)
  }, [stepIndex])

  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    if (flip.phase === 'out') {
      setStepIndex(flip.target)
      setFlip({ phase: 'in', target: flip.target })
    } else if (flip.phase === 'in') {
      setFlip({ phase: 'idle', target: flip.target })
    }
  }

  function resetView() {
    setStepIndex(0)
    setFlip({ phase: 'idle', target: 0 })
    setWrongCardIds(new Set())
    setSelectSolved(false)
    setWritten('')
    setComposing(false)
    setWrittenRejected(false)
    attempted.current = new Set()
  }

  function next() {
    if (isFlipping || blockedByActivity) return
    if (canCheckWritten) {
      record('write', false)
      setWrittenRejected(true)
      return
    }
    if (!isLastStep) goToStep(stepIndex + 1)
    else if (study.hasNextCard) void study.nextCard()
    // Restarting may land on this same card, which keeps this view mounted.
    else void study.restart().then(resetView)
  }

  function previous() {
    if (stepIndex > 0) goToStep(stepIndex - 1)
    else void study.previousCard()
  }

  function pick(option: SelectOption) {
    if (selectSolved) return
    record('select', option.correct)
    if (option.correct) setSelectSolved(true)
    else setWrongCardIds((current) => new Set(current).add(option.cardId))
  }

  function changeWritten(value: string, input: { composing: boolean }) {
    setWritten(value)
    setComposing(input.composing)
    setWrittenRejected(false)
    if (!input.composing && isCorrectAnswer(value, expectedAnswer)) {
      record('write', true)
    }
  }

  const isPractice = isActivityStep(step)
  const cardLabel = STEP_LABELS[step]

  function stepValues(target: StudyStep) {
    if (target === 'front') return card.front
    if (target === 'back') return card.back
    return getActivityPrompt(card, query, target)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/*
        Card and activity share a fixed area so the controls never move.
        contain:size keeps the card's resize from growing the page: without
        it the area's content height leaks to ancestors that can grow.
      */}
      <div
        className={cn(
          // Clip vertically only, so a shaking answer keeps its sides visible.
          'flex min-h-0 flex-1 flex-col gap-2 overflow-x-visible overflow-y-clip [contain:size]',
          isFlipping && 'perspective-[1000px]',
        )}
      >
        <div
          ref={cardRef}
          role="group"
          aria-label={`Flashcard ${cardLabel.toLowerCase()}`}
          onAnimationEnd={handleAnimationEnd}
          className={cn(
            'relative flex min-h-[120px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-card px-5',
            isPractice
              ? 'max-h-[50%] min-h-[208px] shrink-0 grow-0 basis-auto pt-12 pb-8'
              : 'shrink grow basis-0 pt-9 pb-6',
            flip.phase === 'out' && 'animate-card-flip-out',
            flip.phase === 'in' && 'animate-card-flip-in',
          )}
        >
          <LearnedToggle
            learned={card.completed}
            disabled={study.isLearning}
            onToggle={study.toggleLearned}
          />
          <span className="pointer-events-none absolute inset-x-0 top-3 text-center text-xs text-muted-foreground">
            {cardLabel}
          </span>
          <span className="absolute top-3 right-3.5 text-xs text-muted-foreground tabular-nums">
            {study.currentCardNumber}/{total}
          </span>
          {exiting ? (
            <div
              ref={exitingRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 flex flex-col items-center px-5 text-center"
              style={{ top: exiting.top }}
            >
              <FaceValues face={exiting.face} values={exiting.values} />
            </div>
          ) : null}
          <div
            ref={contentRef}
            className="flex max-w-full min-w-0 flex-col items-center gap-2.5 overflow-y-auto text-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <FaceValues
              face={step === 'front' ? 'front' : 'back'}
              values={stepValues(step)}
            />
          </div>
        </div>

        {isPractice ? (
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 overflow-x-visible overflow-y-clip">
            {step === 'select' ? (
              <SelectOptionGrid
                options={options}
                wrongCardIds={wrongCardIds}
                solved={selectSolved}
                onPick={pick}
              />
            ) : null}
            {step === 'write' ? (
              <WriteAnswerInput
                value={written}
                state={writeState}
                onValueChange={changeWritten}
                onSubmit={next}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <ProgressError
        error={study.activityResultError}
        retry={study.retryActivityResult}
        disabled={study.isSavingActivityResult}
      />
      <ProgressError
        error={study.progressError}
        retry={study.retryProgress}
        disabled={study.isSavingProgress}
      />
      <div className="flex shrink-0 gap-3">
        <Button
          variant="soft"
          size="lg"
          className="h-11 flex-1"
          onClick={previous}
          disabled={
            isFlipping ||
            study.isNavigating ||
            (stepIndex === 0 &&
              (!study.hasPreviousCard || study.isPreparingPrevious))
          }
        >
          <ChevronLeft />
          {stepIndex === 0 && study.isPreparingPrevious
            ? 'Finding previous…'
            : 'Previous'}
        </Button>
        <Button
          size="lg"
          className="h-11 flex-1 transition-[opacity,background-color,translate] duration-200 ease-out disabled:delay-150"
          ref={navigationButtonRef}
          onClick={next}
          disabled={
            isFlipping ||
            study.isNavigating ||
            blockedByActivity ||
            (isLastStep && !canCheckWritten && study.isPreparingNext)
          }
        >
          {!isLastStep || canCheckWritten
            ? 'Next'
            : study.isPreparingNext
              ? 'Finding next…'
              : study.hasNextCard
                ? 'Next'
                : 'Back to start'}
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

function LearnedToggle({
  learned,
  disabled,
  onToggle,
}: {
  learned: boolean
  disabled: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={learned}
      aria-label={learned ? 'Mark unlearned' : 'Mark learned'}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      className={cn(
        'group absolute top-2 left-2 z-10 grid size-7 place-items-center rounded-full transition-[color,scale] duration-200 ease-out active:scale-[0.94] disabled:cursor-progress',
        learned
          ? 'text-success'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {/* The pill grows out of the icon with clip-path, so nothing reflows. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 flex items-center rounded-full pr-2.5 pl-[30px] text-[11px] font-medium whitespace-nowrap transition-[clip-path,background-color] duration-250 ease-out-strong motion-reduce:transition-[background-color]',
          learned
            ? 'bg-success/15 [clip-path:inset(0_0_0_0_round_999px)]'
            : 'pointer-events-none bg-transparent [clip-path:inset(0_calc(100%-28px)_0_0_round_999px)] group-hover:bg-secondary',
        )}
      >
        <span
          className={cn(
            'transition-[opacity,translate] duration-200 ease-out-strong motion-reduce:translate-x-0',
            learned ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-0',
          )}
        >
          Learned
        </span>
      </span>
      <CircleCheck
        aria-hidden="true"
        className={cn(
          'relative size-[18px] transition-[fill] duration-200 ease-out',
          learned ? 'fill-success/20' : 'fill-transparent',
        )}
      />
    </button>
  )
}

function canAnimate(element: HTMLElement) {
  return (
    typeof element.animate === 'function' &&
    !(
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  )
}

function FaceValues({
  face,
  values,
}: {
  face: 'front' | 'back'
  values: string[]
}) {
  if (values.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No {face} fields configured.
      </p>
    )
  }

  const [title, ...details] = values

  return (
    <div className="flex flex-col items-center gap-2.5">
      <p className="text-[clamp(32px,9vw,44px)] leading-tight font-semibold tracking-[0.02em] text-balance">
        {title || '—'}
      </p>
      {details.map((value, index) => (
        <p
          key={index}
          className={cn(
            'text-balance',
            face === 'front'
              ? 'text-[15px] text-muted-foreground'
              : 'text-sm text-foreground/70',
          )}
        >
          {value || '—'}
        </p>
      ))}
    </div>
  )
}

function ProgressError({
  error,
  retry,
  disabled,
}: {
  error: unknown
  retry: () => void
  disabled: boolean
}): ReactNode {
  if (!error) return null
  return (
    <div role="alert" className="shrink-0 text-center text-xs text-destructive">
      <p>We couldn't save your progress. {toPublicError(error).message}</p>
      <Button variant="soft" size="sm" onClick={retry} disabled={disabled}>
        Retry saving progress
      </Button>
    </div>
  )
}
