import { Link, createRootRouteWithContext } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { Button } from '#/components/ui/button'
import RootDocument from '#/components/views/root-document'
import RootNotFoundScreen from '#/components/views/root-not-found-screen'
import RootPendingScreen from '#/components/views/root-pending-screen'
import StatusScreen from '#/components/views/status-screen'
import { toPublicError } from '#/lib/errors'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Nokaddo',
      },
      {
        name: 'apple-mobile-web-app-title',
        content: 'MyWebSite',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'icon',
        type: 'image/png',
        href: '/favicon-96x96.png',
        sizes: '96x96',
      },
      {
        rel: 'icon',
        type: 'image/svg+xml',
        href: '/favicon.svg',
      },
      {
        rel: 'shortcut icon',
        href: '/favicon.ico',
      },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      {
        rel: 'manifest',
        href: '/site.webmanifest',
      },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFoundScreen,
  pendingComponent: RootPendingScreen,
})

function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  const publicError = toPublicError(error)

  return (
    <div className="flex h-dvh flex-col items-center justify-center overflow-hidden">
      <StatusScreen
        icon={TriangleAlert}
        tone="error"
        title="Something went wrong"
        description={publicError.message}
        actions={
          <>
            {publicError.retryable ? (
              <Button variant="soft" size="xs" onClick={() => reset()}>
                Try again
              </Button>
            ) : null}
            <Button
              render={<Link to="/" search={{ oauthResult: undefined }} />}
              nativeButton={false}
              variant="ghost"
              size="xs"
            >
              Go home
            </Button>
          </>
        }
      />
    </div>
  )
}
