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

/**
 * Splits a URL into its path and a normalized query-string for comparison.
 * The query is normalized (params sorted, blanks dropped) so two equivalent
 * query strings compare equal regardless of param order. `f_` filter params —
 * transient data-table state, not navigation intent — are stripped so a
 * filtered table view still highlights its base nav item.
 */
function splitHref(url: string): { path: string; query: string } {
  const qIndex = url.indexOf('?')
  if (qIndex === -1) return { path: url, query: '' }
  const path = url.slice(0, qIndex)
  const params = new URLSearchParams(url.slice(qIndex + 1))
  const entries: [string, string][] = []
  for (const [k, v] of params.entries()) {
    if (k.startsWith('f_')) continue // transient table-filter state
    entries.push([k, v])
  }
  entries.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
  return { path, query: entries.map(([k, v]) => `${k}=${v}`).join('&') }
}

/**
 * Active-state matcher for a nav item against the current href.
 *
 * Query-aware so order-status style items that share a path but differ only by
 * a query param (`/m/orders?status=reception` vs `?status=delivery`) light up
 * ONE at a time instead of all together:
 *   - When an item declares query params, they must match the current href's
 *     query EXACTLY (after normalization) — a different (or absent) query is not
 *     a match.
 *   - When an item declares NO query, it matches on path alone, preserving the
 *     prior behaviour for plain links (a filtered table still highlights its
 *     base item because `f_` params are stripped).
 */
function checkIsActive(href: string, item: NavItem, mainNav = false) {
  const hasItems = 'items' in item && Array.isArray(item.items)

  const cur = splitHref(href)
  const target = splitHref(item.url)

  // Same path: an item with a query must match the query exactly; an item
  // without a query matches the path regardless of the current href's query.
  if (cur.path === target.path) {
    if (target.query) return cur.query === target.query
    return true
  }

  if (
    hasItems &&
    (item as NavCollapsibleItem).items.some(
      (i: NavLinkItem) => checkIsActive(href, i)
    )
  ) {
    return true
  }

  if (mainNav) {
    const hrefParts = cur.path.split('/')
    const itemParts = target.path.split('/')
    const depth = hrefParts.length >= 3 && hrefParts[1] === 'm' ? 3 : 2
    const hrefPrefix = hrefParts.slice(0, depth).join('/')
    const itemPrefix = itemParts.slice(0, depth).join('/')
    if (hrefPrefix !== '' && hrefPrefix === itemPrefix) {
      return true
    }
    if (hasItems) {
      for (const sub of (item as NavCollapsibleItem).items) {
        const subParts = splitHref(sub.url ?? '').path.split('/')
        if (subParts.slice(0, depth).join('/') === hrefPrefix) {
          return true
        }
      }
    }
  }

  return false
}
