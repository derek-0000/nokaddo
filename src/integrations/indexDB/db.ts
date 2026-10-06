const DATABASE_NAME = 'nokaddo-indexdb'
export const REGISTRY_STORE_NAME = 'registry'
const DATABASE_VERSION = 2

let databasePromise: Promise<IDBDatabase> | undefined

export function openDb() {
  if (databasePromise) return databasePromise

  databasePromise = openDatabase().catch((error: unknown) => {
    databasePromise = undefined
    throw error
  })

  return databasePromise
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const indexedDb = Reflect.get(globalThis, 'indexedDB') as
      IDBFactory | undefined

    if (!indexedDb) {
      reject(new Error('IndexedDB is not available in this environment'))
      return
    }

    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION)
    let settled = false

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(REGISTRY_STORE_NAME)) {
        database.createObjectStore(REGISTRY_STORE_NAME)
      }
    }

    request.onsuccess = () => {
      const database = request.result

      if (settled) {
        database.close()
        return
      }

      settled = true
      database.onversionchange = () => {
        database.close()
        databasePromise = undefined
      }
      resolve(database)
    }

    request.onerror = () => {
      if (settled) return
      settled = true
      reject(request.error)
    }
    request.onblocked = () => {
      if (settled) return
      settled = true
      reject(
        new Error(`Opening IndexedDB database "${DATABASE_NAME}" was blocked`),
      )
    }
  })
}
