import { QueryClient } from '@tanstack/react-query'

const trackedQueryClients = new Set<QueryClient>()

export const createTestQueryClient = (): QueryClient => {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        retry: false,
      },
    },
  })

  trackedQueryClients.add(queryClient)
  return queryClient
}

export const disposeTrackedQueryClients = async (): Promise<void> => {
  for (const queryClient of trackedQueryClients) {
    await queryClient.cancelQueries()
    queryClient.clear()
  }

  trackedQueryClients.clear()
}
