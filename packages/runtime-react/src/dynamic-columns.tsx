// Default `getDynamicColumns` factory used by hosts that don't need a custom
// renderer. Supports every cell type produced by kernel/dynamic metadata:
// badge (static + endpoint-loaded options), avatar/search, creator/user,
// phone, date, boolean, relation-badge-list, media-gallery, image, plus the
// declarative pro renderers url/link, email, currency, number, percent/
// progress, status, tags, color, code/truncate-text, relation (resolved FK
// chip), option/select badges, and a generic text fallback. The renderer
// resolves `cellStyle ?? type` for each column.
//
// The implementation was previously duplicated across multiple host apps
// (~550 LOC each, drifting). It now lives here so a single fix propagates
// to every host. Hosts inject app-specific URL helpers via the `helpers`
// argument so the SDK stays free of environment-bound code.

import * as React from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { format, type Locale } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import * as icons from 'lucide-react'
import { MoreHorizontal } from 'lucide-react'
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    Badge,
    Button,
    Checkbox,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@asteby/metacore-ui'
import {
    DataTableColumnHeader,
    FilterableColumnHeader,
    type ColumnFilterMeta,
} from '@asteby/metacore-ui/data-table'
import {
    generateBadgeStyles,
    getInitials,
    optionColor,
    relationChipStyles,
} from '@asteby/metacore-ui/lib'
import { Progress } from './dialogs/_primitives'
import { humanizeToken } from './dynamic-columns-helpers'
import { OptionsContext } from './options-context'
import { DynamicIcon } from './dynamic-icon'
import { isNilUuid, normalizeNilUuid } from './nil-uuid'
import type { TableMetadata, ColumnDefinition } from './types'
import { isColumnVisibleInTable } from './column-visibility'
import type {
    ColumnFilterConfig,
    GetDynamicColumns,
} from './dynamic-columns-shim'

/** Host-supplied helpers consumed by avatar/image cell renderers. */
export interface DynamicColumnsHelpers {
    /**
     * Resolves a relative or absolute media path into a renderable URL. Hosts
     * typically prepend their CDN/storage base. If omitted, paths are passed
     * through verbatim.
     */
    getImageUrl?: (path: string) => string
    /**
     * API origin used to build avatar URLs when the row carries a bare filename
     * instead of an absolute URL or sibling `.avatar` field. Usually
     * `import.meta.env.VITE_API_URL.replace('/api', '')`.
     */
    apiBaseUrl?: string
}

const defaultGetImageUrl = (path: string) => path

const getNestedValue = (obj: any, path: string) =>
    path.split('.').reduce((acc, part) => acc && acc[part], obj)

/**
 * Reads a styleConfig key tolerating both snake_case (emitted by the kernel)
 * and camelCase (sometimes produced by compiled models). Returns the first
 * defined match, e.g. `cfg('label_field', 'labelField')`.
 */
const styleCfg = (
    col: ColumnDefinition,
    ...keys: string[]
): any => {
    const cfg = col.styleConfig
    if (!cfg) return undefined
    for (const k of keys) {
        if (cfg[k] !== undefined && cfg[k] !== null) return cfg[k]
    }
    return undefined
}

const EmptyCell = () => <span className="text-muted-foreground">-</span>

/**
 * Resolves the active currency for a column: the column's explicit currency
 * style wins, then the org-level fallback (org config, like `timeZone`), then
 * 'USD' as a last resort.
 */
export const resolveCurrency = (col: ColumnDefinition, orgCurrency?: string): string =>
    styleCfg(col, 'currency') || orgCurrency || 'USD'

const formatNumber = (
    value: number,
    opts: Intl.NumberFormatOptions,
    locale?: string,
) => new Intl.NumberFormat(locale || undefined, opts).format(value)

/**
 * Reads the column's footer-aggregate opt-in. A column opts into the table
 * footer total via its manifest `display_config.aggregate` (mapped by the
 * kernel to `styleConfig.aggregate` at runtime). Returns the aggregate kind
 * (e.g. `'sum'`) or undefined when the column carries no footer total.
 */
export const aggregateOf = (col: ColumnDefinition): string | undefined => {
    const v = styleCfg(col, 'aggregate')
    return typeof v === 'string' && v !== '' ? v : undefined
}

/**
 * Formats a footer aggregate total with the SAME rules the body cells use:
 * currency columns render as the org currency (resolveCurrency), number
 * columns honour `styleConfig.decimals`, everything else falls back to a
 * locale-formatted number. Non-numeric/empty totals render as a dash so an
 * empty filtered set reads cleanly.
 */
export const formatAggregateTotal = (
    col: ColumnDefinition,
    value: unknown,
    currency?: string,
    locale?: string,
): string => {
    const num = typeof value === 'number' ? value : Number(value)
    if (value === null || value === undefined || isNaN(num)) return '—'
    const renderAs = col.cellStyle ?? col.type
    if (renderAs === 'currency') {
        const decimals = styleCfg(col, 'decimals') ?? 2
        return formatNumber(
            num,
            {
                style: 'currency',
                currency: resolveCurrency(col, currency),
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            },
            locale,
        )
    }
    const decimals = styleCfg(col, 'decimals')
    return formatNumber(
        num,
        decimals !== undefined
            ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
            : {},
        locale,
    )
}

/**
 * Semantic status → badge color. Used by the `status` cell when no explicit
 * `options` color is declared. Generic, value-driven mapping.
 */
const statusColorFor = (value: string): string => {
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

/** Copyable monospaced text cell (code/IDs/hashes). */
const CodeCell: React.FC<{ text: string; maxLength?: number }> = ({ text, maxLength }) => {
    const [copied, setCopied] = React.useState(false)
    const display =
        maxLength && text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
    const onCopy = () => {
        try {
            navigator.clipboard?.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
        } catch {
            /* clipboard unavailable */
        }
    }
    return (
        <div className="group flex items-center gap-1.5">
            <code
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground/80"
                title={text}
            >
                {display}
            </code>
            <button
                type="button"
                onClick={onCopy}
                className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                aria-label="Copiar"
                title="Copiar"
            >
                {copied ? (
                    <icons.Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                    <icons.Copy className="h-3.5 w-3.5" />
                )}
            </button>
        </div>
    )
}

/**
 * State-machine gate for per-row actions.
 *
 * An action that declares a non-empty `requiresState` (camelCase) / `requires_state`
 * (snake_case, as served by some backends) is only surfaced for rows whose `status`
 * field value is contained in that array. This hides e.g. an "Iniciar trabajo"
 * action (requiresState: ['reception']) on an order already in `in_progress`.
 *
 * Null-safe & non-regressive:
 *   - action without requiresState (or empty array)  → always shown.
 *   - row with no `status` field                      → all actions shown.
 */
export const isActionAllowedForRowState = (action: any, row: any): boolean => {
    const requires: unknown = action?.requiresState ?? action?.requires_state
    if (!Array.isArray(requires) || requires.length === 0) return true
    const status = row?.status
    if (status === undefined || status === null || status === '') return true
    return requires.map(String).includes(String(status))
}

const lowerFirst = (value?: string) => {
    if (!value) return value
    return value.charAt(0).toLowerCase() + value.slice(1)
}

const getPathVariants = (path?: string) => {
    if (!path) return []
    const normalized = path
        .split('.')
        .map((segment) => lowerFirst(segment) || segment)
        .join('.')
    return Array.from(new Set([path, normalized])).filter(Boolean)
}

const getValueFromPathVariants = (obj: any, path?: string) => {
    if (!path) return undefined
    for (const candidate of getPathVariants(path)) {
        const value = getNestedValue(obj, candidate as string)
        if (value !== undefined && value !== null) return value
    }
    return undefined
}

const useIsDarkTheme = () => {
    const [isDark, setIsDark] = React.useState(() =>
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

const renderRelationBadges = (items: any, col: ColumnDefinition) => {
    if (!Array.isArray(items) || items.length === 0) {
        return <span className="text-muted-foreground">-</span>
    }
    return (
        <div className="flex flex-wrap gap-1">
            {items.map((item: any, idx: number) => {
                const relationTarget = col.relationPath
                    ? getValueFromPathVariants(item, col.relationPath) ?? item
                    : item
                const displaySource = relationTarget ?? item
                let displayValue =
                    col.displayField !== undefined && col.displayField !== null
                        ? getValueFromPathVariants(displaySource, col.displayField)
                        : displaySource
                if (displayValue === undefined || displayValue === null) {
                    displayValue = displaySource
                }
                const label =
                    displayValue !== undefined && displayValue !== null
                        ? String(displayValue)
                        : '-'
                let iconValue: string | undefined
                if (col.iconField) {
                    const rawIcon = getValueFromPathVariants(displaySource, col.iconField)
                    if (rawIcon !== undefined && rawIcon !== null) {
                        iconValue = String(rawIcon)
                    }
                }
                return (
                    <Badge
                        key={`${col.key}-${idx}`}
                        variant="outline"
                        className="flex items-center gap-1"
                    >
                        {iconValue && (
                            <DynamicIcon name={iconValue} className="h-3 w-3" />
                        )}
                        <span>{label}</span>
                    </Badge>
                )
            })}
        </div>
    )
}

/**
 * Tiny square thumbnail for a resolved relation/option that carries an `image`
 * (brand logo, product photo, customer/user avatar). Uses the same Avatar
 * primitive as the `avatar`/`creator` cells so a broken/loading image
 * gracefully falls back to the record's initials. Sized small (the box is an
 * inline style so an addon-arbitrary Tailwind class never gets dropped by a
 * consuming app's class scan). Rendered inline alongside a label — never alone.
 */
const RelationThumbnail: React.FC<{
    src: string
    alt: string
    getImageUrl?: (path: string) => string
    size?: number
}> = ({ src, alt, getImageUrl, size = 18 }) => (
    <Avatar
        className="shrink-0 rounded-sm ring-1 ring-border/40"
        style={{ width: size, height: size }}
    >
        <AvatarImage
            src={getImageUrl ? getImageUrl(src) : src}
            alt={alt}
            className="object-cover"
        />
        <AvatarFallback className="rounded-sm bg-primary/10 text-[8px] font-bold text-primary">
            {getInitials(alt)}
        </AvatarFallback>
    </Avatar>
)

interface OptionBadgeProps {
    option: { value: string; label: string; icon?: string; color?: string; image?: string }
    fallback: string
    getImageUrl?: (path: string) => string
}

const OptionBadge: React.FC<OptionBadgeProps> = ({ option, getImageUrl }) => {
    const isDark = useIsDarkTheme()
    // Explicit backend color wins; otherwise derive a stable, cohesive color
    // from the option's value (fallback label) so "dead" gray badges come
    // alive. Inline style (hex-derived) so it works regardless of the host's
    // tailwind safelist — addon-arbitrary classes aren't in the host scan.
    const colorSource = option.color || optionColor(option.value || option.label)
    const colorStyles = generateBadgeStyles(colorSource, { isDark })
    return (
        <Badge variant="outline" className="flex items-center gap-1 border-0" style={colorStyles}>
            {option.image ? (
                <RelationThumbnail
                    src={option.image}
                    alt={option.label}
                    getImageUrl={getImageUrl}
                    size={16}
                />
            ) : (
                option.icon && <DynamicIcon name={option.icon} className="h-3.5 w-3.5" />
            )}
            <span>{option.label}</span>
        </Badge>
    )
}

const BadgeWithEndpointOptions: React.FC<{
    endpoint: string
    value: any
    getImageUrl?: (path: string) => string
}> = ({ endpoint, value, getImageUrl }) => {
    const { optionsMap } = React.useContext(OptionsContext)
    const options = optionsMap.get(endpoint) || []
    const option = options.find((opt: any) => opt.value === value)
    if (option) return <OptionBadge option={option} fallback={String(value)} getImageUrl={getImageUrl} />
    // No declared option matched → humanize the raw token as a safety net so a
    // cell never shows `in_progress` verbatim (option.label still wins above).
    return <Badge variant="outline">{humanizeToken(value)}</Badge>
}

/**
 * Resolves the relation sibling object a backend serves alongside an FK column.
 * For a column keyed `category_id` the data row also carries
 * `row.category = { value, label }` (the FK key with the trailing `_id`
 * stripped) — mirroring how `created_by` ships as a `{ name, avatar, email }`
 * sibling consumed by the `creator` renderer. Returns the relation key so the
 * cell can read `row[relationKeyFor(col)]`.
 */
export const relationKeyFor = (col: Pick<ColumnDefinition, 'key'>): string => {
    const k = col.key
    return k.endsWith('_id') ? k.slice(0, -3) : k
}

/** Cell renderers (`cellStyle`/`type`) that resolve to the date renderer. */
export const DATE_CELL_TYPES = ['date', 'datetime', 'timestamp', 'timestamptz'] as const

/**
 * Pure formatter behind the date/datetime cell. Returns the display string and
 * an optional full-precision `title` (tooltip), or `null` when the value is
 * empty/invalid/the Go zero-time so the cell renders an em-dash.
 *   - `date`: day only (`PPP`), no tooltip.
 *   - `datetime`/`timestamp(tz)`: day + time (`Pp`) with a full-precision
 *     tooltip (`PPpp`) — the 7Leguas pattern.
 *
 * When a `timeZone` (IANA, e.g. the org's `America/Mexico_City`) is provided,
 * instants are rendered in that zone via the native `Intl.DateTimeFormat` so
 * the displayed day/time never shifts with the viewer's browser timezone:
 *   - instant (datetime/timestamp(tz)): `dateStyle:'medium' timeStyle:'short'`
 *     in the org zone, with a `dateStyle:'long' timeStyle:'medium'` +
 *     `timeZoneName:'short'` tooltip.
 *   - `date` (pure calendar day): rendered pinned to UTC so it never rolls to
 *     the previous/next day, no tooltip.
 * Without a `timeZone`, the exact date-fns behavior is preserved (back-compat).
 */
export function formatDateCell(
    value: unknown,
    renderAs: string | undefined,
    locale: Locale,
    timeZone?: string,
): { display: string; title?: string } | null {
    if (value === null || value === undefined || value === '') return null
    const date = new Date(value as any)
    if (isNaN(date.getTime()) || date.getFullYear() <= 1) return null
    const withTime = renderAs !== 'date'
    if (timeZone) {
        // `locale.code` is the BCP-47 tag date-fns ships (e.g. 'es', 'en-US').
        const localeTag = locale?.code || undefined
        if (withTime) {
            return {
                display: new Intl.DateTimeFormat(localeTag, {
                    timeZone,
                    dateStyle: 'medium',
                    timeStyle: 'short',
                }).format(date),
                // `dateStyle`/`timeStyle` can't be combined with explicit
                // component options like `timeZoneName`, so spell the tooltip
                // out: long date + seconds + the zone abbreviation.
                title: new Intl.DateTimeFormat(localeTag, {
                    timeZone,
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZoneName: 'short',
                }).format(date),
            }
        }
        // Pure calendar date: pin to UTC so it never shifts across zones.
        return {
            display: new Intl.DateTimeFormat(localeTag, {
                timeZone: 'UTC',
                dateStyle: 'long',
            }).format(date),
        }
    }
    if (withTime) {
        return {
            display: format(date, 'Pp', { locale }),
            title: format(date, 'PPpp', { locale }),
        }
    }
    return { display: format(date, 'PPP', { locale }) }
}

/**
 * Reads the resolved relation/option label a backend serves for an FK or
 * option column, falling back to the raw value. Pure so the cell renderers and
 * tests share one resolution path:
 *   - relation: prefer the sibling `{ value, label }` object's label.
 *   - option:   prefer the matched `options[].label` (value compared as string).
 *   - else:     the raw value coerced to string ('' when nullish).
 */
export const resolveRelationLabel = (col: ColumnDefinition, row: any): string => {
    const sibling = getNestedValue(row, relationKeyFor(col))
    const label =
        sibling && typeof sibling === 'object'
            ? sibling.label ?? sibling.name
            : undefined
    if (label !== undefined && label !== null && label !== '') return String(label)
    const raw = getNestedValue(row, col.key)
    // An unresolved FK that arrived as the nil UUID reads as empty, not zeros.
    if (raw === undefined || raw === null || isNilUuid(raw)) return ''
    return String(raw)
}

/**
 * Reads the thumbnail URL a backend serves on a resolved FK sibling, when
 * present. The backend stamps `image` onto the `{ value, label }` relation
 * object when the referenced model carries an image column (brand logo,
 * product photo, customer avatar). Returns '' when there is no sibling image —
 * the chip then renders text-only, exactly as before.
 */
export const resolveRelationImage = (col: ColumnDefinition, row: any): string => {
    const sibling = getNestedValue(row, relationKeyFor(col))
    if (sibling && typeof sibling === 'object') {
        const img = sibling.image ?? sibling.avatar ?? sibling.photo
        if (img !== undefined && img !== null && img !== '') return String(img)
    }
    return ''
}

/**
 * Renders a resolved FK relation as a clean, truncated chip. Reads the
 * backend-resolved sibling `{ value, label[, image] }` (see `relationKeyFor`)
 * and shows its `label`, prefixed with a small thumbnail when the sibling
 * carries an `image`. Falls back to the raw id when no sibling was resolved, and
 * to an empty marker when there is no value at all. Domain-agnostic: works for
 * every `belongs_to` column (category, supplier, brand, …) without per-addon code.
 */
const RelationCell: React.FC<{
    col: ColumnDefinition
    row: any
    getImageUrl?: (path: string) => string
}> = ({ col, row, getImageUrl }) => {
    const isDark = useIsDarkTheme()
    const display = resolveRelationLabel(col, row)
    if (!display) return <EmptyCell />
    const image = resolveRelationImage(col, row)
    // Deterministic, SUBTLE color keyed on the resolved label — lighter than
    // enum badges (soft tint, no heavy fill) so category/brand chips read as
    // alive yet stay visually distinct from option/status badges. Inline style
    // (hex-derived) bypasses the host tailwind safelist.
    const chipStyles = relationChipStyles(display, { isDark })
    return (
        <span
            className="inline-flex max-w-[220px] items-center gap-1.5 rounded-md px-2 py-0.5 text-sm font-medium"
            style={chipStyles}
            title={display}
        >
            {image && (
                <RelationThumbnail src={image} alt={display} getImageUrl={getImageUrl} size={18} />
            )}
            <span className="truncate">{display}</span>
        </span>
    )
}

/**
 * Renders a SAP-style polymorphic source-document reference as a navigable
 * chip. Reads the backend-resolved sibling `row[<key w/o _id>] =
 * { value, label, kind, table }` (see `relationKeyFor`) — the discriminator
 * (`source_kind`) selects the target model and the backend stamps the resolved
 * SQL `table` so the cell can link to `/m/<table>/<value>` (the host router
 * handles `/m/:model/:id`). Shows the resolved `label` when present, else a
 * short id (first 8 chars of the value). Domain-agnostic: any polymorphic FK
 * (`source_id`, `document_id`, …) carrying `display: "reference"` works without
 * per-addon code. Mirrors `RelationCell`'s chip look (subtle tint, dark-mode
 * aware) so references read consistently next to plain relations.
 */
const ReferenceCell: React.FC<{
    col: ColumnDefinition
    row: any
}> = ({ col, row }) => {
    const isDark = useIsDarkTheme()
    const sibling = getNestedValue(row, relationKeyFor(col))
    const value =
        (sibling && typeof sibling === 'object' ? sibling.value : undefined) ??
        getNestedValue(row, col.key)
    if (value === undefined || value === null || value === '' || isNilUuid(value)) {
        return <EmptyCell />
    }
    const label =
        sibling && typeof sibling === 'object' ? sibling.label : undefined
    const kind =
        sibling && typeof sibling === 'object' ? sibling.kind : undefined
    const table =
        sibling && typeof sibling === 'object' ? sibling.table : undefined
    const displayText =
        label !== undefined && label !== null && label !== ''
            ? String(label)
            : `${String(value).slice(0, 8)}`
    // Tint keyed on the discriminator (when present) so e.g. sale/transfer/
    // adjustment chips read as visually distinct families; falls back to the
    // display text. Same subtle relation-chip look + dark-mode handling.
    const chipStyles = relationChipStyles(String(kind || displayText), { isDark })
    const className =
        'inline-flex max-w-[220px] items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium'
    if (table && value) {
        return (
            <a
                href={`/m/${table}/${value}`}
                onClick={(e) => e.stopPropagation()}
                className={`${className} hover:underline`}
                style={chipStyles}
                title={displayText}
            >
                <span className="truncate">{displayText}</span>
            </a>
        )
    }
    return (
        <span className={className} style={chipStyles} title={displayText}>
            <span className="truncate">{displayText}</span>
        </span>
    )
}

/**
 * Generic avatar-style cell: round/rounded photo (or initials fallback) +
 * primary name + optional subtitle. Backs the `avatar`/`search` columns as
 * well as the `creator`/`user` cellStyles. Paths are parameterised so the same
 * JSX serves every variant.
 */
const AvatarCell: React.FC<{
    name: string
    desc?: string
    avatarSrc?: string
    getImageUrl: (path: string) => string
}> = ({ name, desc, avatarSrc, getImageUrl }) => (
    <div className="flex items-center gap-3 min-w-0">
        <Avatar className="h-8 w-8 rounded-lg ring-1 ring-border/50">
            <AvatarImage
                src={avatarSrc ? getImageUrl(avatarSrc) : ''}
                alt={name}
                className="object-cover"
            />
            <AvatarFallback className="text-[10px] font-bold bg-primary/5 text-primary rounded-lg">
                {getInitials(name)}
            </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0 overflow-hidden">
            <span className="font-medium text-sm truncate leading-none mb-0.5 text-foreground/90">
                {name}
            </span>
            {desc && (
                <span className="text-[11px] text-muted-foreground truncate leading-none">
                    {desc}
                </span>
            )}
        </div>
    </div>
)

/**
 * Builds the canonical column factory used by `<DynamicTable>` when the host
 * does not supply its own. Pass `{ getImageUrl, apiBaseUrl }` to wire avatar
 * URL resolution.
 */
export function makeDefaultGetDynamicColumns(
    helpers: DynamicColumnsHelpers = {},
): GetDynamicColumns {
    const getImageUrl = helpers.getImageUrl ?? defaultGetImageUrl
    const apiBaseUrl = helpers.apiBaseUrl ?? ''

    return function defaultGetDynamicColumns(
        metadata: TableMetadata,
        onAction?: (action: string, row: any) => void,
        t?: (key: string, options?: any) => string,
        currentLanguage?: string,
        filterConfigs?: Map<string, ColumnFilterConfig>,
        timeZone?: string,
        currency?: string,
    ): ColumnDef<any>[] {
        const dateLocale = currentLanguage === 'en' ? enUS : es
        const columns: ColumnDef<any>[] = [
            {
                id: 'select',
                header: ({ table }) => (
                    <Checkbox
                        checked={
                            table.getIsAllPageRowsSelected() ||
                            (table.getIsSomePageRowsSelected() && 'indeterminate')
                        }
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                        className="translate-y-[2px]"
                    />
                ),
                cell: ({ row }) => (
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                        className="translate-y-[2px]"
                    />
                ),
                enableSorting: false,
                enableHiding: false,
            },
        ]

        metadata.columns.forEach((col) => {
            // Honors both the legacy `hidden` boolean and the kernel's
            // `visibility` scope (skips `'modal'` and `'list'`).
            if (!isColumnVisibleInTable(col)) return

            const translatedLabel = col.label
            const filterConfig = filterConfigs?.get(col.key)

            const columnMeta: Record<string, unknown> = {
                label: translatedLabel,
            }
            if (filterConfig) {
                const fm: ColumnFilterMeta = {
                    filterable: true,
                    filterType: filterConfig.filterType as ColumnFilterMeta['filterType'],
                    filterKey: filterConfig.filterKey,
                    filterOptions: filterConfig.options,
                    filterLoading: filterConfig.loading,
                    filterSearchEndpoint: filterConfig.searchEndpoint,
                    selectedValues: filterConfig.selectedValues,
                    onFilterChange: filterConfig.onFilterChange,
                }
                Object.assign(columnMeta, fm)
            }

            columns.push({
                accessorKey: col.key,
                id: col.key,
                meta: columnMeta,
                header: ({ column }) =>
                    filterConfig ? (
                        <FilterableColumnHeader column={column} title={translatedLabel} />
                    ) : (
                        <DataTableColumnHeader column={column} title={translatedLabel} />
                    ),
                cell: ({ row }) => {
                    // Treat the nil UUID (unset nullable FK serialized as
                    // all-zeros) as no value, so every type below hits its
                    // existing empty branch instead of printing the zeros.
                    const value = normalizeNilUuid(getNestedValue(row.original, col.key))
                    // Kernel emits the renderer flag as `type`; older hosts used
                    // `cellStyle`. Accept both so a single backend works across
                    // SDK versions.
                    const renderAs = col.cellStyle ?? col.type

                    // Endpoint-loaded badge options (preloaded into OptionsContext)
                    if (renderAs === 'badge' && col.useOptions && col.searchEndpoint) {
                        if (!value) return <span className="text-muted-foreground">-</span>
                        return <BadgeWithEndpointOptions endpoint={col.searchEndpoint} value={value} getImageUrl={getImageUrl} />
                    }

                    // Static badge options — map value → label/icon/color
                    if (renderAs === 'badge' && col.options && col.options.length > 0) {
                        if (!value && value !== 0) return <span className="text-muted-foreground">-</span>
                        const option = col.options.find((o) => o.value === String(value))
                        if (option) return <OptionBadge option={option} fallback={String(value)} getImageUrl={getImageUrl} />
                        return <Badge variant="outline">{humanizeToken(value)}</Badge>
                    }

                    if (renderAs === 'relation-badge-list') {
                        return renderRelationBadges(value, col)
                    }

                    // Generic badge (no options/endpoint) — still pill it, and
                    // humanize raw enum tokens (no option exists to localize it).
                    if (renderAs === 'badge') {
                        if (!value && value !== 0) return <EmptyCell />
                        return <Badge variant="outline">{humanizeToken(value)}</Badge>
                    }

                    // Status — semantic color by value, options color wins.
                    if (renderAs === 'status') {
                        if (!value && value !== 0) return <EmptyCell />
                        const sv = String(value)
                        const option = col.options?.find((o) => o.value === sv)
                        if (option) return <OptionBadge option={option} fallback={sv} getImageUrl={getImageUrl} />
                        const isDark =
                            typeof document !== 'undefined' &&
                            document.documentElement.classList.contains('dark')
                        const styles = generateBadgeStyles(statusColorFor(sv), { isDark })
                        // No declared option → humanize the status token so
                        // `in_progress` reads as "In Progress" instead of raw.
                        return (
                            <Badge variant="outline" className="border-0" style={styles}>
                                {humanizeToken(sv)}
                            </Badge>
                        )
                    }

                    // Polymorphic source-document reference (SAP-style). Reads
                    // the backend-resolved `{ value, label, kind, table }`
                    // sibling and renders a navigable `/m/<table>/<value>` chip.
                    // Checked before the relation branch so a polymorphic FK
                    // carrying a `ref` still routes here.
                    if (renderAs === 'reference') {
                        return <ReferenceCell col={col} row={row.original} />
                    }

                    // Resolved FK relation chip. Triggers on an explicit
                    // `cellStyle: 'relation'` or on any column carrying a `ref`
                    // (a belongs_to FK) that isn't being rendered as an
                    // option/badge. Reads the backend-resolved
                    // `row[<key w/o _id>] = { value, label }` sibling.
                    if (
                        renderAs === 'relation' ||
                        (col.ref && !col.options?.length && renderAs !== 'badge' && renderAs !== 'status')
                    ) {
                        return <RelationCell col={col} row={row.original} getImageUrl={getImageUrl} />
                    }

                    // Option/type column: a `select`-style column ships its
                    // localized `options: [{value,label,color,icon}]` inline and
                    // the cell value is the raw option value (e.g. "storable").
                    // Render the matched option's label as a colored badge —
                    // same OptionBadge the `badge`/`status` cells use.
                    if (
                        (renderAs === 'select' || renderAs === 'option' || col.type === 'select') &&
                        col.options &&
                        col.options.length > 0
                    ) {
                        if (!value && value !== 0) return <EmptyCell />
                        const option = col.options.find((o) => o.value === String(value))
                        if (option) return <OptionBadge option={option} fallback={String(value)} getImageUrl={getImageUrl} />
                        return <Badge variant="outline">{humanizeToken(value)}</Badge>
                    }

                    switch (renderAs) {
                        case 'date':
                        case 'datetime':
                        case 'timestamp':
                        case 'timestamptz': {
                            const formatted = formatDateCell(value, renderAs, dateLocale, timeZone)
                            if (!formatted)
                                return <span className="text-muted-foreground">-</span>
                            return (
                                <div
                                    className="flex items-center gap-1.5 text-muted-foreground"
                                    title={formatted.title}
                                >
                                    <icons.Calendar className="h-3.5 w-3.5 opacity-70" />
                                    <span className="text-sm font-medium">
                                        {formatted.display}
                                    </span>
                                </div>
                            )
                        }

                        case 'search':
                        case 'avatar':
                        case 'creator':
                        case 'user': {
                            // `creator`/`user` resolve the name from an explicit
                            // styleConfig.name_field first, then the legacy
                            // tooltip/displayField hints, then the column key.
                            const namePath =
                                styleCfg(col, 'name_field', 'nameField') ||
                                col.tooltip ||
                                col.displayField ||
                                col.key
                            const name = getNestedValue(row.original, namePath) || 'N/A'
                            const desc = getNestedValue(row.original, col.description || '')

                            const basePath = styleCfg(col, 'base_path', 'basePath') ?? col.basePath ?? ''
                            let avatarSrc: string | undefined
                            if (col.key.includes('.')) {
                                // Look for a sibling `.avatar` or `.photo` field.
                                const parentPath = col.key.split('.').slice(0, -1).join('.')
                                const sibling =
                                    getNestedValue(row.original, `${parentPath}.avatar`) ||
                                    getNestedValue(row.original, `${parentPath}.photo`)
                                if (sibling) avatarSrc = String(sibling)
                            }
                            if (!avatarSrc && value) {
                                if (String(value).startsWith('http')) {
                                    avatarSrc = String(value)
                                } else {
                                    avatarSrc = `${apiBaseUrl}${basePath}${value}`
                                }
                            }

                            return (
                                <AvatarCell
                                    name={String(name)}
                                    desc={desc ? String(desc) : undefined}
                                    avatarSrc={avatarSrc}
                                    getImageUrl={getImageUrl}
                                />
                            )
                        }

                        case 'relation-badge-list':
                            return renderRelationBadges(value, col)

                        case 'url':
                        case 'link': {
                            const labelField = styleCfg(col, 'label_field', 'labelField')
                            const urlField = styleCfg(col, 'url_field', 'urlField')
                            const rawUrl = urlField
                                ? getNestedValue(row.original, urlField)
                                : value
                            if (!rawUrl) return <EmptyCell />
                            const urlStr = String(rawUrl)
                            const href = /^https?:\/\//i.test(urlStr) ? urlStr : `https://${urlStr}`
                            let label: string
                            if (labelField) {
                                label = String(getNestedValue(row.original, labelField) ?? href)
                            } else {
                                try {
                                    label = new URL(href).hostname
                                } catch {
                                    label = urlStr
                                }
                            }
                            const isExternal = !/^https?:\/\/(localhost|127\.)/i.test(href)
                            const newTab =
                                styleCfg(col, 'new_tab', 'newTab') === true || isExternal
                            const iconName = styleCfg(col, 'icon') || 'ExternalLink'
                            return (
                                <a
                                    href={href}
                                    {...(newTab
                                        ? { target: '_blank', rel: 'noopener noreferrer' }
                                        : {})}
                                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <DynamicIcon name={iconName} className="h-3.5 w-3.5 shrink-0" />
                                    <span className="truncate max-w-[260px]">{label}</span>
                                </a>
                            )
                        }

                        case 'email': {
                            if (!value) return <EmptyCell />
                            const email = String(value)
                            return (
                                <a
                                    href={`mailto:${email}`}
                                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <icons.Mail className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                    <span className="truncate max-w-[260px]">{email}</span>
                                </a>
                            )
                        }

                        case 'currency': {
                            const num =
                                typeof value === 'number' ? value : Number(value)
                            if (value === null || value === undefined || isNaN(num))
                                return (
                                    <div className="text-right">
                                        <EmptyCell />
                                    </div>
                                )
                            const decimals = styleCfg(col, 'decimals') ?? 2
                            return (
                                <span className="block text-right font-medium tabular-nums">
                                    {formatNumber(
                                        num,
                                        {
                                            style: 'currency',
                                            currency: resolveCurrency(col, currency),
                                            minimumFractionDigits: decimals,
                                            maximumFractionDigits: decimals,
                                        },
                                        currentLanguage,
                                    )}
                                </span>
                            )
                        }

                        case 'number': {
                            const num =
                                typeof value === 'number' ? value : Number(value)
                            if (value === null || value === undefined || isNaN(num))
                                return (
                                    <div className="text-right">
                                        <EmptyCell />
                                    </div>
                                )
                            const decimals = styleCfg(col, 'decimals')
                            return (
                                <span className="block text-right font-medium tabular-nums">
                                    {formatNumber(
                                        num,
                                        decimals !== undefined
                                            ? {
                                                  minimumFractionDigits: decimals,
                                                  maximumFractionDigits: decimals,
                                              }
                                            : {},
                                        currentLanguage,
                                    )}
                                </span>
                            )
                        }

                        case 'percent':
                        case 'progress': {
                            const num =
                                typeof value === 'number' ? value : Number(value)
                            if (value === null || value === undefined || isNaN(num))
                                return <EmptyCell />
                            const pct = Math.max(0, Math.min(100, num))
                            return (
                                <div className="flex items-center gap-2 min-w-[120px]">
                                    <Progress value={pct} className="flex-1" />
                                    <span className="text-xs font-medium tabular-nums text-muted-foreground w-9 text-right">
                                        {Math.round(pct)}%
                                    </span>
                                </div>
                            )
                        }

                        case 'tags': {
                            const list: string[] = Array.isArray(value)
                                ? value.map(String)
                                : value
                                  ? String(value)
                                        .split(',')
                                        .map((s) => s.trim())
                                        .filter(Boolean)
                                  : []
                            if (list.length === 0) return <EmptyCell />
                            return (
                                <div className="flex flex-wrap gap-1">
                                    {list.map((tag, i) => (
                                        <Badge
                                            key={`${col.key}-${i}`}
                                            variant="secondary"
                                            className="px-1.5 py-0 text-[10px]"
                                        >
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                            )
                        }

                        case 'color': {
                            if (!value) return <EmptyCell />
                            const hex = String(value)
                            return (
                                <div className="flex items-center gap-2">
                                    <span
                                        className="h-4 w-4 rounded border border-border/60 shrink-0"
                                        style={{ background: hex }}
                                    />
                                    <code className="font-mono text-xs text-muted-foreground">
                                        {hex}
                                    </code>
                                </div>
                            )
                        }

                        case 'code':
                        case 'truncate-text': {
                            if (value === null || value === undefined || value === '')
                                return <EmptyCell />
                            const maxLength = styleCfg(col, 'max_length', 'maxLength')
                            return <CodeCell text={String(value)} maxLength={maxLength} />
                        }

                        case 'phone': {
                            if (!value) return <span className="text-muted-foreground">-</span>
                            return <span className="font-medium text-sm">{String(value)}</span>
                        }

                        case 'boolean': {
                            const showText = styleCfg(col, 'show_text', 'showText') !== false
                            return (
                                <span className="inline-flex items-center gap-1.5">
                                    {value ? (
                                        <icons.Check className="h-4 w-4 text-green-500" />
                                    ) : (
                                        <icons.Minus className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    {showText && (
                                        <span className="text-sm text-muted-foreground">
                                            {value ? 'Sí' : 'No'}
                                        </span>
                                    )}
                                </span>
                            )
                        }

                        case 'media-gallery': {
                            if (!value || (Array.isArray(value) && value.length === 0)) {
                                return <span className="text-muted-foreground">-</span>
                            }
                            const mediaItems = Array.isArray(value) ? value : []
                            const visibleItems = mediaItems.slice(0, 3)
                            const remaining = mediaItems.length - 3
                            return (
                                <div className="flex -space-x-2 overflow-hidden">
                                    {visibleItems.map((item: any, i: number) => {
                                        const src = item.url
                                        if (item.type === 'image') {
                                            return (
                                                <Avatar
                                                    key={i}
                                                    className="inline-block h-8 w-8 rounded-full ring-2 ring-background"
                                                >
                                                    <AvatarImage src={src} className="object-cover" />
                                                    <AvatarFallback>{item.type?.[0]}</AvatarFallback>
                                                </Avatar>
                                            )
                                        }
                                        return (
                                            <div
                                                key={i}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted ring-2 ring-background"
                                            >
                                                <DynamicIcon
                                                    name={
                                                        item.type === 'video'
                                                            ? 'Video'
                                                            : item.type === 'audio'
                                                              ? 'AudioLines'
                                                              : 'FileText'
                                                    }
                                                    className="h-4 w-4"
                                                />
                                            </div>
                                        )
                                    })}
                                    {remaining > 0 && (
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium ring-2 ring-background">
                                            +{remaining}
                                        </div>
                                    )}
                                </div>
                            )
                        }

                        case 'image': {
                            const imageValue =
                                value ||
                                (Array.isArray(row.original.media)
                                    ? row.original.media.find((m: any) => m.type === 'image')?.url
                                    : null)
                            if (!imageValue) return <span className="text-muted-foreground">-</span>
                            return (
                                <div className="h-10 w-10 relative rounded overflow-hidden bg-muted flex items-center justify-center">
                                    <img
                                        src={getImageUrl(String(imageValue))}
                                        alt="Thumbnail"
                                        className="h-full w-full object-contain"
                                        onError={(e) => {
                                            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                                        }}
                                    />
                                </div>
                            )
                        }

                        default: {
                            if (typeof value === 'object' && value !== null) {
                                return (
                                    <span className="text-muted-foreground text-xs">
                                        {JSON.stringify(value)}
                                    </span>
                                )
                            }
                            if (
                                col.key === 'description' ||
                                col.key === 'features' ||
                                col.key.includes('description')
                            ) {
                                return (
                                    <div className="max-w-[350px]" title={String(value)}>
                                        <span className="truncate font-medium block">
                                            {value !== null && value !== undefined ? String(value) : '-'}
                                        </span>
                                    </div>
                                )
                            }
                            return (
                                <span className="truncate font-medium">
                                    {value !== null && value !== undefined ? String(value) : '-'}
                                </span>
                            )
                        }
                    }
                },
                enableSorting: col.sortable,
                enableHiding: true,
            })
        })

        // Resolve which actions to surface in the row dropdown:
        //   1. If the host metadata declares its own actions, use them as-is.
        //   2. Otherwise, when enableCRUDActions is true, fall back to the
        //      canonical View / Edit / Delete trio so any model with CRUD on
        //      gets the same dropdown without the host having to declare it.
        // The DynamicTable wires `view`/`edit`/`delete` to its own dialogs
        // through onAction, so labels/icons are the only thing this needs to
        // ship.
        const explicitActions = metadata.actions ?? []
        const hasExplicitActions = (metadata.hasActions ?? explicitActions.length > 0) && explicitActions.length > 0
        const tx = (key: string, fallback: string) =>
            t ? t(key, { defaultValue: fallback }) : fallback
        const defaultCRUDActions: typeof explicitActions =
            metadata.enableCRUDActions
                ? [
                      {
                          key: 'view',
                          name: 'view',
                          label: tx('datatable.view', 'Ver'),
                          icon: 'Eye',
                      } as any,
                      {
                          key: 'edit',
                          name: 'edit',
                          label: tx('datatable.edit', 'Editar'),
                          icon: 'Pencil',
                      } as any,
                      {
                          key: 'delete',
                          name: 'delete',
                          label: tx('datatable.delete', 'Eliminar'),
                          icon: 'Trash2',
                      } as any,
                  ]
                : []
        const resolvedActions = hasExplicitActions ? explicitActions : defaultCRUDActions

        if (resolvedActions.length > 0) {
            columns.push({
                id: 'actions',
                header: () => <div className="text-right">{t ? t('common.actions') : 'Acciones'}</div>,
                size: 80,
                maxSize: 80,
                meta: {},
                cell: ({ row }) => (
                    <div className="flex items-center justify-end">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Abrir menú</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {resolvedActions
                                    .filter((action) => isActionAllowedForRowState(action, row.original))
                                    .filter((action) => {
                                        if (!action.condition) return true
                                        const { field, operator, value } = action.condition
                                        const rowValue = String((row.original as any)[field] ?? '')
                                        const values = Array.isArray(value) ? value : [value]
                                        switch (operator) {
                                            case 'eq':
                                                return rowValue === values[0]
                                            case 'neq':
                                                return rowValue !== values[0]
                                            case 'in':
                                                return values.includes(rowValue)
                                            case 'not_in':
                                                return !values.includes(rowValue)
                                            default:
                                                return true
                                        }
                                    })
                                    .map((action) => (
                                        <DropdownMenuItem
                                            key={action.key}
                                            onClick={() => onAction && onAction(action.key, row.original)}
                                        >
                                            <DynamicIcon name={action.icon} className="mr-2 h-4 w-4" />
                                            {action.label}
                                        </DropdownMenuItem>
                                    ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ),
            })
        }

        return columns
    }
}

/**
 * Eager-built variant — equivalent to `makeDefaultGetDynamicColumns()`. Use
 * this when the host has no helpers to inject and a stable function reference
 * suffices.
 */
export const defaultGetDynamicColumns: GetDynamicColumns =
    makeDefaultGetDynamicColumns()
