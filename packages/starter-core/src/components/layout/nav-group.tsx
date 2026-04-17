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

function checkIsActive(href: string, item: NavItem, mainNav = false) {
  // Type guard for NavCollapsible
  const hasItems = 'items' in item && Array.isArray(item.items)

  // 1. Exact match
  if (href === item.url) return true

  // 2. Base path match
  // Should not match if item has query params (exact match required then)
  // Should not match if href has specific filter params (f_) that weren't in item.url (distinguishes 'All' from 'Filtered')
  if (
    !item.url.includes('?') &&
    href.split('?')[0] === item.url &&
    !href.includes('?f_') &&
    !href.includes('&f_')
  ) {
    return true
  }

  // 3. Child active
  if (
    hasItems &&
    !!(item as NavCollapsible).items.filter((i: NavLink) => i.url === href)
      .length
  ) {
    return true
  }

  // 4. Main nav loose matching — compare up to 2 path segments
  // to avoid all /m/* groups opening together
  if (mainNav) {
    const hrefParts = href.split('/')
    const itemParts = item?.url?.split('/') ?? []
    const depth = hrefParts.length >= 3 && hrefParts[1] === 'm' ? 3 : 2
    const hrefPrefix = hrefParts.slice(0, depth).join('/')
    const itemPrefix = itemParts.slice(0, depth).join('/')
    if (hrefPrefix !== '' && hrefPrefix === itemPrefix) {
      return true
    }
    // Also check children for match
    if (hasItems) {
      for (const sub of (item as NavCollapsible).items) {
        const subParts = sub.url?.split('/') ?? []
        if (subParts.slice(0, depth).join('/') === hrefPrefix) {
          return true
        }
      }
    }
  }

  return false
}
