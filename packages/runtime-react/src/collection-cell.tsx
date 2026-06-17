// Generic, brand-neutral table-cell renderer for jsonb / array / object column
// values. Kernel-derived dynamic tables surface raw jsonb columns (line items,
// nested config blobs, scalar arrays) with no per-column metadata; without this
// they rendered as raw `JSON.stringify(value)` which is unreadable. This renders
// a compact trigger (count badge / inline pairs) plus a Popover with a clean
// mini-table — no per-addon config required, safe on any shape.

import * as React from 'react'
import { Box, List } from 'lucide-react'
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
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
import { getInitials, relationChipStyles } from '@asteby/metacore-ui/lib'
import { humanizeToken } from './dynamic-columns-helpers'

/**
 * Tracks the host's dark-mode class on <html> so relation chips pick a tint
 * tuned for the active theme. Replicated from dynamic-columns (kept local to
 * avoid a cross-module import); mirror changes if that one evolves.
 */
function useIsDarkTheme(): boolean {
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

const UUID_LIKE_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Host i18n translator (react-i18next `t`), as threaded into the columns factory. */
export type Translate = (key: string, options?: any) => string

/**
 * Declared schema for one column of a jsonb line-items array. Mirrors the
 * kernel v3 `item_fields` entry the backend serves on the column metadata
 * (`col.itemFields` / snake `col.item_fields`). When present it drives the
 * popover mini-table: headers come from `label` (already LOCALIZED by the
 * backend — never re-translated here) and `ref` columns resolve to the
 * backend-injected sibling label instead of the raw uuid.
 */
export interface ItemField {
    /** jsonb key this column maps to (e.g. `product_id`, `quantity`). */
    key: string
    /** Header text — ALREADY localized by the backend. Used verbatim. */
    label: string
    /** Declarative cell type hint (informational; not branched on today). */
    type?: string
    /** FK target model. When set, the cell renders the resolved sibling label. */
    ref?: string
}

/**
 * Resolves the backend-injected resolved sibling key for a ref item-field,
 * mirroring `relationKeyFor` in dynamic-columns: the raw key with a trailing
 * `_id` stripped (`product_id` → `product`), else `<key>_label`.
 */
function siblingKeyFor(key: string): string {
    return key.endsWith('_id') ? key.slice(0, -3) : `${key}_label`
}

/** The backend-injected resolved sibling for a ref item-field. */
interface ResolvedRef {
    label?: string
    value?: unknown
    /** Optional thumbnail (product photo, logo, avatar) resolved by the backend. */
    image?: string
}

/**
 * Reads the backend-injected resolved sibling for a `ref` item-field (the FK
 * key without `_id`, else `<key>_label`). Returns the normalized `{label,
 * image}` when present, a `{label}` for a bare-string sibling, or null when the
 * ref is unresolved (so the caller falls back to the raw value).
 */
function resolvedRefFor(
    field: ItemField,
    row: Record<string, unknown>,
): ResolvedRef | null {
    if (!field.ref) return null
    const sibling = row[siblingKeyFor(field.key)]
    if (sibling && typeof sibling === 'object' && !Array.isArray(sibling)) {
        const obj = sibling as Record<string, unknown>
        const label = obj.label
        if (label !== undefined && label !== null && label !== '') {
            return {
                label: String(label),
                value: obj.value,
                image:
                    typeof obj.image === 'string' && obj.image !== ''
                        ? obj.image
                        : undefined,
            }
        }
    } else if (typeof sibling === 'string' && sibling !== '') {
        return { label: sibling }
    }
    return null
}

/**
 * Plain-text value for one declared item-field — used for the no-JS popover
 * `title` tooltip (which can't render JSX). Ref fields show the resolved label;
 * everything else uses `formatScalar` (truncated uuid for unresolved ids).
 */
function itemFieldText(field: ItemField, row: Record<string, unknown>): string {
    const ref = resolvedRefFor(field, row)
    if (ref?.label) return ref.label
    return formatScalar(row[field.key])
}

/**
 * Visual cell for one declared item-field. A resolved `ref` renders as a
 * relation chip (subtle deterministic tint + product thumbnail or a generic
 * entity icon + name) — the same "pro" look the table FK columns use — so jsonb
 * line items read like first-class relations instead of raw uuids. Non-ref (or
 * unresolved) fields render the plain scalar.
 */
function ItemFieldCell({
    field,
    row,
    getImageUrl,
}: {
    field: ItemField
    row: Record<string, unknown>
    getImageUrl?: (path: string) => string
}): React.ReactElement {
    const isDark = useIsDarkTheme()
    const ref = resolvedRefFor(field, row)
    if (ref?.label) {
        return (
            <span
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium"
                style={relationChipStyles(ref.label, { isDark })}
                title={ref.label}
            >
                {ref.image ? (
                    <Avatar
                        className="shrink-0 rounded-sm ring-1 ring-border/40"
                        style={{ width: 18, height: 18 }}
                    >
                        <AvatarImage
                            src={getImageUrl ? getImageUrl(ref.image) : ref.image}
                            alt={ref.label}
                            className="object-cover"
                        />
                        <AvatarFallback className="rounded-sm bg-primary/10 text-[8px] font-bold text-primary">
                            {getInitials(ref.label)}
                        </AvatarFallback>
                    </Avatar>
                ) : (
                    <Box className="h-3 w-3 shrink-0 opacity-70" />
                )}
                <span className="truncate">{ref.label}</span>
            </span>
        )
    }
    return <>{formatScalar(row[field.key])}</>
}

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
    itemFields,
    getImageUrl,
}: {
    rows: Record<string, unknown>[]
    locale?: string
    t?: Translate
    itemFields?: ItemField[]
    getImageUrl?: (path: string) => string
}) {
    // Schema-driven path: a declared `item_fields` schema fixes the column
    // order + headers (already localized by the backend, used VERBATIM) and
    // resolves ref columns to the injected sibling label instead of the raw
    // uuid. Sibling/raw keys not covered by the schema are dropped from the
    // table (the schema is the source of truth for what to surface).
    if (itemFields && itemFields.length > 0) {
        return (
            <Table>
                <TableHeader>
                    <TableRow>
                        {itemFields.map((field) => (
                            <TableHead
                                key={field.key}
                                className="text-xs whitespace-nowrap"
                            >
                                {field.label}
                            </TableHead>
                        ))}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {rows.map((row, i) => (
                        <TableRow key={i}>
                            {itemFields.map((field) => (
                                <TableCell
                                    key={field.key}
                                    className="text-xs whitespace-nowrap"
                                >
                                    <ItemFieldCell
                                        field={field}
                                        row={row}
                                        getImageUrl={getImageUrl}
                                    />
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        )
    }

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
    /**
     * Declared schema for the jsonb line-items columns (kernel v3 `item_fields`,
     * read from `col.itemFields ?? col.item_fields` at the callsite). When
     * present AND the value is an array of objects, the popover mini-table uses
     * these (already-localized) headers in order and resolves `ref` columns to
     * the backend-injected sibling label. Absent → the generic dict/prettify
     * behaviour is unchanged.
     */
    itemFields?: ItemField[]
    /**
     * Resolves a stored image path to a displayable URL (same resolver the table
     * columns use). Threaded to the ref-chip thumbnails so resolved line-item
     * relations show a product photo / logo / avatar like the FK columns do.
     */
    getImageUrl?: (path: string) => string
    /**
     * Presentation mode.
     *   - `'badge'` (default): the compact count/preview badge that opens a
     *     popover with the mini-table / pair-list. Used in dense table cells.
     *   - `'inline'`: render the mini-table / pair-list DIRECTLY, with no badge
     *     or popover. Used by the read-only record detail view, which has full
     *     width and shows one field per row. All schema/locale logic is shared.
     */
    variant?: 'badge' | 'inline'
}

/**
 * Generic renderer for jsonb / array / object cell values. Brand-neutral,
 * compact, dark-mode friendly, locale-aware. Never throws on unexpected shapes.
 *
 * `variant` selects the surface: the default `'badge'` shows a compact trigger
 * + popover (dense table cells); `'inline'` renders the mini-table / pair-list
 * directly for the full-width record detail view. Both paths share the
 * itemFields schema (localized headers + resolved ref labels) and the
 * locale-aware generic fallback.
 */
export function CollectionCell({
    value,
    maxInline = 3,
    locale,
    t,
    itemFields,
    getImageUrl,
    variant = 'badge',
}: CollectionCellProps) {
    const parsed = parseValue(value)
    const inline = variant === 'inline'

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
            // Inline mode (detail view): render the mini-table directly, no
            // badge/popover. The same schema-driven path applies.
            if (inline) {
                return (
                    <MiniTable
                        rows={rows}
                        locale={locale}
                        t={t}
                        itemFields={itemFields}
                        getImageUrl={getImageUrl}
                    />
                )
            }
            const count = rows.length
            const label = countLabel(count, locale, t)
            const hasSchema = !!(itemFields && itemFields.length > 0)
            // The no-JS tooltip mirrors the rendered table: schema-driven
            // labels + resolved ref values when a schema is present, else the
            // generic prettify/scalar pairs.
            const title = hasSchema
                ? rows
                      .map((row) =>
                          itemFields!
                              .map(
                                  (field) =>
                                      `${field.label}: ${itemFieldText(field, row)}`
                              )
                              .join(', ')
                      )
                      .join(' | ')
                : rows
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
                    <MiniTable
                        rows={rows}
                        locale={locale}
                        t={t}
                        itemFields={itemFields}
                        getImageUrl={getImageUrl}
                    />
                </PopoverShell>
            )
        }

        // Array of scalars (or mixed). Inline mode renders the full list; badge
        // mode previews the first N joined with a "+N" overflow trigger.
        if (inline) {
            return <ScalarList values={parsed} />
        }
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
    // Inline mode renders the full key→value pair list directly.
    if (inline) {
        return <PairList entries={entries} locale={locale} t={t} />
    }
    const previewPairs = entries
        .slice(0, maxInline)
        .map(([k, v]) => `${prettifyKey(k, locale, t)}: ${formatScalar(v)}`)
        .join(', ')
    const overflow = entries.length - maxInline
    const label = overflow > 0 ? `${previewPairs} +${overflow}` : previewPairs
    const title = entries
        .map(([k, v]) => `${prettifyKey(k, locale, t)}: ${formatScalar(v)}`)
        .join(', ')
    return (
        <PopoverShell label={label} title={title} icon={false}>
            <PairList entries={entries} locale={locale} t={t} />
        </PopoverShell>
    )
}
