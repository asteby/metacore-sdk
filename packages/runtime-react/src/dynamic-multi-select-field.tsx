// DynamicMultiSelectField — declarative multi-select for an FK/jsonb-array
// field. Companion to DynamicSelectField (single-value), for the case where a
// record can legitimately belong to MORE THAN ONE related row — e.g. a price
// list that applies to several customer segments at once, not just one.
//
// An addon opts in with `field.multiple: true` on a field that already
// declares `ref` (or `source`/`relation`). The kernel-side column backing it
// must be an array-shaped type (jsonb is the canonical choice — see
// dynamic/coltypes.go on the kernel) storing a plain JSON array of target ids;
// this component reads/writes exactly that shape (`string[]`), so no kernel
// change is required to adopt it.
//
// Options are resolved once (a single page, not per-keystroke) through the
// same canonical `/api/options/<ref>?field=id` endpoint DynamicSelectField
// uses — the shared <RecordPicker multiple> then filters that page client-side as the
// user types. That's the right tradeoff for the FK sets this targets
// (segments, tags, categories — tens, not thousands of rows); a field with a
// genuinely large option set should keep using a single dynamic_select per
// value instead.
import { useMemo, useState } from 'react'
import { getOptionFilter } from './option-filter'
import { RecordPicker } from './record-picker'
import { OptionLead } from './record-picker-option'
import { useOptionsResolver, type ResolvedOption } from './use-options-resolver'
import { getFieldRef } from './dynamic-form-schema'
import type { ActionFieldDef } from './types'

export interface DynamicMultiSelectFieldProps {
    field: ActionFieldDef
    /** Plain array of selected target ids. Absent/non-array value → treated as empty. */
    value: unknown
    onChange: (value: string[]) => void
}

export function DynamicMultiSelectField({ field, value, onChange }: DynamicMultiSelectFieldProps) {
    const ref = getFieldRef(field)
    const [query, setQuery] = useState('')
    const { options, loading } = useOptionsResolver({
        modelKey: '',
        fieldKey: 'id',
        ref,
        endpoint: !ref && field.searchEndpoint ? field.searchEndpoint : undefined,
        limit: 200,
        optionFilter: getOptionFilter(field),
    })

    const selected = useMemo(() => (Array.isArray(value) ? value.map(String) : []), [value])
    const selectedItems = useMemo(
        () =>
            selected
                .map((id) => options.find((o) => String(o.id) === id))
                .filter((o): o is ResolvedOption => !!o),
        [selected, options],
    )
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase()
        return q ? options.filter((o) => String(o.label ?? '').toLowerCase().includes(q)) : options
    }, [options, query])

    const toggle = (o: ResolvedOption) => {
        const id = String(o.id)
        onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
    }

    return (
        <RecordPicker<ResolvedOption>
            multiple
            slot="dynamic-multi-select"
            id={field.key}
            items={shown}
            loading={loading}
            getKey={(o) => String(o.id)}
            getLabel={(o) => o.label}
            renderLead={(o) => <OptionLead option={o} size={20} />}
            getDescription={(o) => o.description}
            value={selected}
            selected={selectedItems}
            onSelect={toggle}
            onRemove={toggle}
            query={query}
            onQueryChange={setQuery}
            placeholder={loading ? 'Cargando…' : field.placeholder || 'Seleccionar...'}
            searchPlaceholder="Buscar..."
            emptyText="Sin resultados."
        />
    )
}
