import { createFileRoute, Outlet } from '@tanstack/react-router'
import { redirectUnauthenticated } from '#/integrations/notion/guards'
import Header from '#/components/ui/header'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context }) =>
    await redirectUnauthenticated(context.queryClient),
  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <div className="relative h-dvh overflow-hidden overscroll-none">
      <Header />
      <main className="h-full min-h-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
