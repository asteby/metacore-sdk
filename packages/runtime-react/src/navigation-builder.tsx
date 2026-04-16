// NavigationBuilder — merges a host's base sidebar with `manifest.navigation`
// contributions from every loaded addon. Pure function + a React hook.
import { useMemo } from 'react'

export interface NavItem {
    key: string
    label: string
    icon?: string
    to?: string
    /** Sort weight; higher = earlier. Default 0. */
    priority?: number
    /** Capability required to see this item. */
    requires?: string
    /** Nested children (rendered as a collapsible section). */
    children?: NavItem[]
    /** Group this item belongs to — items with the same group are clustered. */
    group?: string
    /** Source addon key (for debugging / telemetry). */
    source?: string
}

export interface AddonNavigationContribution {
    source: string
    items: NavItem[]
}

/** Deep-merge nav trees by `key`. Children are merged recursively; on
 *  conflict the higher-priority wins, then the later contribution.
 */
export function mergeNavigation(base: NavItem[], contributions: AddonNavigationContribution[]): NavItem[] {
    const byKey = new Map<string, NavItem>()
    const order: string[] = []

    const absorb = (items: NavItem[], source?: string) => {
        for (const raw of items) {
            const item: NavItem = { ...raw, source: raw.source ?? source }
            const existing = byKey.get(item.key)
            if (!existing) {
                byKey.set(item.key, item)
                order.push(item.key)
                continue
            }
            const a = existing.priority ?? 0
            const b = item.priority ?? 0
            const winner = b >= a ? item : existing
            const loser = b >= a ? existing : item
            const mergedChildren = (winner.children || loser.children)
                ? mergeNavigation(winner.children ?? [], [{ source: winner.source ?? '', items: loser.children ?? [] }])
                : undefined
            byKey.set(item.key, { ...winner, children: mergedChildren })
        }
    }

    absorb(base, 'host')
    for (const c of contributions) absorb(c.items, c.source)

    return order
        .map(k => byKey.get(k)!)
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

export function useNavigation(base: NavItem[], contributions: AddonNavigationContribution[]): NavItem[] {
    return useMemo(() => mergeNavigation(base, contributions), [base, contributions])
}

export interface NavigationBuilderProps {
    base: NavItem[]
    contributions: AddonNavigationContribution[]
    render: (items: NavItem[]) => React.ReactNode
}

/** Render-prop component for hosts that want the merge logic but render
 *  the sidebar with their own primitives. */
export function NavigationBuilder({ base, contributions, render }: NavigationBuilderProps) {
    const items = useNavigation(base, contributions)
    return <>{render(items)}</>
}
