import { Link } from '@tanstack/react-router'
import { FileQuestion } from 'lucide-react'
import { Button } from '#/components/ui/button'
import StatusScreen from '#/components/views/status-screen'

export default function RootNotFoundScreen() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center overflow-hidden">
      <StatusScreen
        icon={FileQuestion}
        title="Page not found"
        description="The page you are looking for does not exist."
        actions={
          <Button
            render={<Link to="/" search={{ oauthResult: undefined }} />}
            nativeButton={false}
            variant="soft"
            size="xs"
          >
            Go home
          </Button>
        }
      />
    </div>
  )
}
