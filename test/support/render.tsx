import { QueryClientProvider } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import type { AnyRouter } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { RenderOptions, RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { createTestQueryClient } from './query-client'

interface RenderWithQueryOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient
}

export const renderWithQuery = (
  ui: ReactNode,
  options: RenderWithQueryOptions = {},
): RenderResult & {
  queryClient: QueryClient
  user: ReturnType<typeof userEvent.setup>
} => {
  const { queryClient = createTestQueryClient(), ...renderOptions } = options
  const result = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
    renderOptions,
  )

  return {
    ...result,
    queryClient,
    user: userEvent.setup(),
  }
}

export const renderRouter = (
  router: AnyRouter,
  options?: Omit<RenderOptions, 'wrapper'>,
): RenderResult & { user: ReturnType<typeof userEvent.setup> } => ({
  ...render(<RouterProvider router={router} />, options),
  user: userEvent.setup(),
})
