import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import './shared'

const clearIndexedDb = async (): Promise<void> => {
  const databases = await indexedDB.databases()

  await Promise.all(
    databases
      .filter(
        (database): database is IDBDatabaseInfo & { name: string } =>
          database.name !== undefined,
      )
      .map(
        (database) =>
          new Promise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase(database.name)
            request.onerror = () => reject(request.error)
            request.onblocked = () =>
              reject(
                new Error(
                  `IndexedDB cleanup was blocked for "${database.name}". Close all database connections in the test.`,
                ),
              )
            request.onsuccess = () => resolve()
          }),
      ),
  )
}

afterEach(async () => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  await clearIndexedDb()
})
