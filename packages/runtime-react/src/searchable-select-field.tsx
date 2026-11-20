// SearchableSelectField - the combobox-with-search that replaces the flat
// <Select> when a STATIC option list is long (a tax-regime catalog with ~25
// entries, a country list...), so the user types instead of scrolling.
//
// It is a thin configuration of the shared <RecordPicker> (the same control
// DynamicSelectField and EntitySelect use), so it inherits ARIA combobox +
// listbox with aria-activedescendant, arrows/Home/End/Enter/Esc/Tab, type-ahead
// on the closed trigger, scroll-to-selected on open, a portaled collision-aware
// popover and light/dark theming. What it adds:
//   - client-side filtering by label, code (value) and `description`, ignoring
//     case and accents (a code, a word or an unaccented word find the same row);
//   - match highlighting, a "no results" state and a windowed list when the
//     catalog is huge;
//   - a clear (x) when the field is not required.
//
// Who renders it: DynamicForm / DynamicRecordDialog / ActionModal / line items,
// via {@link isSearchableSelect}: `field.searchable === true`, or - unless
// `searchable === false` - more than SEARCHABLE_SELECT_THRESHOLD options.
import { useMemo, useState } from 'react'
import { RecordPicker } from './record-picker'
import { OptionLead } from './record-picker-option'
import type { ResolvedOption } from './use-options-resolver'
import { SEARCHABLE_SELECT_MAX_ROWS, filterSearchableOptions, windowOptions } from './searchable-select'

export interface SearchableSelectOption {
    value: string | number
    label: string
    description?: string | null
    color?: string
    icon?: string
    image?: string
}

export interface SearchableSelectFieldProps {
    options: readonly SearchableSelectOption[]
    /** Current value (string | number); empty / nullish = nothing selected. */
    value: unknown
    onChange: (value: string) => void
    id?: string
    /** Accessible name (the field label). */
    ariaLabel?: string
    placeholder?: string
    /** Required fields cannot be cleared. */
    required?: boolean
    disabled?: boolean
    invalid?: boolean
    /** `cell` = compact variant for table / line-item cells. */
    variant?: 'field' | 'cell'
    /** Overrides the "Buscar..." search placeholder. */
    searchPlaceholder?: string
    /** Overrides the "Sin resultados" copy. */
    emptyText?: string
    maxRows?: number
    triggerClassName?: string
}

const toResolved = (o: SearchableSelectOption): ResolvedOption => ({
    id: String(o.value),
    value: String(o.value),
    label: o.label,
    name: o.label,
    description: o.description ?? undefined,
    color: o.color,
    icon: o.icon,
    image: o.image,
})

export function SearchableSelectField({
    options,
    value,
    onChange,
    id,
    ariaLabel,
    placeholder = 'Seleccionar...',
    required = false,
    disabled = false,
    invalid = false,
    variant = 'field',
    searchPlaceholder = 'Buscar…',
    emptyText = 'Sin resultados',
    maxRows = SEARCHABLE_SELECT_MAX_ROWS,
    triggerClassName,
}: SearchableSelectFieldProps) {
    const [query, setQuery] = useState('')
    const all = useMemo(() => options.map(toResolved), [options])
    const valueKey = value != null && value !== '' ? String(value) : ''
    const selected = valueKey ? (all.find((o) => String(o.id) === valueKey) ?? null) : null

    const { rows, hidden } = useMemo(() => {
        const matched = filterSearchableOptions(all, query)
        return windowOptions(matched, maxRows, (o) => String(o.id) === valueKey)
    }, [all, query, maxRows, valueKey])

    return (
        <RecordPicker<ResolvedOption>
            slot="searchable-select"
            id={id}
            ariaLabel={ariaLabel}
            items={rows}
            getKey={(o) => String(o.id)}
            getLabel={(o) => o.label}
            getDescription={(o) => o.description}
            renderLead={(o, where) => <OptionLead option={o} size={where === 'option' ? 24 : 20} />}
            value={valueKey || null}
            selected={selected}
            onSelect={(o) => onChange(String(o.id))}
            onClear={!required && valueKey ? () => onChange('') : undefined}
            query={query}
            onQueryChange={setQuery}
            onOpenChange={(o) => {
                if (!o) setQuery('')
            }}
            placeholder={placeholder}
            searchPlaceholder={searchPlaceholder}
            emptyText={emptyText}
            highlightQuery
            disabled={disabled}
            invalid={invalid}
            variant={variant}
            triggerClassName={triggerClassName}
            listLabel={ariaLabel}
            beforeList={
                hidden > 0 ? (
                    <p className="px-3 py-1.5 text-xs text-muted-foreground" data-slot="searchable-select-more" role="status">
                        {`Mostrando ${rows.length} de ${rows.length + hidden} — escribe para filtrar`}
                    </p>
                ) : null
            }
        />
    )
}

export default SearchableSelectField
