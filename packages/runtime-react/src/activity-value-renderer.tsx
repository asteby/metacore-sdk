/**
 * activity-value-renderer.tsx
 *
 * Pure, transport-agnostic value renderer for Activity / Time Machine diffs.
 * Reuses the same display-type logic as dynamic-columns.tsx (currency, status,
 * date, boolean, badge, relation, url, tags, color, number, percent) so the
 * diff cells and the table cells are always consistent.
 *
 * Kept in its own module so it has no dependency on tanstack-table or the
 * column-factory machinery — only React + metacore-ui primitives.
 */

import * as React from 'react'
import * as icons from 'lucide-react'
import { es, enUS } from 'date-fns/locale'
import {
    Badge,
    Avatar,
    AvatarImage,
    AvatarFallback,
} from '@asteby/metacore-ui/primitives'
import { generateBadgeStyles, getInitials, optionColor, relationChipStyles } from '@asteby/metacore-ui/lib'
import type { ColumnDefinition } from './types'
import { formatDateCell } from './dynamic-columns'
import { humanizeToken } from './dynamic-columns-helpers'

// ---------------------------------------------------------------------------
// Internal helpers (mirror dynamic-columns.tsx private helpers)
// ---------------------------------------------------------------------------

const styleCfg = (col: ColumnDefinition, ...keys: string[]): any => {
    const cfg = col.styleConfig
    if (!cfg) return undefined
    for (const k of keys) {
        if (cfg[k] !== undefined && cfg[k] !== null) return cfg[k]
    }
    return undefined
}

const formatNumber = (value: number, opts: Intl.NumberFormatOptions, locale?: string) =>
    new Intl.NumberFormat(locale || undefined, opts).format(value)

const statusColorFor = (value: string): string => {
    const v = value.toLowerCase()
    if (['active', 'enabled', 'paid', 'completed', 'done', 'success', 'approved', 'open'].includes(v))
        return '#22c55e'
    if (['pending', 'draft', 'processing', 'in_progress', 'review', 'waiting'].includes(v))
        return '#eab308'
    if (['inactive', 'disabled', 'cancelled', 'canceled', 'failed', 'rejected', 'error', 'closed'].includes(v))
        return '#ef4444'
    return '#6b7280'
}

// resolvedEntity — a diff snapshot value may be the backend-resolved sibling
// object ({value,label} relation, {name,avatar,email} user). Surface its human
// identity instead of raw JSON. Returns undefined for anything else.
function resolvedEntity(value: unknown): { name: string; avatar?: string; email?: string } | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const v = value as Record<string, unknown>
    const name = v.name ?? v.label ?? v.title
    if (typeof name !== 'string' || name === '') return undefined
    const avatar = typeof v.avatar === 'string' && v.avatar !== '' ? v.avatar : undefined
    const email = typeof v.email === 'string' && v.email !== '' ? v.email : undefined
    return { name, avatar, email }
}

const EntityChip: React.FC<{ entity: { name: string; avatar?: string; email?: string } }> = ({ entity }) => (
    <span className="inline-flex items-center gap-1.5" title={entity.email}>
        <Avatar className="h-5 w-5 rounded-full">
            <AvatarImage src={entity.avatar ?? ''} alt={entity.name} />
            <AvatarFallback className="text-[8px] font-bold bg-primary/10 text-primary">
                {getInitials(entity.name)}
            </AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium truncate" style={{ maxWidth: 180 }}>{entity.name}</span>
    </span>
)

const useIsDarkTheme = () => {
    const [isDark, setIsDark] = React.useState(() =>
        typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
    )
    React.useEffect(() => {
        if (typeof document === 'undefined') return
        const sync = () => setIsDark(document.documentElement.classList.contains('dark'))
        const observer = new MutationObserver(sync)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        return () => observer.disconnect()
    }, [])
    return isDark
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ActivityValueRendererProps {
    /** The raw value to display (from before/after/changes). */
    value: unknown
    /** Column metadata for display formatting. Optional — falls back to string. */
    col?: ColumnDefinition
    /** IANA timezone (org config) for datetime cells. */
    timeZone?: string
    /** ISO 4217 currency for money cells. */
    currency?: string
    /** BCP-47 locale tag (e.g. 'es', 'en'). Defaults to 'es'. */
    locale?: string
}

/**
 * Renders a single field value from an activity event using the same display
 * type logic as `defaultGetDynamicColumns`. Pass a `ColumnDefinition` to get
 * rich formatting (currency, status badge, date, boolean, etc.); without it
 * the component falls back to a plain string representation.
 */
export const ActivityValueRenderer: React.FC<ActivityValueRendererProps> = ({
    value,
    col,
    timeZone,
    currency,
    locale = 'es',
}) => {
    const isDark = useIsDarkTheme()
    const dateLocale = locale === 'en' ? enUS : es

    // null / undefined → dash
    if (value === null || value === undefined || value === '') {
        return <span className="text-muted-foreground">—</span>
    }

    // No column metadata → entity chip when the value is a resolved object,
    // plain string otherwise.
    if (!col) {
        if (typeof value === 'object') {
            const entity = resolvedEntity(value)
            if (entity) return <EntityChip entity={entity} />
            return (
                <span className="text-muted-foreground text-xs font-mono">
                    {JSON.stringify(value)}
                </span>
            )
        }
        return <span className="font-medium text-sm">{String(value)}</span>
    }

    const renderAs = col.cellStyle ?? col.type

    // -----------------------------------------------------------------------
    // Badge / Status / Select / Option
    // -----------------------------------------------------------------------

    if (renderAs === 'badge' || renderAs === 'status' || renderAs === 'select' || renderAs === 'option') {
        const sv = String(value)
        const option = col.options?.find((o) => o.value === sv)
        if (option) {
            const colorSource = option.color || optionColor(option.value || option.label)
            const styles = generateBadgeStyles(colorSource, { isDark })
            return (
                <Badge variant="outline" className="border-0" style={styles}>
                    {option.label}
                </Badge>
            )
        }
        if (renderAs === 'status') {
            const styles = generateBadgeStyles(statusColorFor(sv), { isDark })
            return (
                <Badge variant="outline" className="border-0" style={styles}>
                    {humanizeToken(sv)}
                </Badge>
            )
        }
        return <Badge variant="outline">{humanizeToken(sv)}</Badge>
    }

    // -----------------------------------------------------------------------
    // Date / Datetime / Timestamp
    // -----------------------------------------------------------------------

    if (['date', 'datetime', 'timestamp', 'timestamptz'].includes(renderAs ?? '')) {
        const formatted = formatDateCell(value, renderAs, dateLocale, timeZone)
        if (!formatted) return <span className="text-muted-foreground">—</span>
        return (
            <span
                className="inline-flex items-center gap-1 text-sm text-muted-foreground"
                title={formatted.title}
            >
                <icons.Calendar className="h-3 w-3 opacity-60" />
                {formatted.display}
            </span>
        )
    }

    // -----------------------------------------------------------------------
    // Boolean
    // -----------------------------------------------------------------------

    if (renderAs === 'boolean') {
        return (
            <span className="inline-flex items-center gap-1">
                {value ? (
                    <icons.Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                    <icons.Minus className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-sm text-muted-foreground">{value ? 'Sí' : 'No'}</span>
            </span>
        )
    }

    // -----------------------------------------------------------------------
    // Currency
    // -----------------------------------------------------------------------

    if (renderAs === 'currency') {
        const num = typeof value === 'number' ? value : Number(value)
        if (isNaN(num)) return <span className="text-muted-foreground">—</span>
        const decimals = styleCfg(col, 'decimals') ?? 2
        const curr = styleCfg(col, 'currency') || currency || 'USD'
        return (
            <span className="font-medium tabular-nums text-sm">
                {formatNumber(num, { style: 'currency', currency: curr, minimumFractionDigits: decimals, maximumFractionDigits: decimals }, locale)}
            </span>
        )
    }

    // -----------------------------------------------------------------------
    // Number / Percent / Progress
    // -----------------------------------------------------------------------

    if (renderAs === 'number') {
        const num = typeof value === 'number' ? value : Number(value)
        if (isNaN(num)) return <span className="text-muted-foreground">—</span>
        const decimals = styleCfg(col, 'decimals')
        return (
            <span className="font-medium tabular-nums text-sm">
                {formatNumber(
                    num,
                    decimals !== undefined ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals } : {},
                    locale,
                )}
            </span>
        )
    }

    if (renderAs === 'percent' || renderAs === 'progress') {
        const num = typeof value === 'number' ? value : Number(value)
        if (isNaN(num)) return <span className="text-muted-foreground">—</span>
        return (
            <span className="font-medium tabular-nums text-sm text-muted-foreground">
                {Math.round(Math.max(0, Math.min(100, num)))}%
            </span>
        )
    }

    // -----------------------------------------------------------------------
    // Tags
    // -----------------------------------------------------------------------

    if (renderAs === 'tags') {
        const list: string[] = Array.isArray(value)
            ? value.map(String)
            : String(value).split(',').map((s) => s.trim()).filter(Boolean)
        if (list.length === 0) return <span className="text-muted-foreground">—</span>
        return (
            <span className="inline-flex flex-wrap gap-1">
                {list.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="px-1.5 py-0 text-[10px]">
                        {tag}
                    </Badge>
                ))}
            </span>
        )
    }

    // -----------------------------------------------------------------------
    // Color
    // -----------------------------------------------------------------------

    if (renderAs === 'color') {
        const hex = String(value)
        return (
            <span className="inline-flex items-center gap-1.5">
                <span className="h-3.5 w-3.5 rounded border border-border/60 shrink-0" style={{ background: hex }} />
                <code className="font-mono text-xs text-muted-foreground">{hex}</code>
            </span>
        )
    }

    // -----------------------------------------------------------------------
    // URL / Link
    // -----------------------------------------------------------------------

    if (renderAs === 'url' || renderAs === 'link') {
        const urlStr = String(value)
        const href = /^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`
        let label: string
        try { label = new URL(href).hostname } catch { label = urlStr }
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
            >
                <icons.ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate" style={{ maxWidth: 200 }}>{label}</span>
            </a>
        )
    }

    // -----------------------------------------------------------------------
    // Email
    // -----------------------------------------------------------------------

    if (renderAs === 'email') {
        const email = String(value)
        return (
            <a
                href={`mailto:${email}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                onClick={(e) => e.stopPropagation()}
            >
                <icons.Mail className="h-3 w-3 shrink-0" />
                <span className="truncate" style={{ maxWidth: 200 }}>{email}</span>
            </a>
        )
    }

    // -----------------------------------------------------------------------
    // Relation chip (FK / reference)
    // -----------------------------------------------------------------------

    if (renderAs === 'relation' || renderAs === 'reference' || col.ref) {
        const sv = resolvedEntity(value)?.name ?? (typeof value === 'object' ? JSON.stringify(value) : String(value))
        const chipStyles = relationChipStyles(sv, { isDark })
        return (
            <span
                className="inline-flex items-center rounded-md px-2 py-0.5 text-sm font-medium"
                style={{ ...chipStyles, maxWidth: 180 }}
                title={sv}
            >
                <span className="truncate">{sv}</span>
            </span>
        )
    }

    // -----------------------------------------------------------------------
    // Creator / User / Avatar — these carry an object (resolved by the backend);
    // in a diff snapshot the value is likely a string (name/email) or the object.
    // -----------------------------------------------------------------------

    if (renderAs === 'creator' || renderAs === 'user' || renderAs === 'avatar' || renderAs === 'search') {
        const entity = resolvedEntity(value) ?? { name: typeof value === 'object' ? JSON.stringify(value) : String(value) }
        return <EntityChip entity={entity} />
    }

    // -----------------------------------------------------------------------
    // Code / truncate-text / phone
    // -----------------------------------------------------------------------

    if (renderAs === 'code' || renderAs === 'truncate-text') {
        const sv = String(value)
        const maxLength = styleCfg(col, 'max_length', 'maxLength')
        const display = maxLength && sv.length > maxLength ? `${sv.slice(0, maxLength)}…` : sv
        return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{display}</code>
    }

    // -----------------------------------------------------------------------
    // Generic object fallback — resolved entities render as a chip, the rest
    // as raw JSON.
    // -----------------------------------------------------------------------

    if (typeof value === 'object') {
        const entity = resolvedEntity(value)
        if (entity) return <EntityChip entity={entity} />
        return (
            <span className="text-muted-foreground text-xs font-mono">
                {JSON.stringify(value)}
            </span>
        )
    }

    // -----------------------------------------------------------------------
    // Plain text fallback
    // -----------------------------------------------------------------------

    return <span className="font-medium text-sm">{String(value)}</span>
}
