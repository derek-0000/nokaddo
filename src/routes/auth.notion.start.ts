import { createFileRoute } from '@tanstack/react-router'
import { beginNotionAuthorization } from '#/integrations/notion/oauth-server'

export const Route = createFileRoute('/auth/notion/start')({
  server: {
    handlers: {
      GET: async () => await beginNotionAuthorization(),
    },
  },
})
