import * as React from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/primitives/avatar'
import { Button } from '@/primitives/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/primitives/dropdown-menu'
import type { LayoutUser } from './types'

export interface ProfileDropdownProps {
  user: LayoutUser | null | undefined
  /** Fallback avatar initials label if name is missing. */
  fallbackInitials?: string
  /** Menu body (typically `<DropdownMenuItem>` entries with router links). */
  children?: React.ReactNode
}

/**
 * Compact user menu shown in the top-right of the header.
 *
 * The original app coupled this to an auth store + hardcoded router `<Link>`
 * items; in the SDK version the consumer supplies the user object and populates
 * the menu via `children`.
 */
export function ProfileDropdown({
  user,
  fallbackInitials = 'U',
  children,
}: ProfileDropdownProps) {
  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase()
    : fallbackInitials

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' className='relative h-8 w-8 rounded-full'>
          <Avatar className='h-8 w-8'>
            <AvatarImage src={user?.avatar} alt={user?.name || 'user'} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56' align='end' forceMount>
        <DropdownMenuLabel className='font-normal'>
          <div className='flex flex-col gap-1.5'>
            <p className='text-sm leading-none font-medium'>
              {user?.name || 'Usuario'}
            </p>
            <p className='text-muted-foreground text-xs leading-none'>
              {user?.email || 'usuario@ejemplo.com'}
            </p>
          </div>
        </DropdownMenuLabel>
        {children && <DropdownMenuSeparator />}
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
