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
                'group/widget relative flex h-full flex-col overflow-hidden',
                'border-border/60 transition-all duration-200',
                'hover:border-border hover:ring-1 hover:ring-ring/30 hover:shadow-sm',
                'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-500',
                className,
            )}
        >
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-2">
                <div className="flex min-w-0 items-start gap-3">
                    {showIcon && (
                        <span
                            className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-lg',
                                a.chip,
                            )}
                        >
                            <DynamicIcon name={icon!} className="size-[18px]" />
                        </span>
                    )}
                    <div className="min-w-0">
                        <div className="truncate text-sm font-medium leading-tight text-foreground">
                            {title}
                        </div>
                        {subtitle && (
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                {subtitle}
                            </div>
                        )}
                    </div>
                </div>
                {headerExtra && <div className="shrink-0">{headerExtra}</div>}
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-end pt-1">
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

/** Per-widget error state — isolated so a broken widget never tumbles the grid. */
export function WidgetError({ message }: { message: string }) {
    return (
        <div className="flex flex-1 items-center justify-center gap-2 py-6 text-center text-xs text-destructive">
            <DynamicIcon name="TriangleAlert" className="size-4" />
            <span>{message}</span>
        </div>
    )
}
