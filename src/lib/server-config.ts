import '@tanstack/react-start/server-only'

type ConfigRule = {
  name: string
  validate?: (value: string) => string | undefined
}

const MIN_SESSION_SECRET_LENGTH = 32

const CONFIG_RULES: ReadonlyArray<ConfigRule> = [
  {
    name: 'SESSION_SECRET',
    validate: (value) =>
      value.length < MIN_SESSION_SECRET_LENGTH
        ? `must contain at least ${MIN_SESSION_SECRET_LENGTH} characters`
        : undefined,
  },
  { name: 'OAUTH_CLIENT_ID' },
  { name: 'OAUTH_CLIENT_SECRET' },
  {
    name: 'OAUTH_REDIRECT_URI',
    validate: (value) =>
      isValidUrl(value) ? undefined : 'must be a valid URL',
  },
  {
    name: 'VITE_NOTION_AUTH_URL',
    validate: (value) =>
      isValidUrl(value) ? undefined : 'must be a valid URL',
  },
  { name: 'CLOUDFLARE_ACCOUNT_ID' },
  { name: 'CLOUDFLARE_KV_NAMESPACE_ID' },
  { name: 'CLOUDFLARE_KV_API_TOKEN' },
]

function isValidUrl(value: string) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

export function collectServerConfigErrors(
  env: NodeJS.ProcessEnv = process.env,
): Array<string> {
  const errors: Array<string> = []

  for (const rule of CONFIG_RULES) {
    const value = env[rule.name]

    if (!value) {
      errors.push(`${rule.name} is required`)
      continue
    }

    const message = rule.validate?.(value)
    if (message) errors.push(`${rule.name} ${message}`)
  }

  return errors
}

export function assertServerConfig(env: NodeJS.ProcessEnv = process.env): void {
  const errors = collectServerConfigErrors(env)

  if (errors.length > 0) {
    throw new Error(
      `Invalid server configuration:\n${errors.map((error) => `  - ${error}`).join('\n')}`,
    )
  }
}

export function serverConfigValue(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = env[name]

  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}
