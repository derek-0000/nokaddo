import { Loader } from 'lucide-react'

export default function RoutePendingScreen() {
  return (
    <div
      className="flex h-full flex-col items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  )
}
