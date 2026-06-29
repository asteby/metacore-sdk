// Pure, React-free active-state matcher for sidebar nav items. Extracted from
// `nav-group.tsx` so it can be unit-tested without a DOM and reused by any
// host that builds its own nav surface.
//
// The matcher is view-aware, query-aware AND filter-aware so sibling navs over
// the same model light up ONE at a time. See `checkIsActive` for the rules.
import type { NavItem, NavLinkItem, NavCollapsibleItem } from './types'

/**
 * Query params that select WHICH surface a model renders (table vs board) and
 * how it's grouped. They are the *identity* of a view-style nav item: two navs
 * over the same model/path (e.g. "Board" `?view=kanban&group_by=stage` and
 * "Issues" `?view=list`) are mutually exclusive, so exactly one may be active.
 * Kept separate from transient query (page/sort/search) and from `f_` filters.
 */
export const VIEW_PARAMS = new Set(['view', 'group_by'])

/**
 * The view-bucket strings that all denote the SAME default surface a model
 * paints when the current URL declares no explicit `view`. `DynamicView`
 * resolves a missing `?view=` to the model's `metadata.view_type`, whose
 * non-kanban catch-all is the table/list (`resolveViewRenderer`). So a bare
 * landing (`/m/x?per_page=15`, no `view`), an explicit `?view=list` and an
 * explicit `?view=table` are interchangeable identities of the default item.
 *
 * Two view buckets are "default-equivalent" when BOTH are in this set: this is
 * what lets the Issues/list nav light up on the bare default landing while the
 * Board (`?view=kanban`) — never in this set — stays mutually exclusive, so the
 * board is never lit by a view-less URL and vice-versa.
 */
const DEFAULT_VIEW_BUCKETS = new Set(['', 'view=list', 'view=table'])

function isDefaultViewBucket(view: string): boolean {
  return DEFAULT_VIEW_BUCKETS.has(view)
}

export interface SplitHref {
  path: string
  view: string
  query: string
  filters: string
}

/**
 * Splits a URL into its path and three normalized, sorted query buckets:
 *   - `view`    — the `view`/`group_by` surface-identity params (exclusive).
 *   - `filters` — the `f_` filter params (subset/refinement semantics).
 *   - `query`   — everything else (transient: page/sort/search).
 * Sorting each bucket makes equivalent strings compare equal regardless of
 * param order.
 *
 * The split lets the matcher treat each class with the right semantics: `view`
 * params must match EXACTLY in both directions (so a query-less default item
 * does NOT stay lit when a sibling board is open, and vice-versa); `f_` params
 * a base nav item omits are ignored (a manually-filtered table still highlights
 * its base item) while a per-status entry that DECLARES `f_` uses them as its
 * identity; transient `query` is ignored unless the item itself declares it.
 */
export function splitHref(url: string): SplitHref {
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

/**
 * True when every `f_` filter the item declares is present (same value) in the
 * current href's filters. An item that declares no filters always passes, so it
 * keeps highlighting regardless of transient table filtering.
 */
export function declaredFiltersMatch(
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
 * View-aware, query-aware AND filter-aware so sibling navs over the same model
 * light up ONE at a time:
 *   - `view`/`group_by` surface params must match EXACTLY in both directions.
 *     This is what keeps "Board" (`?view=kanban&group_by=stage`) and "Issues"
 *     (`?view=list`, or a query-less default) mutually exclusive — only the item
 *     whose view identity equals the current href stays active.
 *   - Other non-`f_` query params (page/sort/search) must match EXACTLY only
 *     when the item declares them — transient query never un-highlights a plain
 *     link.
 *   - `f_` filter params the item DECLARES in its own URL are its identity: they
 *     must all be present in the current href. An item that declares NO filters
 *     matches on path alone (a manually-filtered table still highlights its base
 *     item), preserving the prior behaviour for plain links.
 */
export function checkIsActive(href: string, item: NavItem, mainNav = false): boolean {
  const hasItems = 'items' in item && Array.isArray(item.items)

  const cur = splitHref(href)
  const target = splitHref(item.url)

  // Same path: this item matches only when the view-identity (view/group_by)
  // matches exactly (sibling surfaces are mutually exclusive), transient query
  // matches when declared, and declared f_ filters are all present. A same-path
  // item that DOESN'T match falls through (a collapsible parent can still be
  // active via a matching child below) rather than returning early.
  // View-identity match: exact in both directions, OR both buckets are
  // "default-equivalent" (bare/`?view=list`/`?view=table`). The latter is what
  // lights the Issues/list item on the bare default landing (`?per_page=15`, no
  // `view`) without ever lighting the Board (`?view=kanban`), which is not a
  // default bucket — so siblings stay mutually exclusive.
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

  if (
    hasItems &&
    (item as NavCollapsibleItem).items.some((i: NavLinkItem) =>
      checkIsActive(href, i)
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
