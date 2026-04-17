import * as React from 'react'
import { ChevronsUpDown, LogOut } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/primitives/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/primitives/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/primitives/sidebar'
import type { LayoutUser } from './types'

export interface NavUserProps {
  user: LayoutUser
  /** Render extra menu items between header and sign-out (e.g. `<Link>` items). */
  children?: React.ReactNode
  /** Sign-out callback. When provided, a destructive item is shown at the bottom. */
  onSignOut?: () => void
  /** Sign-out item label. Defaults to 'Cerrar sesión'. */
  signOutLabel?: string
}

/**
 * Sidebar footer user menu.
 *
 * Framework-agnostic: consumers pass children (typically `<Link>` components)
 * to populate the menu, plus a sign-out callback. The original app-specific
 * `useAuthStore` + hardcoded router links have been removed.
 */
export function NavUser({
  user,
  children,
  onSignOut,
  signOutLabel = 'Cerrar sesión',
}: NavUserProps) {
  const { isMobile } = useSidebar()

  const initials = user.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : 'U'

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size='lg'
              className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
            >
              <Avatar className='h-8 w-8 rounded-lg'>
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className='rounded-lg'>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className='grid flex-1 text-start text-sm leading-tight'>
                <span className='truncate font-semibold'>{user.name}</span>
                <span className='truncate text-xs'>{user.email}</span>
              </div>
              <ChevronsUpDown className='ms-auto size-4' />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
            side={isMobile ? 'bottom' : 'right'}
            align='end'
            sideOffset={4}
          >
            <DropdownMenuLabel className='p-0 font-normal'>
              <div className='flex items-center gap-2 px-1 py-1.5 text-start text-sm'>
                <Avatar className='h-8 w-8 rounded-lg'>
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className='rounded-lg'>
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className='grid flex-1 text-start text-sm leading-tight'>
                  <span className='truncate font-semibold'>{user.name}</span>
                  <span className='truncate text-xs'>{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            {children && <DropdownMenuSeparator />}
            {children}
            {onSignOut && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant='destructive' onClick={onSignOut}>
                  <LogOut />
                  {signOutLabel}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
