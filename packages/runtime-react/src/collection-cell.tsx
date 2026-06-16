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

/** Host i18n translator (react-i18next `t`), as threaded into the columns factory. */
export type Translate = (key: string, options?: any) => string

/** Normalize an org/UI language tag to a base language code (`es-MX` → `es`). */
function baseLang(locale?: string): string {
    return (locale || 'en').toLowerCase().split('-')[0]
}

// Built-in generic data/commerce vocabulary. Localizes the common jsonb keys
// (line-item rows, config blobs) to the org language out of the box. This is
// intentionally GENERIC — no domain-specific narrative — and a host i18n bundle
// can override any key via the `t` resolver (which takes precedence). Keys not
// found here fall back to snake→Title prettify, so unknown shapes still read.
const KEY_DICTIONARY: Record<string, Record<string, string>> = {
    es: {
        product_id: 'Producto',
        product: 'Producto',
        quantity: 'Cantidad',
        qty: 'Cantidad',
        unit_cost: 'Costo unitario',
        cost: 'Costo',
        price: 'Precio',
        total: 'Total',
        subtotal: 'Subtotal',
        amount: 'Importe',
        name: 'Nombre',
        sku: 'SKU',
        code: 'Código',
        date: 'Fecha',
        notes: 'Notas',
        reason: 'Motivo',
        delta: 'Variación',
        warehouse: 'Almacén',
        description: 'Descripción',
        id: 'ID',
    },
    en: {
        product_id: 'Product',
        product: 'Product',
        quantity: 'Quantity',
        qty: 'Quantity',
        unit_cost: 'Unit Cost',
        cost: 'Cost',
        price: 'Price',
        total: 'Total',
        subtotal: 'Subtotal',
        amount: 'Amount',
        name: 'Name',
        sku: 'SKU',
        code: 'Code',
        date: 'Date',
        notes: 'Notes',
        reason: 'Reason',
        delta: 'Delta',
        warehouse: 'Warehouse',
        description: 'Description',
        id: 'ID',
    },
}

/** Localized count noun for the array-of-objects badge (`1 ítem` / `2 ítems`). */
const ITEM_NOUN: Record<string, { one: string; other: string }> = {
    es: { one: 'ítem', other: 'ítems' },
    en: { one: 'item', other: 'items' },
}

/**
 * Localized key label for a popover column header. Resolution order:
 *   (a) host i18n `t(rawKey)` if it resolves to something ≠ rawKey;
 *   (b) the built-in generic es/en data/commerce dictionary;
 *   (c) snake_case → Title Case prettify (`product_id` → "Product ID").
 * `locale` defaults to 'en' when absent.
 */
export function prettifyKey(
    key: string,
    locale?: string,
    t?: Translate,
): string {
    if (t) {
        const translated = t(key)
        if (translated && translated !== key) return translated
    }
    const lang = baseLang(locale)
    const dict = KEY_DICTIONARY[lang] ?? KEY_DICTIONARY.en
    const hit = dict[key.toLowerCase()]
    if (hit) return hit
    const pretty = humanizeToken(key)
    return pretty || key
}

/**
 * Localized, pluralized count noun. Prefers the host i18n `t` (react-i18next
 * count plural via `defaultValue`); otherwise the built-in es/en noun map.
 */
export function countLabel(
    count: number,
    locale?: string,
    t?: Translate,
): string {
    const lang = baseLang(locale)
    const noun = ITEM_NOUN[lang] ?? ITEM_NOUN.en
    const fallback = `${count} ${count === 1 ? noun.one : noun.other}`
    if (t) {
        const translated = t('runtime.collectionCell.itemCount', {
            count,
            defaultValue: fallback,
        })
        if (translated && translated !== 'runtime.collectionCell.itemCount') {
            return translated
        }
    }
    return fallback
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

function MiniTable({
    rows,
    locale,
    t,
}: {
    rows: Record<string, unknown>[]
    locale?: string
    t?: Translate
}) {
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
                            {prettifyKey(key, locale, t)}
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

function PairList({
    entries,
    locale,
    t,
}: {
    entries: [string, unknown][]
    locale?: string
    t?: Translate
}) {
    return (
        <ul className="p-3 space-y-1">
            {entries.map(([key, v]) => (
                <li key={key} className="text-xs">
                    <span className="text-muted-foreground">
                        {prettifyKey(key, locale, t)}:
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
    /** Org/UI language tag (e.g. `es`, `en-US`). Defaults to `'en'`. */
    locale?: string
    /** Host i18n translator; takes precedence over the built-in dictionary. */
    t?: Translate
}

/**
 * Generic renderer for jsonb / array / object cell values. Brand-neutral,
 * compact, dark-mode friendly, locale-aware. Never throws on unexpected shapes.
 */
export function CollectionCell({
    value,
    maxInline = 3,
    locale,
    t,
}: CollectionCellProps) {
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
            const label = countLabel(count, locale, t)
            const title = rows
                .map((row) =>
                    Object.entries(row)
                        .map(
                            ([k, v]) =>
                                `${prettifyKey(k, locale, t)}: ${formatScalar(v)}`
                        )
                        .join(', ')
                )
                .join(' | ')
            return (
                <PopoverShell label={label} title={title}>
                    <MiniTable rows={rows} locale={locale} t={t} />
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
        .map(([k, v]) => `${prettifyKey(k, locale, t)}: ${formatScalar(v)}`)
        .join(', ')
    const overflow = entries.length - maxInline
    const label = overflow > 0 ? `${inline} +${overflow}` : inline
    const title = entries
        .map(([k, v]) => `${prettifyKey(k, locale, t)}: ${formatScalar(v)}`)
        .join(', ')
    return (
        <PopoverShell label={label} title={title} icon={false}>
            <PairList entries={entries} locale={locale} t={t} />
        </PopoverShell>
    )
}
