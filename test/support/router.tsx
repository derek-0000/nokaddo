import type { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory } from '@tanstack/react-router'
import { getRouter } from '#/router'
import { createTestQueryClient } from './query-client'

export function createAppTestRouter(
  initialEntry = '/',
  queryClient: QueryClient = createTestQueryClient(),
) {
  const router = getRouter({
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })

  return { queryClient, router }
}
