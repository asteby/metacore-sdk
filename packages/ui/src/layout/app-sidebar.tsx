import * as React from 'react'
import { type LucideIcon, Building2 } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/primitives/sidebar'
import { Skeleton } from '@/primitives/skeleton'
import { NavGroup, type NavLinkComponent } from './nav-group'
import type { NavGroupData } from './types'

export interface AppSidebarProps {
  /** Navigation groups (already translated). */
  navGroups: NavGroupData[]
  /** Current URL href — used to highlight active items. */
  currentHref: string
  /** Link component compatible with the consumer's router. */
  LinkComponent: NavLinkComponent
  /** Loading state for nav groups — shows skeleton placeholder. */
  isLoading?: boolean
  /** Sidebar header slot (typically a team switcher / organization card). */
  header?: React.ReactNode
  /** Sidebar footer slot (typically a branch-switcher or nav-user). */
  footer?: React.ReactNode
  /** Optional hover handler for prefetching data. */
  onItemHover?: (url: string) => void
  /** `<Sidebar>` `collapsible` prop. Defaults to 'offcanvas'. */
  collapsible?: 'offcanvas' | 'icon' | 'none'
  /** `<Sidebar>` `variant` prop. Defaults to 'sidebar'. */
  variant?: 'sidebar' | 'floating' | 'inset'
}

/**
 * Skeleton-ready sidebar shell. The original app's `useLayout`, `useAuthStore`,
 * `useNavigation` (api-backed), and `useAddonSidebar` hooks were stripped — the
 * consumer now passes `navGroups`, `isLoading`, and optional `header`/`footer`
 * slots directly.
 */
export function AppSidebar({
  navGroups,
  currentHref,
  LinkComponent,
  isLoading = false,
  header,
  footer,
  onItemHover,
  collapsible = 'offcanvas',
  variant = 'sidebar',
}: AppSidebarProps) {
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      {header && <SidebarHeader>{header}</SidebarHeader>}

      <SidebarContent>
        {isLoading ? (
          <SidebarSkeletonContent />
        ) : (
          navGroups.map((group) => (
            <NavGroup
              key={group.title}
              {...group}
              currentHref={currentHref}
              LinkComponent={LinkComponent}
              onItemHover={onItemHover}
            />
          ))
        )}
      </SidebarContent>

      {footer && <SidebarFooter>{footer}</SidebarFooter>}
      <SidebarRail />
    </Sidebar>
  )
}

function SidebarSkeletonContent() {
  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>
          <Skeleton className='h-3 w-16' />
        </SidebarGroupLabel>
        <SidebarMenu>
          {Array.from({ length: 4 }).map((_, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuButton className='pointer-events-none'>
                <Skeleton className='h-4 w-4 rounded' />
                <Skeleton className='h-3 w-24' />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>
          <Skeleton className='h-3 w-20' />
        </SidebarGroupLabel>
        <SidebarMenu>
          {Array.from({ length: 5 }).map((_, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuButton className='pointer-events-none'>
                <Skeleton className='h-4 w-4 rounded' />
                <Skeleton className='h-3 w-28' />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>
          <Skeleton className='h-3 w-14' />
        </SidebarGroupLabel>
        <SidebarMenu>
          {Array.from({ length: 3 }).map((_, i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuButton className='pointer-events-none'>
                <Skeleton className='h-4 w-4 rounded' />
                <Skeleton className='h-3 w-20' />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
    </>
  )
}

/**
 * Default organization header card — lifted from `layout/organization.tsx`.
 * Consumers can use this directly or render their own `header` slot.
 */
export function OrganizationCard({
  name,
  logo: Logo = Building2,
  plan,
}: {
  name: string
  logo?: LucideIcon | string
  plan: string
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size='lg'
          className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
        >
          <div className='bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg'>
            {typeof Logo === 'string' ? (
              <img
                src={Logo}
                alt={name}
                className='size-6 rounded-md object-cover'
              />
            ) : (
              <Logo className='size-4' />
            )}
          </div>
          <div className='grid flex-1 text-start text-sm leading-tight'>
            <span className='truncate font-semibold'>{name}</span>
            <span className='truncate text-xs'>{plan}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
