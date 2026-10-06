import { useEffect } from 'react'
import { useMutation, useQueryErrorResetBoundary } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import StatusScreen from './status-screen'
import { Button } from '#/components/ui/button'
import { notionMutations } from '#/integrations/notion/api'
import { assignBrowserLocation } from '#/lib/browser-navigation'
import { toPublicError } from '#/lib/errors'

type NotionRouteErrorScreenProps = {
  error: unknown
  title: string
}

export default function NotionRouteErrorScreen({
  error,
  title,
}: NotionRouteErrorScreenProps) {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()
  const reauthorization = useMutation(notionMutations.reauthorize())
  const publicError = toPublicError(error)
  const displayedError = reauthorization.isError
    ? toPublicError(reauthorization.error)
    : publicError
  const needsReconnect =
    publicError.code === 'reauth_required' ||
    publicError.code === 'unauthenticated'

  useEffect(() => {
    queryErrorResetBoundary.reset()
  }, [queryErrorResetBoundary])

  const authorizeMoreDatasets = () => {
    reauthorization.mutate(undefined, {
      onSuccess: ({ authorizationUrl }) => {
        assignBrowserLocation(authorizationUrl)
      },
    })
  }

  return (
    <div role="alert">
      <StatusScreen
        icon={TriangleAlert}
        tone="error"
        title={title}
        description={displayedError.message}
        actions={
          needsReconnect ? (
            <Button
              variant="soft"
              size="xs"
              onClick={authorizeMoreDatasets}
              disabled={reauthorization.isPending}
            >
              <RefreshCw className="h-4 w-4" /> Reconnect Notion
            </Button>
          ) : publicError.retryable ? (
            <Button
              variant="soft"
              size="xs"
              onClick={() => void router.invalidate()}
            >
              <RefreshCw className="h-4 w-4" /> Try again
            </Button>
          ) : null
        }
      />
    </div>
  )
}
