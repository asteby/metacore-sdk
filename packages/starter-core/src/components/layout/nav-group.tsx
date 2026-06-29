import { type ReactNode } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
} from '@/components/ui/sidebar'
import { Badge } from '../ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { api } from '@/lib/api'
import { useMetadataCache } from '@/stores/metadata-cache'

// Track which models have already had prefetch requests fired
const prefetchedModels = new Set<string>()

/**
 * Extract model name from a sidebar URL like "/m/customers" -> "customers".
 * Returns null for non-model URLs.
 */
function extractModelFromUrl(url: string): string | null {
  const match = url.match(/^\/m\/([a-z_]+)/)
  return match ? match[1] : null
}

/**
 * Prefetch metadata and first page of data for a model on hover.
 * Fire-and-forget: errors are silently ignored.
 */
function prefetchModel(url: string) {
  const model = extractModelFromUrl(url)
  if (!model) return
  if (prefetchedModels.has(model)) return

  const { hasMetadata, setMetadata } = useMetadataCache.getState()

  prefetchedModels.add(model)

  // Prefetch metadata if not already in cache
  if (!hasMetadata(model)) {
    api.get(`/metadata/table/${model}`).then((res) => {
      setMetadata(model, res.data)
    }).catch(() => {})
  }

  // Prefetch first page of data
  api.get(`/data/${model}/me`, { params: { page: 1, per_page: 15 } }).catch(() => {})
}

// Local type definitions for navigation items
interface NavLink {
  title: string
  url: string
  icon?: LucideIcon
  badge?: string
}

interface NavCollapsible extends NavLink {
  items: NavLink[]
}

type NavItem = NavLink | NavCollapsible

interface NavGroup {
  title: string
  items: NavItem[]
}

export function NavGroup({ title, items }: NavGroup) {
  const { state, isMobile } = useSidebar()
  const href = useLocation({ select: (location) => location.href })

  // Navigation comes pre-filtered by permissions from the backend
  if (items.length === 0) return null

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item: NavItem) => {
          const key = `${item.title}-${item.url}`

          // Type guard: check if item has 'items' property (NavCollapsible)
          const isCollapsible = 'items' in item && Array.isArray(item.items)

          if (!isCollapsible)
            return <SidebarMenuLink key={key} item={item} href={href} />

          if (state === 'collapsed' && !isMobile)
            return (
              <SidebarMenuCollapsedDropdown key={key} item={item as NavCollapsible} href={href} />
            )

          return <SidebarMenuCollapsible key={key} item={item as NavCollapsible} href={href} />
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

function NavBadge({ children }: { children: ReactNode }) {
  return <Badge className='rounded-full px-1 py-0 text-xs'>{children}</Badge>
}

function SidebarMenuLink({ item, href }: { item: NavLink; href: string }) {
  const { setOpenMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={checkIsActive(href, item)}
        tooltip={item.title}
      >
        <Link to={item.url} onClick={() => setOpenMobile(false)} onMouseEnter={() => prefetchModel(item.url)}>
          {item.icon && <item.icon />}
          <span>{item.title}</span>
          {item.badge && <NavBadge>{item.badge}</NavBadge>}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

function SidebarMenuCollapsible({
  item,
  href,
}: {
  item: NavCollapsible
  href: string
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
            {item.items.map((subItem: NavLink) => (
              <SidebarMenuSubItem key={subItem.title}>
                <SidebarMenuSubButton
                  asChild
                  isActive={checkIsActive(href, subItem)}
                >
                  <Link to={subItem.url} onClick={() => setOpenMobile(false)} onMouseEnter={() => prefetchModel(subItem.url)}>
                    {subItem.icon && <subItem.icon />}
                    <span>{subItem.title}</span>
                    {subItem.badge && <NavBadge>{subItem.badge}</NavBadge>}
                  </Link>
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
}: {
  item: NavCollapsible
  href: string
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
          {item.items.map((sub: NavLink) => (
            <DropdownMenuItem key={`${sub.title}-${sub.url}`} asChild>
              <Link
                to={sub.url}
                className={`${checkIsActive(href, sub) ? 'bg-secondary' : ''}`}
                onMouseEnter={() => prefetchModel(sub.url)}
              >
                {sub.icon && <sub.icon />}
                <span className='max-w-52 text-wrap'>{sub.title}</span>
                {sub.badge && (
                  <span className='ms-auto text-xs'>{sub.badge}</span>
                )}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

// Query params that select WHICH surface a model renders (table vs board) and
// how it's grouped — the *identity* of a view-style nav item. Two navs over the
// same model/path ("Board" `?view=kanban&group_by=stage` vs "Issues"
// `?view=list`) are mutually exclusive, so exactly one may be active.
const VIEW_PARAMS = new Set(['view', 'group_by'])

// View buckets that all denote the same DEFAULT surface a model paints when the
// URL carries no explicit `view` (a bare landing, `?view=list` and `?view=table`
// are interchangeable). Two buckets are "default-equivalent" when both are here,
// so the Issues/list nav lights on the bare landing while the Board
// (`?view=kanban`, never here) stays mutually exclusive.
const DEFAULT_VIEW_BUCKETS = new Set(['', 'view=list', 'view=table'])
const isDefaultViewBucket = (view: string) => DEFAULT_VIEW_BUCKETS.has(view)

/**
 * Splits a URL into its path and three normalized, sorted query buckets:
 * `view` (view/group_by surface identity — exclusive), `filters` (`f_` params —
 * subset semantics) and `query` (everything else — transient page/sort/search).
 */
function splitHref(url: string): {
  path: string
  view: string
  query: string
  filters: string
} {
  const qIndex = url.indexOf('?')
  if (qIndex === -1) return { path: url, view: '', query: '', filters: '' }
  const path = url.slice(0, qIndex)
  const params = new URLSearchParams(url.slice(qIndex + 1))
  const entries: [string, string][] = []
  const viewEntries: [string, string][] = []
  const filterEntries: [string, string][] = []
  for (const [k, v] of params.entries()) {
    if (k.startsWith('f_')) filterEntries.push([k, v])
    else if (VIEW_PARAMS.has(k)) viewEntries.push([k, v])
    else entries.push([k, v])
  }
  const norm = (e: [string, string][]) =>
    e
      .sort((a, b) =>
        a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1
      )
      .map(([k, v]) => `${k}=${v}`)
      .join('&')
  return {
    path,
    view: norm(viewEntries),
    query: norm(entries),
    filters: norm(filterEntries),
  }
}

/** Every `f_` filter the item declares must be present in the current href. */
function declaredFiltersMatch(curFilters: string, targetFilters: string): boolean {
  if (!targetFilters) return true
  const cur = new Set(curFilters ? curFilters.split('&') : [])
  return targetFilters.split('&').every((f) => cur.has(f))
}

/**
 * Active-state matcher. View-aware, query-aware AND filter-aware so sibling
 * navs over the same model light up ONE at a time:
 *   - `view`/`group_by` must match EXACTLY in both directions (Board vs Issues).
 *   - other non-`f_` query (page/sort/search) must match only when declared.
 *   - declared `f_` filters must all be present; an item with none matches the
 *     path alone (a manually-filtered table still highlights its base item).
 */
function checkIsActive(href: string, item: NavItem, mainNav = false) {
  const hasItems = 'items' in item && Array.isArray(item.items)

  const cur = splitHref(href)
  const target = splitHref(item.url)

  // Same path matches only on exact view-identity + declared query + declared
  // f_ filters; otherwise fall through so a collapsible parent can still be
  // active via a matching child.
  const viewMatches =
    cur.view === target.view ||
    (isDefaultViewBucket(cur.view) && isDefaultViewBucket(target.view))

  if (
    cur.path === target.path &&
    viewMatches &&
    (!target.query || cur.query === target.query) &&
    declaredFiltersMatch(cur.filters, target.filters)
  ) {
    return true
  }

  // Child active
  if (
    hasItems &&
    (item as NavCollapsible).items.some((i: NavLink) => checkIsActive(href, i))
  ) {
    return true
  }

  // Main nav loose matching — compare up to 2-3 path segments to avoid all
  // /m/* groups opening together.
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
      for (const sub of (item as NavCollapsible).items) {
        const subParts = splitHref(sub.url ?? '').path.split('/')
        if (subParts.slice(0, depth).join('/') === hrefPrefix) {
          return true
        }
      }
    }
  }

  return false
}
