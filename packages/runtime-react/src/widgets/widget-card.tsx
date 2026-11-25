// Shared "pro" card chrome for every dashboard widget. Subtle border, hover
// ring, an accent icon chip, title + optional subtitle, and a subtle mount
// motion done in pure CSS (runtime-react does not ship framer-motion). The
// chrome is identical for declarative renderers AND `kind:"custom"` federated
// widgets so they visually combine in the same grid.

import * as React from 'react'
import { Card, CardContent, CardHeader } from '@asteby/metacore-ui'
import { cn } from '@asteby/metacore-ui/lib'
import { DynamicIcon, isLucideIconName } from '../dynamic-icon'
import { accentClasses } from './widget-format'
import type { WidgetAccent } from '../dashboard-types'

export interface WidgetCardProps {
    title: string
    subtitle?: string
    icon?: string
    accent?: WidgetAccent
    /** Right-aligned header slot (e.g. a delta chip). */
    headerExtra?: React.ReactNode
    /** Body content. */
    children?: React.ReactNode
    className?: string
    /** Forwarded for testing/automation. */
    'data-testid'?: string
}

/**
 * The card frame shared by all widgets. Keep the chrome here so a single style
 * change propagates to every kind (and to federated custom widgets).
 */
export function WidgetCard({
    title,
    subtitle,
    icon,
    accent,
    headerExtra,
    children,
    className,
    ...rest
}: WidgetCardProps) {
    const a = accentClasses(accent)
    const showIcon = icon && isLucideIconName(icon)
    return (
        <Card
            {...rest}
            className={cn(
                // base: subtle border, ring on hover, gentle lift, mount fade-in
                // `@container`: the KPI value scales with the card's own width
                // (2-column phone grids give ~190px cards), see StatWidget.
                '@container group/widget relative flex h-full flex-col overflow-hidden',
                'border-border/60 transition-all duration-200',
                'hover:border-border hover:ring-1 hover:ring-ring/30 hover:shadow-sm',
                'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-500',
                className,
            )}
        >
            {/* Compact padding on narrow cards; `flex-wrap` lets the delta chip drop
                below the title instead of overlapping the icon. */}
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-x-2 gap-y-1.5 space-y-0 px-4 pb-2 pt-4 @[15rem]:px-6 @[15rem]:pt-6">
                {/* basis 7rem: below that width the delta chip wraps to its own row */}
                <div className="flex min-w-0 flex-[1_1_7rem] items-start gap-2 @[15rem]:gap-3">
                    {showIcon && (
                        <span
                            className={cn(
                                'flex size-8 shrink-0 items-center justify-center rounded-lg @[15rem]:size-9',
                                a.chip,
                            )}
                        >
                            <DynamicIcon name={icon!} className="size-4 @[15rem]:size-[18px]" />
                        </span>
                    )}
                    <div className="min-w-0 flex-1">
                        {/* Wrap up to 2 lines (never a bare "Total d…"); full text in the tooltip. */}
                        <div
                            title={title}
                            className="line-clamp-2 break-words text-sm font-medium leading-tight text-foreground"
                        >
                            {title}
                        </div>
                        {subtitle && (
                            <div
                                title={subtitle}
                                className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground"
                            >
                                {subtitle}
                            </div>
                        )}
                    </div>
                </div>
                {headerExtra && <div className="shrink-0">{headerExtra}</div>}
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-1 @[15rem]:px-6 @[15rem]:pb-6">
                {children}
            </CardContent>
        </Card>
    )
}

/** Delta chip: green up / red down, neutral on zero. `text` is preformatted. */
export function DeltaChip({ delta, text }: { delta: number; text: string }) {
    const up = delta > 0
    const down = delta < 0
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                up && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                down && 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                !up && !down && 'bg-muted text-muted-foreground',
            )}
        >
            {up && '▲'}
            {down && '▼'}
            {text}
        </span>
    )
}

/** Centered empty state inside a widget body (no data / missing). */
export function WidgetEmpty({ message }: { message: string }) {
    return (
        <div className="flex flex-1 items-center justify-center py-6 text-center text-xs text-muted-foreground">
            {message}
        </div>
    )
}

/**
 * Per-widget error state — isolated so a broken widget never tumbles the grid.
 * Pass `onRetry` to offer a retry (e.g. the widget query's `refetch`).
 */
export function WidgetError({
    message,
    onRetry,
    retryLabel = 'Reintentar',
}: {
    message: string
    onRetry?: () => void
    retryLabel?: string
}) {
    return (
        <div
            role="alert"
            className="flex flex-1 flex-wrap items-center justify-center gap-2 py-6 text-center text-xs text-destructive"
        >
            <DynamicIcon name="TriangleAlert" className="size-4" />
            <span>{message}</span>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-md border px-2 py-0.5 font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    {retryLabel}
                </button>
            )}
        </div>
    )
}
