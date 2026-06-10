/**
 * activity-timeline.tsx
 *
 * <ActivityTimeline> — global activity feed grouped by correlation_id.
 *
 * Events that share a correlation_id are folded into a single "operation"
 * group (e.g. "Juan · Pedido creado · 4 cambios"). Events without a
 * correlation_id appear as standalone entries.
 *
 * Filters: by model, actor, action, and date range. All client-side.
 *
 * Transport-agnostic: events arrive via props; column metadata is resolved
 * per-model via the `resolveColumns(model)` injected function. No fetch.
 */

import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import {
    ChevronDown,
    ChevronRight,
    Clock,
    Filter,
    X,
    Layers,
    Activity,
} from 'lucide-react'
import { cn } from '@asteby/metacore-ui/lib'
import {
    Avatar,
    AvatarFallback,
    Badge,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Button,
    Separator,
} from '@asteby/metacore-ui/primitives'
import { getInitials } from '@asteby/metacore-ui/lib'
import type { ColumnDefinition } from './types'
import type { ActivityEvent } from './activity-diff'
import { ActivityDiff } from './activity-diff'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActivityTimelineProps {
    /**
     * All activity events to display. The component groups, sorts, and filters
     * them client-side — order does not matter.
     */
    events: ActivityEvent[]
    /**
     * Injectable column metadata resolver. Called once per unique model name
     * encountered in the event list. Returns the column definitions for that
     * model, or undefined/empty when the host has no metadata for it.
     *
     * The host typically implements this as a cache lookup against its
     * MetadataService / metadata-cache store.
     */
    resolveColumns?: (model: string) => ColumnDefinition[] | undefined
    /** IANA timezone for datetime cells. */
    timeZone?: string
    /** ISO 4217 currency for money cells. */
    currency?: string
    /** BCP-47 locale. Defaults to 'es'. */
    locale?: string
    /** Class applied to the root element. */
    className?: string
    /**
     * When true, the filter bar is hidden. Useful when the host already
     * provides external filter controls and wants to feed pre-filtered events.
     */
    hideFilters?: boolean
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** A group of events sharing the same correlation_id, or a standalone event. */
interface EventGroup {
    /** Shared correlation_id (or the single event's id for ungrouped). */
    key: string
    /** The "root" event — first (chronologically) in the group. */
    root: ActivityEvent
    /** All events in the group, sorted ascending (oldest first). */
    events: ActivityEvent[]
    /** Total number of changed fields across all events in the group. */
    changedFieldCount: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTION_DOT_COLOR: Record<string, string> = {
    created: '#22c55e',
    create: '#22c55e',
    updated: '#eab308',
    update: '#eab308',
    deleted: '#ef4444',
    delete: '#ef4444',
}

function actionDotColor(action: string): string {
    return ACTION_DOT_COLOR[action.toLowerCase()] ?? '#6b7280'
}

const ACTION_LABELS_ES: Record<string, string> = {
    created: 'creó',
    create: 'creó',
    updated: 'actualizó',
    update: 'actualizó',
    deleted: 'eliminó',
    delete: 'eliminó',
}

function groupEvents(events: ActivityEvent[]): EventGroup[] {
    const grouped = new Map<string, ActivityEvent[]>()

    for (const ev of events) {
        const key = ev.correlation_id || ev.id
        const arr = grouped.get(key) ?? []
        arr.push(ev)
        grouped.set(key, arr)
    }

    const result: EventGroup[] = []

    grouped.forEach((evs, key) => {
        // Sort ascending (oldest first within a group)
        const sorted = [...evs].sort(
            (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
        )
        const root = sorted[0]

        // Count distinct changed fields across all events in this group
        let changedFieldCount = 0
        for (const ev of sorted) {
            if (ev.changes) changedFieldCount += Object.keys(ev.changes).length
            else if (ev.before || ev.after) {
                const keys = new Set([...Object.keys(ev.before ?? {}), ...Object.keys(ev.after ?? {})])
                changedFieldCount += keys.size
            }
        }

        result.push({ key, root, events: sorted, changedFieldCount })
    })

    // Sort groups: most recent root event first
    result.sort((a, b) => new Date(b.root.occurred_at).getTime() - new Date(a.root.occurred_at).getTime())

    return result
}

function uniqueValues<K extends keyof ActivityEvent>(
    events: ActivityEvent[],
    key: K,
): string[] {
    const set = new Set<string>()
    for (const ev of events) {
        const v = ev[key]
        if (v !== undefined && v !== null && v !== '') set.add(String(v))
    }
    return Array.from(set).sort()
}

// ---------------------------------------------------------------------------
// Component: individual group card
// ---------------------------------------------------------------------------

interface GroupCardProps {
    group: EventGroup
    resolveColumns: (model: string) => ColumnDefinition[] | undefined
    timeZone?: string
    currency?: string
    locale: string
    dateLocale: Locale
    isOpen: boolean
    onToggle: () => void
}

const GroupCard: React.FC<GroupCardProps> = ({
    group,
    resolveColumns,
    timeZone,
    currency,
    locale,
    dateLocale,
    isOpen,
    onToggle,
}) => {
    const { root, events, changedFieldCount } = group
    const isMulti = events.length > 1
    const actor = root.actor_label || root.actor_id || 'Sistema'
    const dotColor = actionDotColor(root.action)

    const timeAgo = (() => {
        try {
            return formatDistanceToNow(new Date(root.occurred_at), { addSuffix: true, locale: dateLocale })
        } catch {
            return root.occurred_at
        }
    })()

    const fullDate = (() => {
        try {
            return new Date(root.occurred_at).toLocaleString(locale === 'en' ? 'en-US' : 'es-MX', {
                ...(timeZone ? { timeZone } : {}),
                dateStyle: 'medium',
                timeStyle: 'short',
            })
        } catch {
            return root.occurred_at
        }
    })()

    const summaryLine = root.summary
        ? root.summary
        : `${actor} ${ACTION_LABELS_ES[root.action.toLowerCase()] ?? root.action} ${root.model}`

    return (
        <Collapsible open={isOpen} onOpenChange={onToggle}>
            <div className="relative">
                {/* Timeline dot */}
                <span
                    className="absolute -left-5 top-4 h-2.5 w-2.5 rounded-full border-2 border-background -translate-x-[4px]"
                    style={{ background: dotColor }}
                    aria-hidden="true"
                />

                <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
                    {/* Group header */}
                    <CollapsibleTrigger asChild>
                        <button
                            type="button"
                            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                        >
                            <Avatar className="h-7 w-7 rounded-full shrink-0 mt-0.5">
                                <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                                    {getInitials(actor)}
                                </AvatarFallback>
                            </Avatar>

                            <div className="flex-1 min-w-0">
                                {/* Summary line */}
                                <p className="text-sm font-medium text-foreground truncate" title={summaryLine}>
                                    {summaryLine}
                                </p>

                                {/* Meta row */}
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                        <Clock className="h-3 w-3 opacity-60 shrink-0" />
                                        <span title={fullDate}>{timeAgo}</span>
                                    </span>

                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                        {root.model}
                                    </Badge>

                                    {isMulti && (
                                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                            <Layers className="h-3 w-3 opacity-60 shrink-0" />
                                            {events.length} eventos
                                        </span>
                                    )}

                                    {changedFieldCount > 0 && (
                                        <span className="text-xs text-muted-foreground">
                                            {changedFieldCount} campo{changedFieldCount !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <span className="shrink-0 text-muted-foreground mt-1">
                                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </span>
                        </button>
                    </CollapsibleTrigger>

                    {/* Expanded: one diff per event in the group */}
                    <CollapsibleContent>
                        <div className="border-t border-border/40 divide-y divide-border/30">
                            {events.map((ev, idx) => {
                                const cols = resolveColumns(ev.model)
                                const evActor = ev.actor_label || ev.actor_id || 'Sistema'
                                return (
                                    <div key={ev.id} className="px-4 py-3 space-y-2">
                                        {/* Show sub-actor + model when group has multiple events */}
                                        {isMulti && (
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span className="font-medium text-foreground/70">{ev.model}</span>
                                                <span>·</span>
                                                <span>{evActor}</span>
                                                {idx > 0 && (
                                                    <>
                                                        <span>·</span>
                                                        <span title={ev.occurred_at}>
                                                            {(() => {
                                                                try {
                                                                    return formatDistanceToNow(new Date(ev.occurred_at), { addSuffix: true, locale: dateLocale })
                                                                } catch {
                                                                    return ev.occurred_at
                                                                }
                                                            })()}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        <ActivityDiff
                                            event={ev}
                                            columns={cols}
                                            timeZone={timeZone}
                                            currency={currency}
                                            locale={locale}
                                        />
                                    </div>
                                )
                            })}
                        </div>
                    </CollapsibleContent>
                </div>
            </div>
        </Collapsible>
    )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Global activity feed. Groups correlated events, renders a vertical timeline
 * with filter controls (model, actor, action, date range).
 *
 * The `resolveColumns` function is injected by the host. It maps a model name
 * to its `ColumnDefinition[]` (e.g. from the host's metadata-cache store).
 * When omitted or when it returns nothing, field keys are shown raw.
 */
export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
    events,
    resolveColumns = () => undefined,
    timeZone,
    currency,
    locale = 'es',
    className,
    hideFilters = false,
}) => {
    const dateLocale = locale === 'en' ? enUS : es

    // -----------------------------------------------------------------------
    // Filter state
    // -----------------------------------------------------------------------

    const [filterModel, setFilterModel] = React.useState<string>('__all__')
    const [filterActor, setFilterActor] = React.useState<string>('__all__')
    const [filterAction, setFilterAction] = React.useState<string>('__all__')
    const [filterFrom, setFilterFrom] = React.useState<string>('')
    const [filterTo, setFilterTo] = React.useState<string>('')

    const models = React.useMemo(() => uniqueValues(events, 'model'), [events])
    const actors = React.useMemo(
        () => uniqueValues(events, 'actor_label').filter(Boolean),
        [events],
    )
    const actions = React.useMemo(() => uniqueValues(events, 'action'), [events])

    const hasFilters =
        filterModel !== '__all__' ||
        filterActor !== '__all__' ||
        filterAction !== '__all__' ||
        filterFrom !== '' ||
        filterTo !== ''

    const clearFilters = () => {
        setFilterModel('__all__')
        setFilterActor('__all__')
        setFilterAction('__all__')
        setFilterFrom('')
        setFilterTo('')
    }

    // -----------------------------------------------------------------------
    // Filtered + grouped events
    // -----------------------------------------------------------------------

    const filtered = React.useMemo(() => {
        return events.filter((ev) => {
            if (filterModel !== '__all__' && ev.model !== filterModel) return false
            if (filterActor !== '__all__' && ev.actor_label !== filterActor) return false
            if (filterAction !== '__all__' && ev.action !== filterAction) return false
            if (filterFrom) {
                const from = new Date(filterFrom)
                if (new Date(ev.occurred_at) < from) return false
            }
            if (filterTo) {
                const to = new Date(filterTo)
                // inclusive end-of-day
                to.setHours(23, 59, 59, 999)
                if (new Date(ev.occurred_at) > to) return false
            }
            return true
        })
    }, [events, filterModel, filterActor, filterAction, filterFrom, filterTo])

    const groups = React.useMemo(() => groupEvents(filtered), [filtered])

    // -----------------------------------------------------------------------
    // Open/close state (first group open by default)
    // -----------------------------------------------------------------------

    const [openKeys, setOpenKeys] = React.useState<Set<string>>(() =>
        groups.length > 0 ? new Set([groups[0].key]) : new Set(),
    )

    // Reset open state when filtered groups change substantially
    const prevGroupKeysRef = React.useRef<string>('')
    React.useEffect(() => {
        const current = groups.map((g) => g.key).join(',')
        if (current !== prevGroupKeysRef.current) {
            prevGroupKeysRef.current = current
            setOpenKeys(groups.length > 0 ? new Set([groups[0].key]) : new Set())
        }
    }, [groups])

    const toggleGroup = (key: string) => {
        setOpenKeys((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div className={cn('space-y-4', className)}>
            {/* Filter bar */}
            {!hideFilters && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-muted-foreground">Filtros</span>
                        {hasFilters && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="ml-auto h-7 px-2 text-xs"
                                onClick={clearFilters}
                            >
                                <X className="h-3 w-3 mr-1" />
                                Limpiar
                            </Button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {/* Model filter */}
                        {models.length > 1 && (
                            <Select value={filterModel} onValueChange={setFilterModel}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Módulo" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">Todos los módulos</SelectItem>
                                    {models.map((m) => (
                                        <SelectItem key={m} value={m}>{m}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}

                        {/* Actor filter */}
                        {actors.length > 1 && (
                            <Select value={filterActor} onValueChange={setFilterActor}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Usuario" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">Todos los usuarios</SelectItem>
                                    {actors.map((a) => (
                                        <SelectItem key={a} value={a}>{a}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}

                        {/* Action filter */}
                        {actions.length > 1 && (
                            <Select value={filterAction} onValueChange={setFilterAction}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Acción" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">Todas las acciones</SelectItem>
                                    {actions.map((a) => (
                                        <SelectItem key={a} value={a}>{a}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}

                        {/* Date range */}
                        <div className="col-span-2 sm:col-span-1 flex gap-1">
                            <Input
                                type="date"
                                value={filterFrom}
                                onChange={(e) => setFilterFrom(e.target.value)}
                                className="h-8 text-xs"
                                placeholder="Desde"
                                title="Desde"
                            />
                            <Input
                                type="date"
                                value={filterTo}
                                onChange={(e) => setFilterTo(e.target.value)}
                                className="h-8 text-xs"
                                placeholder="Hasta"
                                title="Hasta"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Timeline */}
            {groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                    <Activity className="h-10 w-10 opacity-30" />
                    <p className="text-sm">
                        {hasFilters ? 'Sin resultados con los filtros actuales.' : 'Sin actividad registrada.'}
                    </p>
                </div>
            ) : (
                <div className="relative pl-5 space-y-3">
                    {/* Vertical timeline line */}
                    <span
                        className="absolute left-2 top-2 bottom-2 w-px bg-border"
                        aria-hidden="true"
                    />

                    {groups.map((group) => (
                        <GroupCard
                            key={group.key}
                            group={group}
                            resolveColumns={resolveColumns}
                            timeZone={timeZone}
                            currency={currency}
                            locale={locale}
                            dateLocale={dateLocale}
                            isOpen={openKeys.has(group.key)}
                            onToggle={() => toggleGroup(group.key)}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
