import { openDb, REGISTRY_STORE_NAME } from './db'
import type { StudyQuery } from '#/features/study/types'

const STUDY_CARD_POSITION_KEY_PREFIX = 'study_card_position:'

export type StudyCardPosition = {
  version: 1
  query: StudyQuery
  queryFingerprint: string
  pageIndex: number
  cardIndex: number
  cursors?: [null, ...string[]]
  pageOffsets?: [0, ...number[]]
}

export function getItem<TValue>(key: string) {
  return runTransaction('readonly', (store) =>
    requestResult<TValue | undefined>(store.get(key)),
  )
}

export function updateItem<TValue>(key: string, value: TValue) {
  return runTransaction('readwrite', async (store) => {
    await requestResult(store.put(value, key))
  })
}

export function getStudyCardPosition(
  workspaceId: string,
  deckId: string,
  queryFingerprint: string,
) {
  return getItem<StudyCardPosition>(
    studyCardPositionKey(workspaceId, deckId, queryFingerprint),
  )
}

export function setStudyCardPosition(
  workspaceId: string,
  deckId: string,
  queryFingerprint: string,
  position: StudyCardPosition,
) {
  return updateItem(
    studyCardPositionKey(workspaceId, deckId, queryFingerprint),
    position,
  )
}

function studyCardPositionKey(
  workspaceId: string,
  deckId: string,
  queryFingerprint: string,
) {
  return `${STUDY_CARD_POSITION_KEY_PREFIX}${workspaceId}:${deckId}:${queryFingerprint}`
}

async function runTransaction<TResult>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<TResult>,
) {
  const database = await openDb()
  const transaction = database.transaction(REGISTRY_STORE_NAME, mode)
  const done = transactionDone(transaction)

  try {
    const result = await operation(transaction.objectStore(REGISTRY_STORE_NAME))
    await done
    return result
  } catch (error) {
    await done.catch(() => undefined)
    throw error
  }
}

function requestResult<TResult>(request: IDBRequest<TResult>) {
  return new Promise<TResult>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}
