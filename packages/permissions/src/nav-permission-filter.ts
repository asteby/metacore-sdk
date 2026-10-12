/**
 * Pure nav permission helpers - free of React so tests and sidebars share the
 * same gating rules.
 */
import type { CanFn } from '@asteby/metacore-runtime-react'
import { screenKeyForUrl } from './screen-capability-implies'
import type { NavItemLike } from './types'

const DYNAMIC_MODEL_URL_RE = /^\/m\/([^/?#]+)/

/**
 * Generic host-shell routes hidden from capability-limited roles. Hosts pass
 * their own set through `adminShellUrls`; this default is intentionally small.
 */
export const DEFAULT_ADMIN_SHELL_URLS: ReadonlySet<string> = new Set([
  '/users',
  '/permissions',
  '/organizations',
  '/marketplace',
  '/integrations',
  '/activity',
])

/** Per-leaf predicate (e.g. the SDK's `useNavItemVisible`). */
export type NavLeafVisible = (item: { url: string; requires?: string }) => boolean

export interface FilterNavOptions {
  /** Leaf paths the server already authorised (skip legacy probes). */
  trusted?: ReadonlySet<string>
  isItemVisible?: NavLeafVisible
  /** Routes requiring `screen.<slug>.access`. Defaults to DEFAULT_ADMIN_SHELL_URLS. */
  adminShellUrls?: ReadonlySet<string>
  /** Prefix of addon screens gated by `screen.<slug>.access`. Default `/addons/`. */
  addonUrlPrefix?: string
}

/** Roles allowed to open admin-only viewers. */
export function isAdminRole(
  role: string | undefined | null,
  roles: readonly string[] = ['owner', 'admin', 'superadmin'],
): boolean {
  return roles.includes((role ?? '').toLowerCase())
}

function navPath(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null
  return url.split(/[?#]/)[0] || null
}

/** `/m/pos_orders?f_x=1` -> `pos_orders`; non-model URLs -> null. */
export function navUrlModel(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const m = DYNAMIC_MODEL_URL_RE.exec(url)
  return m?.[1] ? decodeURIComponent(m[1]).toLowerCase() : null
}

/** Normalised key used to match a nav leaf against the server-approved set. */
export function trustKey(url: unknown): string {
  const s = typeof url === 'string' ? url : undefined
  const addon = s ? /^addon:\/\/([^/?#]+)\/?([^?#]*)/.exec(s) : null
  const resolved = addon ? `/addons/${addon[1]}/${addon[2]}`.replace(/\/+$/, '') : s
  return (navPath(resolved)?.replace(/\/+$/, '') ?? '').toLowerCase()
}

function isCollapsible<T extends NavItemLike>(
  item: T,
): item is T & { items: NavItemLike[] } {
  return Array.isArray(item.items) && item.items.length > 0
}

/** Leaf paths the server already authorised (server-filtered navigation). */
export function collectTrustedPaths(
  groups: ReadonlyArray<{ items: NavItemLike[] }>,
): Set<string> {
  const out = new Set<string>()
  const walk = (items: NavItemLike[]) => {
    for (const item of items) {
      if (isCollapsible(item)) walk(item.items)
      else {
        const k = trustKey(item.url)
        if (k) out.add(k)
      }
    }
  }
  for (const g of groups) walk(g.items)
  return out
}

/** Trusted set for a sidebar: host nav plus addon module items. */
export function sidebarTrustedPaths(
  hostGroups: ReadonlyArray<{ items: NavItemLike[] }>,
  addonModuleItems: NavItemLike[],
): Set<string> {
  return collectTrustedPaths([...hostGroups, { items: addonModuleItems }])
}

/** First leaf URL under a nav tree. */
export function firstLeafUrl(items: NavItemLike[]): string | undefined {
  for (const item of items) {
    if (isCollapsible(item)) {
      const nested = firstLeafUrl(item.items)
      if (nested) return nested
      continue
    }
    if (typeof item.url === 'string' && item.url) return item.url
  }
  return undefined
}

/**
 * Single gating point for nav items:
 * - trusted leaves skip the legacy probes
 * - `/m/<model>` requires `can(<model>.index)`
 * - addon screens require `can(screen.<slug>.access)`
 * - admin shell routes require `can(screen.<slug>.access)` (admins pass)
 * - folders require `can(folder.<key>.access)`
 * - collapsible parents follow their children
 */
export function filterNavItemsByCan<T extends NavItemLike>(
  items: T[],
  can: CanFn,
  options: FilterNavOptions = {},
): T[] {
  const {
    trusted,
    isItemVisible,
    adminShellUrls = DEFAULT_ADMIN_SHELL_URLS,
    addonUrlPrefix = '/addons/',
  } = options
  const visible: T[] = []
  for (const item of items) {
    if (item.folderKey && !can(`folder.${item.folderKey}.access`)) continue
    if (isCollapsible(item)) {
      const children = filterNavItemsByCan(item.items, can, options)
      if (children.length === 0) continue
      const url = navUrlModel(item.url)
        ? (firstLeafUrl(children) ?? children[0]?.url)
        : item.url
      visible.push({ ...item, url, items: children })
      continue
    }
    const url = typeof item.url === 'string' ? item.url : undefined
    const isTrusted = trusted?.has(trustKey(url)) ?? false
    const model = navUrlModel(url)
    if (!isTrusted && model && !can(`${model}.index`)) continue
    if (!isTrusted && !model && url?.startsWith(addonUrlPrefix)) {
      if (!can(`${screenKeyForUrl(url)}.access`)) continue
    }
    const path = navPath(url)
    if (path && adminShellUrls.has(path)) {
      if (!can(`${screenKeyForUrl(path)}.access`)) continue
    }
    if (!isTrusted && isItemVisible && url && !isItemVisible({ url, requires: item.requires })) {
      continue
    }
    visible.push(item)
  }
  return visible
}

/** Applies {@link filterNavItemsByCan} per group and drops emptied groups. */
export function filterNavGroupsByCan<G extends { items: NavItemLike[] }>(
  groups: G[],
  can: CanFn,
  options: FilterNavOptions = {},
): G[] {
  return groups
    .map((g) => ({ ...g, items: filterNavItemsByCan(g.items, can, options) }))
    .filter((g) => g.items.length > 0)
}
