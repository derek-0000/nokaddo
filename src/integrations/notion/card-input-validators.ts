import { AppError } from '#/lib/errors'

type DataGroupIdInput = { dataGroupId: string }

export function validateDataGroupId(data: unknown): DataGroupIdInput {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new AppError('validation')
  }

  const record = data as Record<string, unknown>
  const dataGroupId = Object.hasOwn(record, 'dataGroupId')
    ? record.dataGroupId
    : undefined
  if (typeof dataGroupId !== 'string' || !dataGroupId) {
    throw new AppError('validation')
  }

  return record as DataGroupIdInput
}
