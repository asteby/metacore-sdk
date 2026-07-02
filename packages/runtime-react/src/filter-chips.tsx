// Shared filter presentation: the removable active-filter chip row + the pure
// helpers that summarize a filter's value and resolve its color. Used by BOTH
// DynamicKanban and DynamicTable so the two surfaces render identical chips
// (one component, no drift).
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Badge, Button } from '@asteby/metacore-ui/primitives'
import { resolveColorCss } from '@asteby/metacore-ui/lib'

/**
 * Human-readable summary of a field's selected filter values for a chip / row.
 * Resolves option labels, unwraps the wire operators
 * (`IN:`/`ILIKE:`/`RANGE:`/`GTE:`/`LTE:`/date `from_to`), and caps the list at
 * `maxShown` values with a `+n` overflow. Pure — exported for unit tests.
 */
export function summarizeFilterValues(
    values: string[] | undefined,
    options: { label: string; value: string }[] | undefined,
    maxShown = 2,
): string {
    if (!values || values.length === 0) return ''
    const opts = options ?? []
    const labelFor = (v: string) => opts.find((o) => o.value === v)?.label ?? v
    const first = values[0]
    if (values.length === 1) {
        if (first.startsWith('ILIKE:')) return `"${first.slice(6)}"`
        if (first.startsWith('IN:')) {
            return summarizeList(first.slice(3).split(','), labelFor, maxShown)
        }
        if (first.startsWith('RANGE:')) {
            const [min, max] = first.slice(6).split(',')
            return `${min || '…'} – ${max || '…'}`
        }
        if (/^\d{4}-\d{2}-\d{2}_/.test(first)) return first.replace('_', ' – ')
    }
    if (first.startsWith('GTE:') || first.startsWith('LTE:')) {
        const min = values.find((v) => v.startsWith('GTE:'))?.slice(4) ?? ''
        const max = values.find((v) => v.startsWith('LTE:'))?.slice(4) ?? ''
        return `${min || '…'} – ${max || '…'}`
    }
    return summarizeList(values, labelFor, maxShown)
}

function summarizeList(
    items: string[],
    labelFor: (v: string) => string,
    maxShown: number,
): string {
    const labels = items.map(labelFor)
    if (labels.length <= maxShown) return labels.join(', ')
    return `${labels.slice(0, maxShown).join(', ')} +${labels.length - maxShown}`
}

/**
 * The color of a filter's first selected value (for the chip's dot) — e.g. a
 * stage's palette color. Returns a resolved CSS color, or undefined for
 * operator/range/free-text values that carry no option color.
 */
export function chipValueColor(config: {
    selectedValues: string[]
    options: { value: string; color?: string }[]
}): string | undefined {
    const sel = config.selectedValues
    if (!sel || sel.length === 0) return undefined
    const first = sel[0]
    let value = first
    if (first.startsWith('IN:')) value = first.slice(3).split(',')[0]
    else if (/^(ILIKE|RANGE|GTE|LTE):/.test(first)) return undefined
    else if (/^\d{4}-\d{2}-\d{2}_/.test(first)) return undefined
    const opt = config.options.find((o) => o.value === value)
    return opt?.color ? resolveColorCss(opt.color) : undefined
}

/**
 * Translates option labels through the app translator (manifest i18n keys →
 * localized text). A raw value with no matching key falls through to itself via
 * `defaultValue`. Pure — exported for unit tests.
 */
export function translateOptionLabels<T extends { label: string }>(
    options: T[],
    translate: (key: string) => string,
): T[] {
    return options.map((o) => ({ ...o, label: translate(o.label) }))
}

export interface FilterChipField {
    key: string
    label: string
    config: {
        selectedValues: string[]
        options: { label: string; value: string; color?: string }[]
        filterKey: string
        onFilterChange: (filterKey: string, values: string[]) => void
    }
}

export interface FilterChipsRowProps {
    /** Fields with an active selection (one chip each). */
    fields: FilterChipField[]
    /** Clears every filter (the trailing "Limpiar todo"). */
    onClearAll: () => void
    className?: string
    'data-testid'?: string
}

/**
 * The removable active-filter chip row shown under a board/table toolbar. Each
 * chip: an optional value-color dot, "Campo: valor(es)" (capped + `+n`), and an
 * X that clears that field; a trailing "Limpiar todo". Renders nothing when no
 * field is active.
 */
export function FilterChipsRow({
    fields,
    onClearAll,
    className,
    'data-testid': testId,
}: FilterChipsRowProps) {
    const { t } = useTranslation()
    if (fields.length === 0) return null
    return (
        <div
            className={`flex flex-wrap items-center gap-1.5${className ? ` ${className}` : ''}`}
            data-testid={testId}
        >
            {fields.map((field) => {
                const summary = summarizeFilterValues(
                    field.config.selectedValues,
                    field.config.options,
                )
                const dot = chipValueColor(field.config)
                return (
                    <Badge
                        key={field.key}
                        variant="secondary"
                        className="h-6 gap-1.5 rounded-md pl-2 pr-1 text-xs font-normal"
                    >
                        {dot && (
                            <span
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: dot }}
                            />
                        )}
                        <span className="font-medium">{field.label}:</span>
                        <span className="max-w-[180px] truncate text-muted-foreground">
                            {summary}
                        </span>
                        <button
                            type="button"
                            onClick={() =>
                                field.config.onFilterChange(
                                    field.config.filterKey,
                                    [],
                                )
                            }
                            className="ml-0.5 rounded-sm p-0.5 transition-colors hover:bg-muted-foreground/20"
                            aria-label={t('filters.removeFilter', {
                                defaultValue: 'Quitar filtro',
                            })}
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </Badge>
                )
            })}
            <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                onClick={onClearAll}
            >
                {t('filters.clearAll', { defaultValue: 'Limpiar todo' })}
            </Button>
        </div>
    )
}
