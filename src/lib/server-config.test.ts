import { describe, expect, it } from 'vitest'
import {
  assertServerConfig,
  collectServerConfigErrors,
  serverConfigValue,
} from './server-config'

const validEnv: NodeJS.ProcessEnv = {
  SESSION_SECRET: 'x'.repeat(32),
  OAUTH_CLIENT_ID: 'client-id',
  OAUTH_CLIENT_SECRET: 'client-secret',
  OAUTH_REDIRECT_URI: 'http://localhost:3002/',
  VITE_NOTION_AUTH_URL: 'https://example.com/auth',
  CLOUDFLARE_ACCOUNT_ID: 'cloudflare-account-id',
  CLOUDFLARE_KV_NAMESPACE_ID: 'cloudflare-namespace-id',
  CLOUDFLARE_KV_API_TOKEN: 'cloudflare-api-token',
}

describe('configuration validation', () => {
  it('returns no errors for a valid environment', () => {
    expect(collectServerConfigErrors(validEnv)).toEqual([])
  })

  it('reports every missing variable at once', () => {
    const errors = collectServerConfigErrors({})

    expect(errors).toHaveLength(8)
    expect(errors).toContain('SESSION_SECRET is required')
    expect(errors).toContain('VITE_NOTION_AUTH_URL is required')
  })

  it('accepts a 32-character session secret', () => {
    expect(
      collectServerConfigErrors({
        ...validEnv,
        SESSION_SECRET: 'x'.repeat(32),
      }),
    ).toEqual([])
  })

  it('rejects a 31-character session secret', () => {
    expect(
      collectServerConfigErrors({
        ...validEnv,
        SESSION_SECRET: 'x'.repeat(31),
      }),
    ).toEqual(['SESSION_SECRET must contain at least 32 characters'])
  })

  it.each(['OAUTH_REDIRECT_URI', 'VITE_NOTION_AUTH_URL'] as const)(
    'rejects a malformed %s',
    (name) => {
      const errors = collectServerConfigErrors({
        ...validEnv,
        [name]: 'not a url',
      })

      expect(errors).toEqual([`${name} must be a valid URL`])
    },
  )

  it('returns validation failures together with missing keys', () => {
    const errors = collectServerConfigErrors({
      ...validEnv,
      SESSION_SECRET: 'short',
      OAUTH_CLIENT_ID: undefined,
    })

    expect(errors).toEqual([
      'SESSION_SECRET must contain at least 32 characters',
      'OAUTH_CLIENT_ID is required',
    ])
  })
})

describe('configuration assertion', () => {
  it('does not throw for a valid environment', () => {
    expect(() => assertServerConfig(validEnv)).not.toThrow()
  })

  it('aggregates all failures into a single diagnostic', () => {
    expect(() => assertServerConfig({})).toThrow(
      [
        'Invalid server configuration:',
        '  - SESSION_SECRET is required',
        '  - OAUTH_CLIENT_ID is required',
        '  - OAUTH_CLIENT_SECRET is required',
        '  - OAUTH_REDIRECT_URI is required',
        '  - VITE_NOTION_AUTH_URL is required',
        '  - CLOUDFLARE_ACCOUNT_ID is required',
        '  - CLOUDFLARE_KV_NAMESPACE_ID is required',
        '  - CLOUDFLARE_KV_API_TOKEN is required',
      ].join('\n'),
    )
  })
})

describe('individual configuration lookup', () => {
  it('returns a present value', () => {
    expect(serverConfigValue('OAUTH_CLIENT_ID', validEnv)).toBe('client-id')
  })

  it('throws for a missing value', () => {
    expect(() => serverConfigValue('OAUTH_CLIENT_ID', {})).toThrow(
      'OAUTH_CLIENT_ID is required',
    )
  })

  it('does not read unrelated environment keys', () => {
    const env = new Proxy<NodeJS.ProcessEnv>(
      { OAUTH_CLIENT_ID: 'client-id' },
      {
        get(target, property, receiver) {
          if (property !== 'OAUTH_CLIENT_ID') {
            throw new Error(`unexpected read of ${String(property)}`)
          }

          return Reflect.get(target, property, receiver)
        },
      },
    )

    expect(serverConfigValue('OAUTH_CLIENT_ID', env)).toBe('client-id')
  })
})
