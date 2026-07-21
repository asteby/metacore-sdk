// DashboardGrid — the modular dashboard surface. Renders the union of
// declarative + federated widgets in a responsive 4-column grid, grouped with
// headings, honouring per-widget size, permission gating (useCan), batch data
// loading with per-widget skeletons, isolated per-widget errors, and a pro
// global empty state. See CONTRACT-dashboard-widgets.md §4.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@asteby/metacore-ui/lib'
import { useCan, usePermissionsActive } from './permissions-context'
import type {
    DashboardGridProps,
    DashboardGridStrings,
    DashboardWidgetGroup,
    DashboardWidgetSpec,
} from './dashboard-types'
import { WidgetRenderer, WidgetSkeleton, isTallWidget } from './widgets/widget-renderer'
import { DashboardEmptyMockup } from './dashboard-empty-mockup'

const DEFAULT_STRINGS: DashboardGridStrings = {
    emptyTitle: 'Your dashboard is taking shape',
    emptyDescription:
        'Install an addon with dashboard widgets and your metrics will start living here.',
    widgetError: 'Could not load this widget.',
    widgetEmpty: 'No data yet.',
}

/** Normalizes flat `widgets` + `groups` into an ordered group list. */
export function normalizeGroups(
    groups?: DashboardWidgetGroup[],
    widgets?: DashboardWidgetSpec[],
): DashboardWidgetGroup[] {
    if (groups && groups.length > 0) return groups
    if (!widgets || widgets.length === 0) return []
    // Group flat widgets by `group` (preserve first-seen order), sort each
    // group by `order` (default 100), keep insertion order across groups.
    const map = new Map<string, DashboardWidgetSpec[]>()
    for (const w of widgets) {
        const key = w.group ?? ''
        const arr = map.get(key) ?? []
        arr.push(w)
        map.set(key, arr)
    }
    return Array.from(map.entries()).map(([title, ws]) => ({
        title,
        widgets: [...ws].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    }))
}

/** Collects every widget key across groups (for the batch loader). */
function allKeys(groups: DashboardWidgetGroup[]): string[] {
    const keys: string[] = []
    for (const g of groups) for (const w of g.widgets) keys.push(w.key)
    return keys
}

export function DashboardGrid({
    groups,
    widgets,
    loadData,
    isAdmin,
    locale,
    currency,
    className,
    strings,
}: DashboardGridProps) {
    const { t } = useTranslation()
    const can = useCan()
    const permissionsActive = usePermissionsActive()
    const s = { ...DEFAULT_STRINGS, ...strings }

    // i18n helper: translate a key, falling back to the raw key when missing
    // (specs ship raw i18n keys; the host bundle may or may not have them).
    const tr = React.useCallback(
        (key?: string, fallback?: string): string => {
            if (!key) return fallback ?? ''
            const out = t(key)
            return out === key ? fallback ?? key : out
        },
        [t],
    )

    // Permission gating: admin bypass; without a PermissionsProvider everything
    // is visible (retrocompat). With one, honour each widget's `permission`.
    const visibleGroups = React.useMemo(() => {
        const norm = normalizeGroups(groups, widgets)
        const gate = (w: DashboardWidgetSpec): boolean => {
            if (isAdmin) return true
            if (!permissionsActive) return true
            if (!w.permission) return true
            return can(w.permission)
        }
        return norm
            .map((g) => ({ ...g, widgets: g.widgets.filter(gate) }))
            .filter((g) => g.widgets.length > 0)
    }, [groups, widgets, isAdmin, permissionsActive, can])

    const keys = React.useMemo(() => allKeys(visibleGroups), [visibleGroups])
    const keySig = keys.join(',')

    const [data, setData] = React.useState<
        Record<string, import('./dashboard-types').WidgetData> | null
    >(null)
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        let cancelled = false
        if (keys.length === 0) {
            setLoading(false)
            setData({})
            return
        }
        setLoading(true)
        loadData(keys)
            .then((res) => {
                if (!cancelled) {
                    setData(res ?? {})
                    setLoading(false)
                }
            })
            .catch(() => {
                // Batch failure: still render the grid; every widget falls to
                // its empty/error state rather than blanking the page.
                if (!cancelled) {
                    setData({})
                    setLoading(false)
                }
            })
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keySig, loadData])

    // Flatten every group into ONE ordered list (compact KPIs before charts) for
    // the masonry grid. MUST run before any early return — it is a hook, and a
    // conditional hook (placed after the empty-state return) trips React #310
    // when the dashboard transitions empty → populated.
    const ordered = React.useMemo(() => {
        const flat = visibleGroups.flatMap((g) => g.widgets)
        return flat
            .map((w, i) => ({ w, i }))
            .sort(
                (a, b) =>
                    (isTallWidget(a.w) ? 1 : 0) - (isTallWidget(b.w) ? 1 : 0) ||
                    a.i - b.i,
            )
            .map((x) => x.w)
    }, [visibleGroups])

    // Global empty state (no widgets at all / none visible after gating).
    if (visibleGroups.length === 0) {
        return (
            <div
                data-testid="dashboard-empty"
                className={cn(
                    'flex min-h-[40vh] flex-col items-center justify-center gap-6 rounded-xl border border-dashed border-border/60 p-10 text-center',
                    className,
                )}
            >
                <DashboardEmptyMockup />
                <div className="flex flex-col items-center">
                    <h3 className="text-base font-semibold text-foreground">
                        {tr(undefined, s.emptyTitle) || s.emptyTitle}
                    </h3>
                    <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                        {s.emptyDescription}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div
            data-testid="dashboard-grid"
            className={cn(
                // Masonry: balanced CSS columns. Cards take their natural height
                // (compact stats, taller charts) and flow to equalize column
                // height, so there are NO blank cells — the gaps a fixed grid
                // leaves around mixed 1×1 / 2×2 tiles simply don't exist here.
                'columns-1 gap-4 md:columns-2 xl:columns-3',
                className,
            )}
        >
            {ordered.map((spec) => {
                const rspec = {
                    ...spec,
                    title: tr(spec.title, spec.title),
                    subtitle: tr(spec.subtitle, spec.subtitle),
                }
                return (
                    <div key={spec.key} className="mb-4 break-inside-avoid">
                        {loading ? (
                            <WidgetSkeleton spec={rspec} />
                        ) : (
                            <WidgetRenderer
                                spec={rspec}
                                data={data?.[spec.key]}
                                locale={locale}
                                currency={currency}
                                emptyText={spec.empty ? tr(spec.empty, spec.empty) : s.widgetEmpty}
                                errorText={s.widgetError}
                            />
                        )}
                    </div>
                )
            })}
        </div>
    )
}
