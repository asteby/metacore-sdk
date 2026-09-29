import { createElement, lazy, Suspense, type ComponentType } from 'react'
import { Box, Circle, createLucideIcon, type LucideIcon } from 'lucide-react'
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

type GlyphNode = [string, Record<string, string>][]
type GlyphModule = {
  default: ComponentType<{ className?: string }>
  // Lucide ≥1.3x exports the glyph's data next to the component; which name
  // depends on the release.
  __iconNode?: GlyphNode
  __iconData?: { node?: GlyphNode }
}
type IconLoaders = Record<string, () => Promise<GlyphModule>>

// The name → import() map of every Lucide glyph (~160 KB raw) loads with the
// first addon icon. A static import put it in every bundle that touches the
// package root, including each federated remote's copy of this package.
let iconLoaders: Promise<IconLoaders> | null = null
function loadIconLoaders(): Promise<IconLoaders> {
  iconLoaders ??= import('lucide-react/dynamicIconImports').then(
    (mod) => mod.default as unknown as IconLoaders,
    (err) => {
      iconLoaders = null
      throw err
    },
  )
  return iconLoaders
}

const glyphCache = new Map<string, LucideIcon>()

// Glyphs already seen are kept as data (a few hundred bytes each) so the next
// page load draws them on the first render. Without it every nav icon painted
// its fallback first and swapped once the icon map and the glyph chunk loaded.
const GLYPH_STORE_KEY = 'mc:ui:glyphs:v1'
const GLYPH_STORE_MAX = 400
const GLYPH_TAGS = new Set([
  'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g',
])

let storedGlyphs: Record<string, GlyphNode> | null = null
let glyphWriteScheduled = false

function isGlyphNode(node: unknown): node is GlyphNode {
  return (
    Array.isArray(node) &&
    node.every(
      (el) =>
        Array.isArray(el) &&
        GLYPH_TAGS.has(el[0]) &&
        el[1] !== null &&
        typeof el[1] === 'object' &&
        Object.entries(el[1]).every(
          ([k, v]) => typeof v === 'string' && !/^on|^dangerously/i.test(k),
        ),
    )
  )
}

function readStoredGlyphs(): Record<string, GlyphNode> {
  if (storedGlyphs) return storedGlyphs
  storedGlyphs = {}
  try {
    const raw = globalThis.localStorage?.getItem(GLYPH_STORE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') {
      for (const [key, node] of Object.entries(parsed)) {
        if (isGlyphNode(node)) storedGlyphs[key] = node
      }
    }
  } catch {
    /* private mode / corrupt entry: start empty */
  }
  return storedGlyphs
}

function rememberGlyph(key: string, mod: GlyphModule): void {
  const node = mod.__iconData?.node ?? mod.__iconNode
  const stored = readStoredGlyphs()
  if (stored[key] || !isGlyphNode(node)) return
  const keys = Object.keys(stored)
  if (keys.length >= GLYPH_STORE_MAX) delete stored[keys[0]]
  stored[key] = node
  // A sidebar resolves dozens of glyphs in the same tick: write once.
  if (glyphWriteScheduled) return
  glyphWriteScheduled = true
  setTimeout(() => {
    glyphWriteScheduled = false
    try {
      globalThis.localStorage?.setItem(GLYPH_STORE_KEY, JSON.stringify(readStoredGlyphs()))
    } catch {
      /* quota: the glyphs still load lazily */
    }
  }, 0)
}

function toKebab(name: string): string {
  return name
    .replace(/[\s_]+/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-zA-Z])(\d)/g, '$1-$2')
    .toLowerCase()
}

/**
 * Resolve any icon name against the full Lucide icon set. Names match
 * case-insensitively after normalising separators, so manifests may use
 * `shopping-cart`, `shopping_cart`, or `ShoppingCart` interchangeably.
 * Each glyph is its own import. A namespace import of lucide put every SVG
 * in the shell's first load.
 * A glyph this browser loaded before renders synchronously from its stored
 * data, so a reload does not flash the fallback.
 * Missing names return `fallback`; unknown ones render it, so something
 * always shows.
 */
export function resolveIconName(
  name?: string,
  fallback: LucideIcon = FALLBACK_ITEM_ICON,
): LucideIcon {
  if (!name) return fallback
  const key = toKebab(name)
  const cached = glyphCache.get(key)
  if (cached) return cached
  const stored = readStoredGlyphs()[key]
  if (stored) {
    const icon = createLucideIcon(key, stored as Parameters<typeof createLucideIcon>[1])
    glyphCache.set(key, icon)
    return icon
  }
  // Unknown names render the fallback once the map has loaded.
  const Glyph = lazy(async (): Promise<GlyphModule> => {
    const loader = (await loadIconLoaders())[key]
    if (!loader) return { default: fallback }
    const mod = await loader()
    rememberGlyph(key, mod)
    return mod
  })
  function NavIcon(props: { className?: string }) {
    return createElement(
      Suspense,
      { fallback: createElement(fallback, props) },
      createElement(Glyph, props),
    )
  }
  const icon = NavIcon as unknown as LucideIcon
  glyphCache.set(key, icon)
  return icon
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
