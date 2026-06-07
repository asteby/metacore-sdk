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

/**
 * A badge is shown when it's a non-empty string or a non-zero number. This
 * guards the classic JSX footgun where `{0 && <Badge/>}` would render a
 * literal `0`, letting consumers pass a raw count (0 == hide) safely.
 */
function hasBadge(badge: number | string | undefined): boolean {
  if (typeof badge === 'number') return badge !== 0
  return Boolean(badge)
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
          {hasBadge(item.badge) && <NavBadge>{item.badge}</NavBadge>}
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
            {hasBadge(item.badge) && <NavBadge>{item.badge}</NavBadge>}
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
                    {hasBadge(subItem.badge) && <NavBadge>{subItem.badge}</NavBadge>}
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
            {hasBadge(item.badge) && <NavBadge>{item.badge}</NavBadge>}
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
                {hasBadge(sub.badge) && (
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
 * Splits a URL into its path, a normalized non-`f_` query-string, and its
 * normalized `f_` filter params (kept separate). Both query parts are sorted so
 * equivalent strings compare equal regardless of param order.
 *
 * `f_` params are split out rather than discarded: a base nav item (no `f_` in
 * its own URL) still ignores them — so a manually-filtered table highlights its
 * base item — but a per-status nav item that DECLARES `f_` params in its URL
 * (e.g. `/m/orders?f_status=eq:reception`) uses them as its identity so sibling
 * status entries light up one at a time instead of all together.
 */
function splitHref(url: string): {
  path: string
  query: string
  filters: string
} {
  const qIndex = url.indexOf('?')
  if (qIndex === -1) return { path: url, query: '', filters: '' }
  const path = url.slice(0, qIndex)
  const params = new URLSearchParams(url.slice(qIndex + 1))
  const entries: [string, string][] = []
  const filterEntries: [string, string][] = []
  for (const [k, v] of params.entries()) {
    if (k.startsWith('f_')) filterEntries.push([k, v])
    else entries.push([k, v])
  }
  const norm = (e: [string, string][]) =>
    e
      .sort((a, b) =>
        a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1
      )
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
  return { path, query: norm(entries), filters: norm(filterEntries) }
}

/**
 * True when every `f_` filter the item declares is present (same value) in the
 * current href's filters. An item that declares no filters always passes, so it
 * keeps highlighting regardless of transient table filtering.
 */
function declaredFiltersMatch(
  curFilters: string,
  targetFilters: string
): boolean {
  if (!targetFilters) return true
  const cur = new Set(curFilters ? curFilters.split('&') : [])
  return targetFilters.split('&').every((f) => cur.has(f))
}

/**
 * Active-state matcher for a nav item against the current href.
 *
 * Query-aware AND filter-aware so order-status style items that share a path
 * but differ only by a filter param (`/m/orders?f_status=eq:reception` vs
 * `?f_status=eq:delivered`) light up ONE at a time instead of all together:
 *   - Non-`f_` query params (real navigation intent) must match EXACTLY when the
 *     item declares them — a different (or absent) query is not a match.
 *   - `f_` filter params the item DECLARES in its own URL are its identity: they
 *     must all be present in the current href. An item that declares NO filters
 *     matches on path alone (a manually-filtered table still highlights its base
 *     item), preserving the prior behaviour for plain links.
 */
function checkIsActive(href: string, item: NavItem, mainNav = false) {
  const hasItems = 'items' in item && Array.isArray(item.items)

  const cur = splitHref(href)
  const target = splitHref(item.url)

  // Same path: real (non-f_) query must match exactly when declared; declared
  // f_ filters must all be present in the current href; an item with neither
  // matches the path regardless of the current href's query/filters.
  if (cur.path === target.path) {
    if (target.query && cur.query !== target.query) return false
    return declaredFiltersMatch(cur.filters, target.filters)
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
