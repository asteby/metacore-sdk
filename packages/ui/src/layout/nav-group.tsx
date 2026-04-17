import * as React from 'react'
import { type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/primitives/collapsible'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/primitives/sidebar'
import { Badge } from '@/primitives/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/primitives/dropdown-menu'
import type { NavGroupData, NavItem, NavLinkItem, NavCollapsibleItem } from './types'

export type NavLinkComponent = React.ComponentType<
  React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    to: string
    children?: React.ReactNode
  }
>

export type NavGroupProps = NavGroupData & {
  /**
   * Current URL href (typically `useLocation().href` from tanstack-router).
   * Used to highlight active items.
   */
  currentHref: string
  /**
   * Component used to render internal links. Pass the tanstack-router `<Link>`
   * or a wrapper around your framework's link component. Must accept `to` and
   * forward standard anchor props.
   */
  LinkComponent: NavLinkComponent
  /** Optional hover handler for prefetching data (no-op by default). */
  onItemHover?: (url: string) => void
}

export function NavGroup({
  title,
  items,
  currentHref,
  LinkComponent,
  onItemHover,
}: NavGroupProps) {
  const { state, isMobile } = useSidebar()

  if (items.length === 0) return null

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item: NavItem) => {
          const key = `${item.title}-${item.url}`
          const isCollapsible = 'items' in item && Array.isArray(item.items)

          if (!isCollapsible)
            return (
              <SidebarMenuLink
                key={key}
                item={item}
                href={currentHref}
                LinkComponent={LinkComponent}
                onItemHover={onItemHover}
              />
            )

          if (state === 'collapsed' && !isMobile)
            return (
              <SidebarMenuCollapsedDropdown
                key={key}
                item={item as NavCollapsibleItem}
                href={currentHref}
                LinkComponent={LinkComponent}
                onItemHover={onItemHover}
              />
            )

          return (
            <SidebarMenuCollapsible
              key={key}
              item={item as NavCollapsibleItem}
              href={currentHref}
              LinkComponent={LinkComponent}
              onItemHover={onItemHover}
            />
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function NavBadge({ children }: { children: ReactNode }) {
  return <Badge className='rounded-full px-1 py-0 text-xs'>{children}</Badge>
}

function SidebarMenuLink({
  item,
  href,
  LinkComponent,
  onItemHover,
}: {
  item: NavLinkItem
  href: string
  LinkComponent: NavLinkComponent
  onItemHover?: (url: string) => void
}) {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={checkIsActive(href, item)}
        tooltip={item.title}
      >
        <LinkComponent
          to={item.url}
          onClick={() => setOpenMobile(false)}
          onMouseEnter={() => onItemHover?.(item.url)}
        >
          {item.icon && <item.icon />}
          <span>{item.title}</span>
          {item.badge && <NavBadge>{item.badge}</NavBadge>}
        </LinkComponent>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function SidebarMenuCollapsible({
  item,
  href,
  LinkComponent,
  onItemHover,
}: {
  item: NavCollapsibleItem
  href: string
  LinkComponent: NavLinkComponent
  onItemHover?: (url: string) => void
}) {
  const { setOpenMobile } = useSidebar()
  return (
    <Collapsible
      asChild
      defaultOpen={checkIsActive(href, item, true)}
      className='group/collapsible'
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title}>
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            {item.badge && <NavBadge>{item.badge}</NavBadge>}
            <ChevronRight className='ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 rtl:rotate-180' />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className='CollapsibleContent'>
          <SidebarMenuSub>
            {item.items.map((subItem: NavLinkItem) => (
              <SidebarMenuSubItem key={subItem.title}>
                <SidebarMenuSubButton
                  asChild
                  isActive={checkIsActive(href, subItem)}
                >
                  <LinkComponent
                    to={subItem.url}
                    onClick={() => setOpenMobile(false)}
                    onMouseEnter={() => onItemHover?.(subItem.url)}
                  >
                    {subItem.icon && <subItem.icon />}
                    <span>{subItem.title}</span>
                    {subItem.badge && <NavBadge>{subItem.badge}</NavBadge>}
                  </LinkComponent>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

function SidebarMenuCollapsedDropdown({
  item,
  href,
  LinkComponent,
  onItemHover,
}: {
  item: NavCollapsibleItem
  href: string
  LinkComponent: NavLinkComponent
  onItemHover?: (url: string) => void
}) {
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={checkIsActive(href, item)}
          >
            {item.icon && <item.icon />}
            <span>{item.title}</span>
            {item.badge && <NavBadge>{item.badge}</NavBadge>}
            <ChevronRight className='ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90' />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side='right' align='start' sideOffset={4}>
          <DropdownMenuLabel>
            {item.title} {item.badge ? `(${item.badge})` : ''}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {item.items.map((sub: NavLinkItem) => (
            <DropdownMenuItem key={`${sub.title}-${sub.url}`} asChild>
              <LinkComponent
                to={sub.url}
                className={`${checkIsActive(href, sub) ? 'bg-secondary' : ''}`}
                onMouseEnter={() => onItemHover?.(sub.url)}
              >
                {sub.icon && <sub.icon />}
                <span className='max-w-52 text-wrap'>{sub.title}</span>
                {sub.badge && (
                  <span className='ms-auto text-xs'>{sub.badge}</span>
                )}
              </LinkComponent>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

function checkIsActive(href: string, item: NavItem, mainNav = false) {
  const hasItems = 'items' in item && Array.isArray(item.items)

  if (href === item.url) return true

  if (
    !item.url.includes('?') &&
    href.split('?')[0] === item.url &&
    !href.includes('?f_') &&
    !href.includes('&f_')
  ) {
    return true
  }

  if (
    hasItems &&
    !!(item as NavCollapsibleItem).items.filter(
      (i: NavLinkItem) => i.url === href
    ).length
  ) {
    return true
  }

  if (mainNav) {
    const hrefParts = href.split('/')
    const itemParts = item?.url?.split('/') ?? []
    const depth = hrefParts.length >= 3 && hrefParts[1] === 'm' ? 3 : 2
    const hrefPrefix = hrefParts.slice(0, depth).join('/')
    const itemPrefix = itemParts.slice(0, depth).join('/')
    if (hrefPrefix !== '' && hrefPrefix === itemPrefix) {
      return true
    }
    if (hasItems) {
      for (const sub of (item as NavCollapsibleItem).items) {
        const subParts = sub.url?.split('/') ?? []
        if (subParts.slice(0, depth).join('/') === hrefPrefix) {
          return true
        }
      }
    }
  }

  return false
}
