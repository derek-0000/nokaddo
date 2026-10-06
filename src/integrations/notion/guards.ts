import { redirect } from '@tanstack/react-router'
import { notionQueries } from './api'
import type { QueryClient } from '@tanstack/react-query'

export async function redirectAuthenticated(queryClient: QueryClient) {
  const viewer = await queryClient.ensureQueryData(notionQueries.viewer())
  if (viewer) {
    throw redirect({ to: '/app' })
  }
}

export async function redirectUnauthenticated(queryClient: QueryClient) {
  const viewer = await queryClient.ensureQueryData(notionQueries.viewer())

  if (!viewer) {
    throw redirect({
      to: '/',
      search: {
        oauthResult: undefined,
      },
    })
  }
}
