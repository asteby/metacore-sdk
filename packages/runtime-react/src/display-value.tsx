/**
 * Shared display-value primitives.
 *
 * These are the building blocks the dynamic TABLE (`dynamic-columns.tsx`) uses
 * to render "pro" cells — colored option badges, relation thumbnails, semantic
 * status colors, dark-mode detection. They live here (instead of inline in the
 * table) so the read-only DETAIL DIALOG (`dialogs/dynamic-record.tsx`) can reuse
 * the EXACT same rendering. Ecosystem rule: shared primitives, zero copy-paste —
 * table and dialog must not drift.
 */
import React from 'react'
import { Avatar, AvatarImage, AvatarFallback, Badge } from '@asteby/metacore-ui'
import {
    generateBadgeStyles,
    getInitials,
    optionColor,
} from '@asteby/metacore-ui/lib'
import { DynamicIcon } from './dynamic-icon'

/**
 * `true` when the host document is in dark mode. Observes the `<html>` class so
 * badge colors re-derive on theme toggle. SSR/no-DOM safe (starts light).
 */
export function useIsDarkTheme(): boolean {
    const [isDark, setIsDark] = React.useState(
        () =>
            typeof document !== 'undefined' &&
            document.documentElement.classList.contains('dark')
    )
    React.useEffect(() => {
        if (typeof document === 'undefined') return
        const sync = () =>
            setIsDark(document.documentElement.classList.contains('dark'))
        sync()
        const observer = new MutationObserver(sync)
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class'],
        })
        return () => observer.disconnect()
    }, [])
    return isDark
}

/**
 * Semantic status → badge color. Used by the `status` cell/value when no
 * explicit `options` color is declared. Generic, value-driven mapping.
 */
export function statusColorFor(value: string): string {
    const v = value.toLowerCase()
    if (
        ['active', 'enabled', 'paid', 'completed', 'done', 'success', 'approved', 'open']
            .includes(v)
    )
        return '#22c55e'
    if (['pending', 'draft', 'processing', 'in_progress', 'review', 'waiting'].includes(v))
        return '#eab308'
    if (
        ['inactive', 'disabled', 'cancelled', 'canceled', 'failed', 'rejected', 'error', 'closed']
            .includes(v)
    )
        return '#ef4444'
    return '#6b7280'
}

/**
 * Tiny square thumbnail for a resolved relation/option that carries an `image`
 * (brand logo, product photo, customer/user avatar). Uses the same Avatar
 * primitive as the `avatar`/`creator` cells so a broken/loading image
 * gracefully falls back to the record's initials. Sized small (inline style so
 * an addon-arbitrary Tailwind class never gets dropped by a consuming app's
 * class scan). Rendered inline alongside a label — never alone.
 */
export const RelationThumbnail: React.FC<{
    src: string
    alt: string
    getImageUrl?: (path: string) => string
    size?: number
}> = ({ src, alt, getImageUrl, size = 18 }) => (
    <Avatar
        className="shrink-0 rounded-md ring-1 ring-border/40"
        style={{ width: size, height: size }}
    >
        <AvatarImage
            src={getImageUrl ? getImageUrl(src) : src}
            alt={alt}
            className="object-cover"
        />
        <AvatarFallback className="rounded-md bg-primary/10 text-[8px] font-bold text-primary">
            {getInitials(alt)}
        </AvatarFallback>
    </Avatar>
)

export interface DisplayOption {
    value: string
    label: string
    icon?: string
    color?: string
    image?: string
    /**
     * Secondary identifier shown UNDER the label (muted, smaller) — a product's
     * SKU/barcode, a user's email, etc. Lets a reference chip read like
     * "Camiseta / SKU-001" instead of a bare name, so a resolved record is
     * unambiguous. Populated declaratively: the backend projects it as the
     * option/relation `description` (SearchConfig/FieldOptionsConfig.Description,
     * or a column's `label_description`). Absent → single-line label as before.
     */
    subtitle?: string
}

/**
 * Colored option badge — the canonical "pro" pill for a select/status/badge
 * value. Explicit backend `color` wins; otherwise a stable, cohesive color is
 * derived from the option value so "dead" gray badges come alive. Inline style
 * (hex-derived) so it works regardless of the host's tailwind safelist —
 * addon-arbitrary classes aren't in the host scan.
 */
export const OptionBadge: React.FC<{
    option: DisplayOption
    getImageUrl?: (path: string) => string
    /** Accepted for call-site compatibility with the table; unused (option.label wins). */
    fallback?: string
}> = ({ option, getImageUrl }) => {
    const isDark = useIsDarkTheme()
    const colorSource = option.color || optionColor(option.value || option.label)
    const colorStyles = generateBadgeStyles(colorSource, { isDark })
    return (
        <Badge variant="outline" className="flex items-center gap-1 border-0" style={colorStyles}>
            {option.image ? (
                <RelationThumbnail
                    src={option.image}
                    alt={option.label}
                    getImageUrl={getImageUrl}
                    size={option.subtitle ? 22 : 16}
                />
            ) : (
                option.icon && <DynamicIcon name={option.icon} className="h-3.5 w-3.5" />
            )}
            {option.subtitle ? (
                // Two-line identity: label on top, the secondary identifier
                // (SKU/email/…) muted underneath. `leading-tight` keeps the pill
                // compact; the subtitle inherits the badge's fg at reduced opacity
                // so it reads as secondary on any color.
                <span className="flex flex-col leading-tight text-start">
                    <span>{option.label}</span>
                    <span className="text-[0.7rem] opacity-70">{option.subtitle}</span>
                </span>
            ) : (
                <span>{option.label}</span>
            )}
        </Badge>
    )
}
