import { describe, expect, it, vi } from 'vitest'
import type { StudyQuery } from '#/features/study/types'

const DATABASE_NAME = 'nokaddo-indexdb'
const REGISTRY_STORE_NAME = 'registry'

function openRawDatabase(
  version: number,
  upgrade?: (request: IDBOpenDBRequest) => void,
) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, version)
    request.onupgradeneeded = () => upgrade?.(request)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Raw database open was blocked'))
    request.onsuccess = () => resolve(request.result)
  })
}

describe('IndexedDB registry connection', () => {
  it('creates the registry once and memoizes a successful connection', async () => {
    const { openDb, REGISTRY_STORE_NAME: storeName } = await import('./db')

    const firstOpen = openDb()
    expect(openDb()).toBe(firstOpen)

    const database = await firstOpen
    expect(Array.from(database.objectStoreNames)).toEqual([storeName])
    expect(openDb()).toBe(firstOpen)

    database.close()
    vi.resetModules()

    const reopened = await (await import('./db')).openDb()
    expect(Array.from(reopened.objectStoreNames)).toEqual([storeName])
  })

  it('closes the memoized connection when the database version changes', async () => {
    const database = await (await import('./db')).openDb()
    const upgraded = await openRawDatabase(database.version + 1)

    expect(() => database.transaction(REGISTRY_STORE_NAME)).toThrowError(
      expect.objectContaining({ name: 'InvalidStateError' }),
    )

    upgraded.close()
  })

  it('rejects when IndexedDB is unavailable and retries after availability returns', async () => {
    const availableIndexedDb = indexedDB
    vi.stubGlobal('indexedDB', undefined)
    const { openDb } = await import('./db')

    const unavailableOpen = openDb()
    expect(openDb()).toBe(unavailableOpen)
    await expect(unavailableOpen).rejects.toThrow(
      'IndexedDB is not available in this environment',
    )

    vi.stubGlobal('indexedDB', availableIndexedDb)
    await expect(openDb()).resolves.toBeInstanceOf(IDBDatabase)
  })

  it('rejects a blocked upgrade and clears the failed open so it can retry', async () => {
    const blockingDatabase = await openRawDatabase(1, (request) => {
      request.result.createObjectStore(REGISTRY_STORE_NAME)
    })
    const { openDb } = await import('./db')

    await expect(openDb()).rejects.toThrow(
      'Opening IndexedDB database "nokaddo-indexdb" was blocked',
    )

    blockingDatabase.close()
    await expect(openDb()).resolves.toBeInstanceOf(IDBDatabase)
  })
})

describe('IndexedDB registry operations', () => {
  it('uses put for updates and scopes saved study positions by query', async () => {
    const { getItem, getStudyCardPosition, setStudyCardPosition, updateItem } =
      await import('./handlers')
    const initialValue = { revision: 1 }
    const replacementValue = { revision: 2 }
    const query: StudyQuery = {
      dataSourceId: 'source-id',
      filter: { property: 'topic', select: { equals: 'Grammar' } },
      sorts: [],
      pageSize: 20,
      frontPropertyIds: ['front'],
      backPropertyIds: ['back'],
      groupPropertyId: 'topic',
    }
    const position = {
      version: 1 as const,
      query,
      queryFingerprint: 'grammar-query',
      pageIndex: 1,
      cardIndex: 4,
    }

    await expect(getItem('missing')).resolves.toBeUndefined()
    await expect(updateItem('entry', initialValue)).resolves.toBeUndefined()
    await expect(getItem('entry')).resolves.toEqual(initialValue)
    await expect(updateItem('entry', replacementValue)).resolves.toBeUndefined()
    await expect(getItem('entry')).resolves.toEqual(replacementValue)
    await expect(
      setStudyCardPosition(
        'workspace-id',
        'deck-id',
        'grammar-query',
        position,
      ),
    ).resolves.toBeUndefined()
    await expect(
      getStudyCardPosition('workspace-id', 'deck-id', 'grammar-query'),
    ).resolves.toEqual(position)
    await expect(
      getStudyCardPosition('workspace-id', 'deck-id', 'vocabulary-query'),
    ).resolves.toBeUndefined()
  })

  it('rejects transaction failures without leaving pending operations', async () => {
    const { openDb } = await import('./db')
    const { getItem } = await import('./handlers')

    const database = await openDb()
    database.close()
    await expect(getItem('closed-database')).rejects.toMatchObject({
      name: 'InvalidStateError',
    })
  })
})
