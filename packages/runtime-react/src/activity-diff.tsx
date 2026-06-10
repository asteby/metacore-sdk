/**
 * activity-diff.tsx
 *
 * <ActivityDiff> — renders the field-level diff of a single ActivityEvent.
 *
 * Three visual states driven by `event.action`:
 *   - created  → green "after" column only (no before)
 *   - deleted  → red "before" column only (no after)
 *   - updated  → yellow "before → after" side-by-side per field
 *
 * Consumers pass the declarative `columns` metadata array (same shape as
 * `TableMetadata.columns`) so labels and display types are resolved without
 * any internal fetch. Degrades gracefully when `columns` is empty/absent.
 *
 * Toggle: "Todos los campos / Solo cambios" (with changed-field counter).
 */

import * as React from 'react'
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react'
import { cn } from '@asteby/metacore-ui/lib'
import { Badge } from '@asteby/metacore-ui/primitives'
import type { ColumnDefinition } from './types'
import { ActivityValueRenderer } from './activity-value-renderer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The canonical activity event shape as produced by the kernel / host backend.
 * Transport-agnostic — the component only reads the fields it needs.
 */
export interface ActivityEvent {
    id: string
    correlation_id?: string | null
    actor_id?: string | null
    actor_label?: string | null
    addon_key: string
    model: string
    record_id: string
    action: string
    kind?: string | null
    before?: Record<string, unknown> | null
    after?: Record<string, unknown> | null
    /**
     * Explicit diff map produced by the backend. When present, only these keys
     * are "changed" fields. When absent, the diff is derived from before/after.
     */
    changes?: Record<string, { from: unknown; to: unknown }> | null
    summary?: string | null
    occurred_at: string
}

export interface ActivityDiffProps {
    /** The activity event to render. */
    event: ActivityEvent
    /**
     * Column metadata for the model. Used to resolve `col.label` and display
     * type. Pass `TableMetadata.columns` from the host's metadata cache.
     * Optional — field keys are shown raw when absent.
     */
    columns?: ColumnDefinition[]
    /** IANA timezone for datetime cells (org config). */
    timeZone?: string
    /** ISO 4217 currency for money cells (org config). */
    currency?: string
    /** BCP-47 locale. Defaults to 'es'. */
    locale?: string
    /** Class applied to the root element. */
    className?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns all field keys that appear in the diff. */
function diffKeys(event: ActivityEvent): string[] {
    if (event.changes && Object.keys(event.changes).length > 0) {
        return Object.keys(event.changes)
    }
    const before = event.before ?? {}
    const after = event.after ?? {}
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    // Filter out meta-level keys that are always present and rarely meaningful
    // in a human-readable diff (id, created_at, updated_at, organization_id).
    const META = new Set(['id', 'created_at', 'updated_at', 'organization_id', 'org_id'])
    keys.forEach((k) => { if (META.has(k)) keys.delete(k) })
    return Array.from(keys)
}

/** Returns the set of keys where the value actually changed. */
function changedKeys(event: ActivityEvent): Set<string> {
    if (event.changes && Object.keys(event.changes).length > 0) {
        return new Set(Object.keys(event.changes))
    }
    const before = event.before ?? {}
    const after = event.after ?? {}
    const changed = new Set<string>()
    const all = new Set([...Object.keys(before), ...Object.keys(after)])
    all.forEach((k) => {
        if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed.add(k)
    })
    return changed
}

function resolveColumn(key: string, columns?: ColumnDefinition[]): ColumnDefinition | undefined {
    return columns?.find((c) => c.key === key)
}

function resolveLabel(key: string, columns?: ColumnDefinition[]): string {
    const col = resolveColumn(key, columns)
    if (col?.label) return col.label
    // Humanize snake_case as last resort
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function actionVariant(action: string): 'created' | 'updated' | 'deleted' | 'other' {
    const a = action.toLowerCase()
    if (a === 'created' || a === 'create') return 'created'
    if (a === 'deleted' || a === 'delete') return 'deleted'
    if (a === 'updated' || a === 'update') return 'updated'
    return 'other'
}

const VARIANT_BADGE: Record<string, { label: string; className: string }> = {
    created: { label: 'Creado', className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-900' },
    updated: { label: 'Actualizado', className: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-900' },
    deleted: { label: 'Eliminado', className: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900' },
    other: { label: '', className: 'bg-muted text-muted-foreground border-border' },
}

// Subtle row highlight colors — using inline style so arbitrary values are
// never dropped by the host's Tailwind class scan.
const ROW_STYLE = {
    created: { background: 'color-mix(in srgb, #22c55e 6%, transparent)' },
    deleted: { background: 'color-mix(in srgb, #ef4444 6%, transparent)' },
    updated: {},
    other: {},
} as Record<string, React.CSSProperties>

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the field-level diff of a single ActivityEvent. Shows each field
 * with its label (from `columns`) and value formatted using the column's
 * display type. Supports a toggle to show only changed fields vs. all fields.
 */
export const ActivityDiff: React.FC<ActivityDiffProps> = ({
    event,
    columns,
    timeZone,
    currency,
    locale = 'es',
    className,
}) => {
    const variant = actionVariant(event.action)
    const allKeys = diffKeys(event)
    const changed = changedKeys(event)
    const [showOnlyChanged, setShowOnlyChanged] = React.useState(true)

    const displayedKeys = showOnlyChanged ? allKeys.filter((k) => changed.has(k)) : allKeys
    const isCreated = variant === 'created'
    const isDeleted = variant === 'deleted'

    const variantBadge = VARIANT_BADGE[variant] ?? VARIANT_BADGE.other

    if (allKeys.length === 0 && !event.summary) {
        return (
            <div className={cn('text-sm text-muted-foreground italic py-1', className)}>
                Sin campos registrados.
            </div>
        )
    }

    return (
        <div className={cn('space-y-2', className)}>
            {/* Header: action badge + field count + toggle */}
            <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn('text-xs font-medium px-2 py-0.5', variantBadge.className)}>
                    {variantBadge.label || event.action}
                </Badge>
                {changed.size > 0 && variant === 'updated' && (
                    <span className="text-xs text-muted-foreground">
                        {changed.size} campo{changed.size !== 1 ? 's' : ''} modificado{changed.size !== 1 ? 's' : ''}
                    </span>
                )}
                {allKeys.length > 0 && variant === 'updated' && (
                    <button
                        type="button"
                        onClick={() => setShowOnlyChanged((v) => !v)}
                        className="ml-auto text-xs text-primary hover:underline"
                    >
                        {showOnlyChanged ? `Ver todos (${allKeys.length})` : 'Solo cambios'}
                    </button>
                )}
            </div>

            {/* Summary line (if backend provided one) */}
            {event.summary && (
                <p className="text-sm text-muted-foreground italic">{event.summary}</p>
            )}

            {/* Diff table */}
            {displayedKeys.length > 0 && (
                <div className="rounded-lg border border-border/60 overflow-hidden text-sm">
                    {/* Column headers */}
                    <div className="grid grid-cols-[1fr_1fr_1fr] border-b border-border/40 bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                        <span>Campo</span>
                        {!isCreated && <span>{isDeleted ? 'Valor' : 'Antes'}</span>}
                        {isCreated && <span></span>}
                        {!isDeleted && <span>{isCreated ? 'Valor' : 'Después'}</span>}
                        {isDeleted && <span></span>}
                    </div>

                    {displayedKeys.map((key, idx) => {
                        const col = resolveColumn(key, columns)
                        const label = resolveLabel(key, columns)
                        const isChanged = changed.has(key)

                        let fromVal: unknown
                        let toVal: unknown

                        if (event.changes?.[key]) {
                            fromVal = event.changes[key].from
                            toVal = event.changes[key].to
                        } else {
                            fromVal = event.before?.[key]
                            toVal = event.after?.[key]
                        }

                        const rowStyle = isCreated
                            ? ROW_STYLE.created
                            : isDeleted
                              ? ROW_STYLE.deleted
                              : isChanged
                                ? {}
                                : {}

                        return (
                            <div
                                key={key}
                                style={rowStyle}
                                className={cn(
                                    'grid grid-cols-[1fr_1fr_1fr] items-start px-3 py-2 gap-x-2',
                                    idx !== displayedKeys.length - 1 && 'border-b border-border/30',
                                    isChanged && variant === 'updated' && 'bg-yellow-50/40 dark:bg-yellow-950/10',
                                )}
                            >
                                {/* Field label */}
                                <span className="text-xs font-medium text-foreground/70 pt-0.5 truncate" title={label}>
                                    {label}
                                </span>

                                {/* Before value (or value for deleted/created) */}
                                {!isCreated ? (
                                    <span className={cn(isDeleted ? 'col-span-2' : '')}>
                                        <ActivityValueRenderer
                                            value={isDeleted ? fromVal : fromVal}
                                            col={col}
                                            timeZone={timeZone}
                                            currency={currency}
                                            locale={locale}
                                        />
                                    </span>
                                ) : (
                                    <span />
                                )}

                                {/* After value */}
                                {!isDeleted ? (
                                    <span className={cn(isCreated ? 'col-span-2' : '')}>
                                        {isChanged && variant === 'updated' && (
                                            <span className="inline-flex items-center gap-1 align-middle mr-1">
                                                <ArrowRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                                            </span>
                                        )}
                                        <ActivityValueRenderer
                                            value={isCreated ? toVal : toVal}
                                            col={col}
                                            timeZone={timeZone}
                                            currency={currency}
                                            locale={locale}
                                        />
                                    </span>
                                ) : (
                                    <span />
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
