import { Loader } from 'lucide-react'

export default function RootPendingScreen() {
  return (
    <div
      className="flex h-dvh flex-col items-center justify-center overflow-hidden"
      role="status"
      aria-label="Loading"
    >
      <Loader className="w-4 h-4 text-muted-foreground animate-spin" />
    </div>
  )
}
