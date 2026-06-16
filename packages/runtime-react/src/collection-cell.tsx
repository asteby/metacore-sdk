// Generic, brand-neutral table-cell renderer for jsonb / array / object column
// values. Kernel-derived dynamic tables surface raw jsonb columns (line items,
// nested config blobs, scalar arrays) with no per-column metadata; without this
// they rendered as raw `JSON.stringify(value)` which is unreadable. This renders
// a compact trigger (count badge / inline pairs) plus a Popover with a clean
// mini-table — no per-addon config required, safe on any shape.

import * as React from 'react'
import { List } from 'lucide-react'
import {
    Badge,
    Popover,
    PopoverContent,
    PopoverTrigger,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    cn,
} from '@asteby/metacore-ui'
import { humanizeToken } from './dynamic-columns-helpers'

const UUID_LIKE_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** snake_case / dotted / kebab key → Title Case (`product_id` → "Product ID"). */
export function prettifyKey(key: string): string {
    const pretty = humanizeToken(key)
    return pretty || key
}

/**
 * Render a single scalar (or near-scalar) value for compact display.
 * - uuid-like or very long (32+ char) strings → first 8 chars + "…"
 * - numbers / booleans → rendered as-is (booleans as ✓ / ✗)
 * - nested object → "{…}", nested array → "[N]"
 * - null / undefined / "" → "-"
 */
export function formatScalar(value: unknown): string {
    if (value === null || value === undefined) return '-'
    if (typeof value === 'boolean') return value ? '✓' : '✗'
    if (typeof value === 'number') return String(value)
    if (Array.isArray(value)) return `[${value.length}]`
    if (typeof value === 'object') return '{…}'
    const str = String(value)
    if (str === '') return '-'
    if (UUID_LIKE_RE.test(str) || str.length >= 32) {
        return `${str.slice(0, 8)}…`
    }
    return str
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Defensively coerce a raw cell value into something renderable. Strings that
 * look like JSON (`[`/`{` start) are parsed; everything else is passed through.
 */
function parseValue(value: unknown): unknown {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    if (
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
    ) {
        try {
            return JSON.parse(trimmed)
        } catch {
            return value
        }
    }
    return value
}

/** Stable union of keys across an array of row objects, first-seen order. */
function unionKeys(rows: Record<string, unknown>[]): string[] {
    const seen: string[] = []
    const set = new Set<string>()
    for (const row of rows) {
        for (const key of Object.keys(row)) {
            if (!set.has(key)) {
                set.add(key)
                seen.push(key)
            }
        }
    }
    return seen
}

const PANEL_CLASS = 'w-auto max-w-[480px] max-h-[320px] overflow-auto p-0'

function MiniTable({ rows }: { rows: Record<string, unknown>[] }) {
    const keys = unionKeys(rows)
    if (keys.length === 0) {
        return <div className="p-3 text-xs text-muted-foreground">-</div>
    }
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    {keys.map((key) => (
                        <TableHead key={key} className="text-xs whitespace-nowrap">
                            {prettifyKey(key)}
                        </TableHead>
                    ))}
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((row, i) => (
                    <TableRow key={i}>
                        {keys.map((key) => (
                            <TableCell
                                key={key}
                                className="text-xs whitespace-nowrap"
                            >
                                {formatScalar(row[key])}
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    )
}

function ScalarList({ values }: { values: unknown[] }) {
    return (
        <ul className="p-3 space-y-1">
            {values.map((v, i) => (
                <li key={i} className="text-xs text-foreground">
                    {formatScalar(v)}
                </li>
            ))}
        </ul>
    )
}

function PairList({ entries }: { entries: [string, unknown][] }) {
    return (
        <ul className="p-3 space-y-1">
            {entries.map(([key, v]) => (
                <li key={key} className="text-xs">
                    <span className="text-muted-foreground">
                        {prettifyKey(key)}:
                    </span>{' '}
                    <span className="text-foreground">{formatScalar(v)}</span>
                </li>
            ))}
        </ul>
    )
}

/** Compact badge trigger that opens a popover panel. */
function PopoverShell({
    label,
    title,
    children,
    icon = true,
}: {
    label: string
    title: string
    children: React.ReactNode
    icon?: boolean
}) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Badge
                    variant="secondary"
                    className="cursor-pointer gap-1 font-normal"
                    title={title}
                >
                    {icon ? <List className="h-3 w-3" /> : null}
                    {label}
                </Badge>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className={cn(PANEL_CLASS)}
            >
                {children}
            </PopoverContent>
        </Popover>
    )
}

export interface CollectionCellProps {
    value: unknown
    /** Max items previewed inline for scalar arrays. */
    maxInline?: number
}

/**
 * Generic renderer for jsonb / array / object cell values. Brand-neutral,
 * compact, dark-mode friendly. Never throws on unexpected shapes.
 */
export function CollectionCell({ value, maxInline = 3 }: CollectionCellProps) {
    const parsed = parseValue(value)

    // Empty-ish → muted dash.
    if (
        parsed === null ||
        parsed === undefined ||
        parsed === '' ||
        (Array.isArray(parsed) && parsed.length === 0) ||
        (isPlainObject(parsed) && Object.keys(parsed).length === 0)
    ) {
        return <span className="text-muted-foreground text-xs">-</span>
    }

    // Non-collection scalar fell through here (e.g. unparseable string): truncate.
    if (!Array.isArray(parsed) && !isPlainObject(parsed)) {
        const str = String(parsed)
        return (
            <span
                className="text-muted-foreground text-xs truncate block max-w-[300px]"
                title={str}
            >
                {str.length > 80 ? `${str.slice(0, 80)}…` : str}
            </span>
        )
    }

    // ARRAY ------------------------------------------------------------------
    if (Array.isArray(parsed)) {
        const allObjects = parsed.every((item) => isPlainObject(item))
        if (allObjects) {
            const rows = parsed as Record<string, unknown>[]
            const count = rows.length
            const label = count === 1 ? '1 ítem' : `${count} ítems`
            const title = rows
                .map((row) =>
                    Object.entries(row)
                        .map(([k, v]) => `${prettifyKey(k)}: ${formatScalar(v)}`)
                        .join(', ')
                )
                .join(' | ')
            return (
                <PopoverShell label={label} title={title}>
                    <MiniTable rows={rows} />
                </PopoverShell>
            )
        }

        // Array of scalars (or mixed): preview first N joined, "+N" overflow.
        const preview = parsed.slice(0, maxInline).map(formatScalar).join(', ')
        const overflow = parsed.length - maxInline
        const label =
            overflow > 0 ? `${preview} +${overflow}` : preview
        const title = parsed.map(formatScalar).join(', ')
        return (
            <PopoverShell label={label} title={title} icon={false}>
                <ScalarList values={parsed} />
            </PopoverShell>
        )
    }

    // PLAIN OBJECT -----------------------------------------------------------
    const entries = Object.entries(parsed)
    const inline = entries
        .slice(0, maxInline)
        .map(([k, v]) => `${prettifyKey(k)}: ${formatScalar(v)}`)
        .join(', ')
    const overflow = entries.length - maxInline
    const label = overflow > 0 ? `${inline} +${overflow}` : inline
    const title = entries
        .map(([k, v]) => `${prettifyKey(k)}: ${formatScalar(v)}`)
        .join(', ')
    return (
        <PopoverShell label={label} title={title} icon={false}>
            <PairList entries={entries} />
        </PopoverShell>
    )
}
