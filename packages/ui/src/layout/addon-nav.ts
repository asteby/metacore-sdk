import { Box, Circle, icons as lucideIcons, type LucideIcon } from 'lucide-react'
import type { NavCollapsibleItem, NavLinkItem } from './types'

/**
 * Generic, host-agnostic helpers that make ANY installed addon render as a
 * first-class, polished sidebar module — with zero effort from the addon
 * author. The whole metacore ecosystem inherits these defaults:
 *
 *   - icons resolve against the full Lucide set (no hand-maintained allowlist),
 *     falling back to a neutral glyph so a nav entry is NEVER icon-less;
 *   - untranslated namespaced i18n keys (`customers.nav.invoices`) degrade to a
 *     humanized label ("Invoices") instead of leaking the raw key;
 *   - an addon nav group becomes a single collapsible parent item (icon +
 *     chevron, children indented) — the shape `<NavGroup>` renders as a
 *     dropdown — so installed addons look like native modules.
 */

/** Neutral fallback icon for a group/module header that declares none. */
export const FALLBACK_GROUP_ICON: LucideIcon = Box
/** Neutral fallback icon for a child nav item that declares none. */
export const FALLBACK_ITEM_ICON: LucideIcon = Circle

const ICONS = lucideIcons as Record<string, LucideIcon>

/**
 * Resolve any icon name against the full Lucide icon set. Names match
 * case-insensitively after normalising separators, so manifests may use
 * `shopping-cart`, `shopping_cart`, or `ShoppingCart` interchangeably.
 * Returns `fallback` for missing/unknown names so something always renders.
 */
export function resolveIconName(
  name?: string,
  fallback: LucideIcon = FALLBACK_ITEM_ICON,
): LucideIcon {
  if (!name) return fallback
  const direct = ICONS[name]
  if (direct) return direct
  const pascal = name
    .replace(/[\s_-]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
  return ICONS[pascal] ?? fallback
}

/** Matches a namespaced i18n key like `customers.nav.invoices` (≥1 dot). */
const NAMESPACED_KEY_RE = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i

/**
 * Humanize the last segment of a (possibly namespaced) i18n key:
 *   `customers.nav.invoices` → "Invoices"
 *   `sales_orders`           → "Sales Orders"
 */
export function humanizeNavKey(key: string): string {
  const last = key.split('.').pop() ?? key
  return last
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Translate a nav title with a generic safety net: run it through `t()`, and
 * if the result is unchanged (key not found — common for a third-party addon
 * whose i18n bundle hasn't loaded) AND it looks namespaced, fall back to the
 * humanized last segment so the UI never shows a raw `a.b.c` key.
 */
export function translateNavTitle(
  title: string,
  t: (key: string) => string,
): string {
  const translated = t(title)
  if (translated !== title) return translated
  if (NAMESPACED_KEY_RE.test(title)) return humanizeNavKey(title)
  return title
}

/** Minimal shape of an addon-declared nav item (subset of the manifest type). */
export interface AddonNavItemLike {
  title: string
  icon?: string
  url?: string
  items?: AddonNavItemLike[]
}

/** Minimal shape of an addon-declared nav group (subset of the manifest type). */
export interface AddonNavGroupLike {
  title: string
  icon?: string
  items: AddonNavItemLike[]
}

/**
 * Convert an addon nav group into a single collapsible parent item — the shape
 * `<NavGroup>` renders as a dropdown (icon + chevron, indented children).
 *
 * `resolveUrl` maps an addon item to a host-routable URL (the host owns route
 * layout / model→table resolution). Icons fall back to neutral defaults on both
 * the parent and every child, so a bare third-party addon still looks polished.
 * The parent's `url` points at its first child for active-state matching and
 * for the collapsed (icon-only) dropdown trigger.
 */
export function addonGroupToCollapsibleItem(
  group: AddonNavGroupLike,
  resolveUrl: (item: AddonNavItemLike) => string,
): NavCollapsibleItem {
  const items: NavLinkItem[] = group.items.map((item) => ({
    title: item.title,
    url: resolveUrl(item),
    icon: resolveIconName(item.icon, FALLBACK_ITEM_ICON),
  }))
  return {
    title: group.title,
    url: items[0]?.url ?? '#',
    icon: resolveIconName(group.icon, FALLBACK_GROUP_ICON),
    items,
  }
}
