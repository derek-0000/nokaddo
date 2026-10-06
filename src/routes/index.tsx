import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { MeshGradient } from '@paper-design/shaders-react'
import { Github } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { buttonVariants } from '#/components/ui/button-variants'
import ThemeToggle from '#/components/ui/theme-toggle'
import { redirectAuthenticated } from '#/integrations/notion/guards'
import {
  NotionOAuthError,
  completeNotionAuthorization,
} from '#/integrations/notion/oauth-server'
import type { NotionOAuthErrorCode } from '#/integrations/notion/oauth-server'

function throwRedirect(location: string): never {
  throw redirect({
    href: location,
    statusCode: 302,
  })
}

/**
 * Stable, user-facing messages keyed by public error code. We never place raw
 * server/SDK error text in the URL because URLs are retained in history and
 * commonly reach logs and analytics.
 */
const OAUTH_ERROR_MESSAGES: Record<NotionOAuthErrorCode, string> = {
  oauth_cancelled: 'Notion authorization was cancelled. Please try again.',
  oauth_state_invalid:
    'Your Notion sign-in session expired. Please start again.',
  oauth_exchange_failed:
    'We could not complete the Notion connection. Please try again.',
  configuration_error:
    'Notion sign-in is temporarily unavailable. Please try again later.',
}

function isOAuthErrorCode(value: unknown): value is NotionOAuthErrorCode {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(OAUTH_ERROR_MESSAGES, value)
  )
}

function redirectWithError(code: NotionOAuthErrorCode): never {
  const search = new URLSearchParams({ oauthResult: code })

  throwRedirect(`/?${search.toString()}`)
}

export const Route = createFileRoute('/')({
  server: {
    handlers: {
      GET: async ({ request, next }) => {
        const url = new URL(request.url)
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const oauthError = url.searchParams.get('error')

        const isOAuthCallback =
          url.searchParams.has('code') ||
          url.searchParams.has('state') ||
          url.searchParams.has('error')

        if (!isOAuthCallback) return next()

        try {
          await completeNotionAuthorization({
            code,
            state,
            error: oauthError,
          })
        } catch (error) {
          if (!(error instanceof NotionOAuthError)) {
            console.error('Unexpected Notion OAuth callback failure', error)
          }

          const errorCode =
            error instanceof NotionOAuthError
              ? error.code
              : 'oauth_exchange_failed'

          return redirectWithError(errorCode)
        }

        throwRedirect('/app')
      },
    },
  },
  validateSearch: ({ oauthResult }) => ({
    oauthResult: isOAuthErrorCode(oauthResult) ? oauthResult : undefined,
  }),
  ssr: false,
  beforeLoad: async ({ context }) =>
    await redirectAuthenticated(context.queryClient),
  component: Home,
})

function Home() {
  const { oauthResult } = Route.useSearch()
  const errorMessage = oauthResult
    ? OAUTH_ERROR_MESSAGES[oauthResult]
    : undefined

  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden">
      <MeshGradient
        className="absolute top-0 left-0 h-full w-full -z-100 transition-opacity dark:opacity-10"
        colors={[
          '#ffffff',
          '#ffffff',
          '#ffffff',
          '#f0f0f0',
          '#00140e',
          '#ffffff',
        ]}
        distortion={0.59}
        swirl={0.58}
        grainMixer={0}
        grainOverlay={0.14}
        speed={0.52}
        scale={0.56}
      />
      <div className="flex flex-col gap-1">
        <div>
          <div className="relative font-hachi text-lg text-foreground">
            のカード
          </div>
          <div className="relative text-xs text-foreground">
            Flashcards connected to your Notion Datasets
          </div>
        </div>

        <div className="flex justify-between">
          <form action="/auth/notion/start" method="get">
            <Button type="submit" variant="soft">
              <img className="size-4 " src="notion.svg" alt="Notion Logo" />
              Add Connection
            </Button>
          </form>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              href="https://github.com/derek-0000/nokaddo"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              title="GitHub"
              className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
            >
              <Github aria-hidden="true" />
            </a>
          </div>
        </div>
        {errorMessage && (
          <p className="text-destructive text-xs">{errorMessage}</p>
        )}
      </div>
      <nav className="absolute right-2 bottom-2 flex items-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          render={<Link to="/privacy" />}
          nativeButton={false}
        >
          Privacy Policy
        </Button>
        <Button
          variant="ghost"
          size="xs"
          render={<Link to="/terms" />}
          nativeButton={false}
        >
          Terms of Use
        </Button>
      </nav>
    </div>
  )
}
