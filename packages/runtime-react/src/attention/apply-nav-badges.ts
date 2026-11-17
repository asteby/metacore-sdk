import {
    aggregateBadges,
    maxSeverity,
    type NavBadgeValue,
    type NavGroupData,
    type NavItem,
} from '@asteby/metacore-ui/layout'

type Leaf = { badgeId?: string }

function collect(item: NavItem, badges: ReadonlyMap<string, NavBadgeValue>, seen: Map<string, NavBadgeValue>) {
    const id = (item as Leaf).badgeId
    if (id) {
        const b = badges.get(id)
        if (b && b.count > 0) seen.set(id, b)
    }
    if ('items' in item) for (const c of item.items) collect(c, badges, seen)
}

/**
 * Pure: returns nav groups with `badge` filled from the counters, matched by
 * `badgeId`. A folder shows the SUM of its leaves deduplicated by id (two
 * entries pointing at the same counter count once) with the most severe tone.
 * Items without a match keep their own `badge`. Never mutates the input.
 */
export function applyNavBadges(groups: NavGroupData[], badges: ReadonlyMap<string, NavBadgeValue>): NavGroupData[] {
    const walk = (item: NavItem): NavItem => {
        if ('items' in item) {
            const items = item.items.map(walk)
            const seen = new Map<string, NavBadgeValue>()
            for (const c of items) collect(c, badges, seen)
            const { count, tone } = aggregateBadges(seen.values())
            return { ...item, items, badge: count > 0 ? { count, tone } : item.badge }
        }
        const id = (item as Leaf).badgeId
        const b = id ? badges.get(id) : undefined
        return b && b.count > 0 ? { ...item, badge: b } : item
    }
    return groups.map((g) => ({ ...g, items: g.items.map(walk) }))
}

export { maxSeverity }
