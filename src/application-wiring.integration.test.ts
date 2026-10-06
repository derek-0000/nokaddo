import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/react-router'
import type { AnyRouter } from '@tanstack/react-router'
import type { Options as SsrQueryOptions } from '@tanstack/react-router-ssr-query'

const wiring = vi.hoisted(() => ({
  createHandler: vi.fn(() => vi.fn()),
  setupSsrQuery: vi.fn(),
  streamHandler: vi.fn(),
}))

vi.mock('@tanstack/react-router-ssr-query', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const setupRouterSsrQueryIntegration =
    actual.setupRouterSsrQueryIntegration as (
      options: SsrQueryOptions<AnyRouter>,
    ) => void

  return {
    ...actual,
    setupRouterSsrQueryIntegration: (options: SsrQueryOptions<AnyRouter>) => {
      wiring.setupSsrQuery(options)
      return setupRouterSsrQueryIntegration(options)
    },
  }
})

vi.mock('@tanstack/react-start/server', () => ({
  createStartHandler: wiring.createHandler,
  defaultStreamHandler: wiring.streamHandler,
}))

const configKeys = [
  'SESSION_SECRET',
  'OAUTH_CLIENT_ID',
  'OAUTH_CLIENT_SECRET',
  'OAUTH_REDIRECT_URI',
  'VITE_NOTION_AUTH_URL',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_KV_NAMESPACE_ID',
  'CLOUDFLARE_KV_API_TOKEN',
] as const

const validConfig = {
  SESSION_SECRET: 's'.repeat(32),
  OAUTH_CLIENT_ID: 'client-id',
  OAUTH_CLIENT_SECRET: 'client-secret',
  OAUTH_REDIRECT_URI: 'https://example.test/oauth/callback',
  VITE_NOTION_AUTH_URL: 'https://api.notion.test/authorize',
  CLOUDFLARE_ACCOUNT_ID: 'cloudflare-account-id',
  CLOUDFLARE_KV_NAMESPACE_ID: 'cloudflare-namespace-id',
  CLOUDFLARE_KV_API_TOKEN: 'cloudflare-api-token',
}

const originalConfig = Object.fromEntries(
  configKeys.map((key) => [key, process.env[key]]),
)

beforeEach(() => {
  wiring.createHandler.mockReturnValue(vi.fn())
})

afterEach(() => {
  for (const key of configKeys) {
    const value = originalConfig[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('router construction', () => {
  it('creates an isolated query context and installs the declared router behavior once per router', async () => {
    const { getRouter } = await import('./router')
    wiring.setupSsrQuery.mockClear()

    const first = getRouter()
    const second = getRouter()
    const context = first.options.context
    const history = createMemoryHistory({ initialEntries: ['/app'] })
    const injected = getRouter({ context, history })

    expect(first.options.context.queryClient).not.toBe(
      second.options.context.queryClient,
    )
    expect(first.options.defaultPreload).toBe('intent')
    expect(first.options.defaultPreloadStaleTime).toBe(0)
    expect(first.options.scrollRestoration).toBe(true)
    expect(injected.options.context).toBe(context)
    expect(injected.options.history).toBe(history)
    expect(wiring.setupSsrQuery).toHaveBeenCalledTimes(3)
    expect(wiring.setupSsrQuery).toHaveBeenNthCalledWith(1, {
      router: first,
      queryClient: first.options.context.queryClient,
    })
    expect(wiring.setupSsrQuery).toHaveBeenNthCalledWith(2, {
      router: second,
      queryClient: second.options.context.queryClient,
    })
    expect(wiring.setupSsrQuery).toHaveBeenNthCalledWith(3, {
      router: injected,
      queryClient: context.queryClient,
    })
    expect(first.options.Wrap).toBeTypeOf('function')
  })
})

describe('Start configuration', () => {
  it('protects server functions while allowing router and same-origin requests', async () => {
    const { startInstance } = await import('./start')
    const options = await startInstance.getOptions()
    const middleware = options.requestMiddleware?.[0]
    const run = middleware?.options.server
    const next = vi.fn().mockImplementation(({ context } = {}) => ({
      request: new Request('https://example.test/_server'),
      pathname: '/_server',
      context: context ?? {},
      response: new Response('ok'),
    }))

    const crossOriginServerFn = await run?.({
      request: new Request('https://example.test/_server', {
        method: 'POST',
        headers: { Origin: 'https://attacker.test' },
      }),
      pathname: '/_server',
      context: {},
      handlerType: 'serverFn',
      next,
    } as never)
    expect(crossOriginServerFn).toBeInstanceOf(Response)
    expect((crossOriginServerFn as Response).status).toBe(403)
    expect(next).not.toHaveBeenCalled()

    await run?.({
      request: new Request('https://example.test/app', {
        headers: { Origin: 'https://attacker.test' },
      }),
      pathname: '/app',
      context: {},
      handlerType: 'router',
      next,
    } as never)
    await run?.({
      request: new Request('https://example.test/_server', {
        method: 'POST',
        headers: { Origin: 'https://example.test' },
      }),
      pathname: '/_server',
      context: {},
      handlerType: 'serverFn',
      next,
    } as never)
    expect(next).toHaveBeenCalledTimes(2)
  })

  it('registers the production AppError adapter and preserves only its stable code', async () => {
    const { startInstance } = await import('./start')
    const { AppError } = await import('./lib/errors')
    const options = await startInstance.getOptions()
    const adapter = options.serializationAdapters?.find(
      (candidate) => candidate.key === 'AppError',
    )

    expect(adapter).toBeDefined()
    expect(adapter?.test(new AppError('rate_limited'))).toBe(true)
    expect(
      adapter?.toSerializable(
        new AppError('rate_limited', {
          cause: new Error('SENTINEL provider body'),
        }),
      ),
    ).toBe('rate_limited')
    const restored = adapter?.fromSerializable('rate_limited')
    expect(restored).toBeInstanceOf(AppError)
    expect(restored).toMatchObject({ code: 'rate_limited' })
    expect((restored as Error).message).not.toContain('SENTINEL')
  })
})

describe('server entry', () => {
  it('rejects an invalid isolated import before creating a request handler', async () => {
    for (const key of configKeys) delete process.env[key]
    vi.resetModules()

    await expect(import('./server')).rejects.toThrow(
      /invalid server configuration/i,
    )
    expect(wiring.createHandler).not.toHaveBeenCalled()
  })

  it('creates the fetch entry point only after valid configuration passes', async () => {
    Object.assign(process.env, validConfig)
    const fetch = vi.fn()
    wiring.createHandler.mockReturnValue(fetch)
    vi.resetModules()

    const server = await import('./server')

    expect(wiring.createHandler).toHaveBeenCalledOnce()
    expect(wiring.createHandler).toHaveBeenCalledWith(wiring.streamHandler)
    expect(server.default).toEqual({ fetch })
  })
})
