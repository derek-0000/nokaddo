import { ListChecks, PenLine } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { StudyActivity } from '#/features/study/activities'

export const STUDY_ACTIVITY_DETAILS: Record<
  StudyActivity,
  { label: string; description: string; columnsHint: string; icon: LucideIcon }
> = {
  select: {
    label: 'Select correct option',
    description: 'Pick the right card from four options.',
    columnsHint: 'Columns shown in each option',
    icon: ListChecks,
  },
  write: {
    label: 'Write it',
    description: 'Type the expected value from memory.',
    columnsHint: 'Column with the expected answer',
    icon: PenLine,
  },
}
