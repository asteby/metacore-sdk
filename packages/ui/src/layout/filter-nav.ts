import type { NavGroupData, NavItem, NavLinkItem } from './types'

/**
 * Prunes a sidebar tree with a host predicate (PIT-044: the menu follows the
 * role's effective permissions).
 *
 *   - a leaf is kept when `isVisible(leaf)` is true;
 *   - a collapsible is kept when at least one descendant survives (its own
 *     `url` is just the first child's, so it is never tested on its own);
 *   - a group with no surviving item disappears, so no empty headers remain.
 *
 * Pure: returns new arrays only where something changed.
 */
export function filterNavGroups(
  groups: NavGroupData[],
  isVisible: (item: NavLinkItem) => boolean,
): NavGroupData[] {
  const out: NavGroupData[] = []
  for (const group of groups) {
    const items = filterNavItems(group.items, isVisible)
    if (items.length > 0) out.push(items === group.items ? group : { ...group, items })
  }
  return out.length === groups.length && out.every((g, i) => g === groups[i]) ? groups : out
}

export function filterNavItems(
  items: NavItem[],
  isVisible: (item: NavLinkItem) => boolean,
): NavItem[] {
  const kept: NavItem[] = []
  for (const item of items) {
    if ('items' in item && Array.isArray(item.items)) {
      const children = filterNavItems(item.items, isVisible)
      if (children.length > 0) kept.push(children === item.items ? item : { ...item, items: children })
    } else if (isVisible(item)) {
      kept.push(item)
    }
  }
  return kept.length === items.length && kept.every((k, i) => k === items[i]) ? items : kept
}
