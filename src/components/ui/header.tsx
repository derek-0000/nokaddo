import { Avatar, AvatarFallback, AvatarImage } from './avatar'
import { Button } from './button'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import ThemeToggle from './theme-toggle'
import { useUser } from '#/integrations/notion/use-user'
import { toPublicError } from '#/lib/errors'
import { Link } from '@tanstack/react-router'
import { Coffee, FileText, LogOut, Shield } from 'lucide-react'

export default function Header() {
  const { user, signOut, isSigningOut, signOutError } = useUser()

  return (
    <header className="absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-background/50 px-2 backdrop-blur-xl">
      <Link to="/app" className="relative font-hachi text-sm text-foreground">
        のカード
      </Link>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Popover>
          <PopoverTrigger className="cursor-pointer" aria-label="User menu">
            <Avatar>
              {user?.avatarUrl ? (
                <AvatarImage src={user.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback aria-hidden="true">
                {user?.name?.slice(0, 1) ?? '?'}
              </AvatarFallback>
            </Avatar>
          </PopoverTrigger>
          <PopoverContent className="max-w-42 p-1" aria-label="User actions">
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                className="justify-start"
                onClick={signOut}
                disabled={isSigningOut}
              >
                <LogOut /> Sign out
              </Button>
              <Button
                variant="ghost"
                className="justify-start"
                render={
                  <a
                    href="https://ko-fi.com/E1I5207CZJ"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                <Coffee /> Sponsor
              </Button>
              <Button
                variant="ghost"
                className="justify-start"
                render={<Link to="/privacy" />}
                nativeButton={false}
              >
                <Shield /> Privacy Policy
              </Button>
              <Button
                variant="ghost"
                className="justify-start"
                render={<Link to="/terms" />}
                nativeButton={false}
              >
                <FileText /> Terms of Use
              </Button>
              {signOutError ? (
                <p role="alert" className="text-destructive text-xs">
                  {toPublicError(signOutError).message}
                </p>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </header>
  )
}
