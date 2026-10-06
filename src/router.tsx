import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import type { RouterHistory } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { getContext } from './integrations/tanstack-query/root-provider'

type AppRouterOptions = {
  context?: ReturnType<typeof getContext>
  history?: RouterHistory
}

export function getRouter(options: AppRouterOptions = {}) {
  const context = options.context ?? getContext()

  const router = createTanStackRouter({
    routeTree,
    context,
    history: options.history,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
