/**
 * record-history.tsx
 *
 * <RecordHistory> — chronological timeline of all ActivityEvents for a single
 * record. Most recent event first. Each event is shown as a collapsible card
 * with actor, relative date, and the <ActivityDiff> inline.
 *
 * Intended to be embedded in a record dialog tab ("Historial").
 *
 * Transport-agnostic: events and column metadata arrive via props. No fetching.
 */

import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { ChevronDown, ChevronRight, Clock, ExternalLink } from 'lucide-react'
import { cn } from '@asteby/metacore-ui/lib'
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    Badge,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@asteby/metacore-ui/primitives'
import { getInitials } from '@asteby/metacore-ui/lib'
import type { ColumnDefinition } from './types'
import type { ActivityEvent } from './activity-diff'
import { ActivityDiff } from './activity-diff'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecordHistoryProps {
    /**
     * All activity events for the record, in any order. The component sorts
     * them chronologically (most recent first).
     */
    events: ActivityEvent[]
    /**
     * Column metadata for the record's model. Forwarded to <ActivityDiff> so
     * field labels and display types are resolved correctly.
     */
    columns?: ColumnDefinition[]
    /** IANA timezone for datetime cells. */
    timeZone?: string
    /** ISO 4217 currency for money cells. */
    currency?: string
    /** BCP-47 locale. Defaults to 'es'. */
    locale?: string
    /** Class applied to the root element. */
    className?: string
    /**
     * When provided, each event header shows an "open in activity log" button
     * that invokes this with the event — the host navigates to its activity
     * detail page (e.g. `/activity/:id`). Omitted → no button.
     */
    onOpenEvent?: (event: ActivityEvent) => void
    /**
     * Resolves an event's `actor_avatar` storage path to a fetchable URL
     * (e.g. ops' `getStorageUrl(path, 'avatars')`). Identity when omitted —
     * fine for absolute same-origin paths.
     */
    resolveAvatarUrl?: (path: string) => string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
    created: 'Creó el registro',
    create: 'Creó el registro',
    updated: 'Actualizó el registro',
    update: 'Actualizó el registro',
    deleted: 'Eliminó el registro',
    delete: 'Eliminó el registro',
}

function actionLabel(action: string): string {
    return ACTION_LABELS[action.toLowerCase()] ?? action
}

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Shows the full activity history of a single record as a vertical timeline.
 * Each event is collapsible — the header shows actor + time; expanding reveals
 * the <ActivityDiff> with field-level changes.
 */
export const RecordHistory: React.FC<RecordHistoryProps> = ({
    events,
    columns,
    timeZone,
    currency,
    locale = 'es',
    className,
    onOpenEvent,
    resolveAvatarUrl,
}) => {
    const dateLocale = locale === 'en' ? enUS : es

    // Sort: most recent first
    const sorted = React.useMemo(
        () => [...events].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()),
        [events],
    )

    // Expand the most-recent event by default
    const [openIds, setOpenIds] = React.useState<Set<string>>(() =>
        sorted.length > 0 ? new Set([sorted[0].id]) : new Set(),
    )

    const toggle = (id: string) => {
        setOpenIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    if (sorted.length === 0) {
        return (
            <div className={cn('flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground', className)}>
                <Clock className="h-8 w-8 opacity-40" />
                <p className="text-sm">Sin historial de cambios.</p>
            </div>
        )
    }

    return (
        <div className={cn('relative pl-5', className)}>
            {/* Vertical line */}
            <span
                className="absolute left-2 top-2 bottom-2 w-px bg-border"
                aria-hidden="true"
            />

            <div className="space-y-3">
                {sorted.map((event) => {
                    const isOpen = openIds.has(event.id)
                    const dotColor = actionDotColor(event.action)
                    const actor = event.actor_label || event.actor_id || 'Sistema'
                    const timeAgo = (() => {
                        try {
                            return formatDistanceToNow(new Date(event.occurred_at), { addSuffix: true, locale: dateLocale })
                        } catch {
                            return event.occurred_at
                        }
                    })()
                    const fullDate = (() => {
                        try {
                            return new Date(event.occurred_at).toLocaleString(locale === 'en' ? 'en-US' : 'es-MX', {
                                ...(timeZone ? { timeZone } : {}),
                                dateStyle: 'medium',
                                timeStyle: 'short',
                            })
                        } catch {
                            return event.occurred_at
                        }
                    })()

                    return (
                        <Collapsible key={event.id} open={isOpen} onOpenChange={() => toggle(event.id)}>
                            <div className="relative">
                                {/* Timeline dot */}
                                <span
                                    className="absolute -left-5 top-3.5 h-2.5 w-2.5 rounded-full border-2 border-background -translate-x-[4px]"
                                    style={{ background: dotColor }}
                                    aria-hidden="true"
                                />

                                <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
                                    {/* Event header — always visible */}
                                    <CollapsibleTrigger asChild>
                                        <button
                                            type="button"
                                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                                        >
                                            {/* Actor avatar — the photo when the event carries one,
                                                initials otherwise */}
                                            <Avatar className="h-7 w-7 rounded-full shrink-0">
                                                {event.actor_avatar ? (
                                                    <AvatarImage
                                                        src={resolveAvatarUrl ? resolveAvatarUrl(event.actor_avatar) : event.actor_avatar}
                                                        alt={actor}
                                                    />
                                                ) : null}
                                                <AvatarFallback className="text-[9px] font-bold bg-primary/10 text-primary">
                                                    {getInitials(actor)}
                                                </AvatarFallback>
                                            </Avatar>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-semibold text-foreground truncate">
                                                        {actor}
                                                    </span>
                                                    <span className="text-sm text-muted-foreground">
                                                        {actionLabel(event.action)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <Clock className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                                                    <span className="text-xs text-muted-foreground" title={fullDate}>
                                                        {timeAgo}
                                                    </span>
                                                    {event.addon_key && (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 ml-1">
                                                            {event.addon_key}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Open the event's detail page in the activity log */}
                                            {onOpenEvent && (
                                                <span
                                                    role="button"
                                                    tabIndex={0}
                                                    aria-label="Ver en registro de actividad"
                                                    title="Ver en registro de actividad"
                                                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        onOpenEvent(event)
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault()
                                                            e.stopPropagation()
                                                            onOpenEvent(event)
                                                        }
                                                    }}
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                </span>
                                            )}

                                            {/* Expand/collapse chevron */}
                                            <span className="shrink-0 text-muted-foreground">
                                                {isOpen ? (
                                                    <ChevronDown className="h-4 w-4" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4" />
                                                )}
                                            </span>
                                        </button>
                                    </CollapsibleTrigger>

                                    {/* Diff — revealed when expanded */}
                                    <CollapsibleContent>
                                        <div className="border-t border-border/40 px-4 py-3">
                                            <ActivityDiff
                                                event={event}
                                                columns={columns}
                                                timeZone={timeZone}
                                                currency={currency}
                                                locale={locale}
                                            />
                                        </div>
                                    </CollapsibleContent>
                                </div>
                            </div>
                        </Collapsible>
                    )
                })}
            </div>
        </div>
    )
}
