import { getStudyWindow } from './study-functions'
import type { StudyWindowSource } from '#/features/study/types'

export const notionStudySource: StudyWindowSource = {
  fetchWindow: (query, startCursor) =>
    getStudyWindow({ data: { query, startCursor } }),
}
