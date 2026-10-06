import type { ReactNode } from 'react'
import BackNavigation from '#/components/ui/back-navigation'

type LegalPageProps = {
  title: string
  children: ReactNode
}

export default function LegalPage({ title, children }: LegalPageProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-4 px-4 py-8">
      <BackNavigation label="のカード" to="/" />
      <h1 className="text-lg font-medium text-foreground">{title}</h1>
      <div className="flex flex-col gap-3 text-sm text-muted-foreground">
        {children}
      </div>
    </main>
  )
}
