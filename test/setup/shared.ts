import { afterEach, beforeEach, vi } from 'vitest'
import { disposeTrackedQueryClients } from '../support/query-client'

const failUnexpectedNetworkRequest = (request: unknown): never => {
  const target =
    typeof request === 'string'
      ? request
      : request instanceof URL
        ? request.href
        : request instanceof Request
          ? request.url
          : String(request)

  throw new Error(
    `Unexpected network request to "${target}". Stub the infrastructure boundary in this test.`,
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(failUnexpectedNetworkRequest))
})

afterEach(async () => {
  await disposeTrackedQueryClients()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.resetModules()
})
