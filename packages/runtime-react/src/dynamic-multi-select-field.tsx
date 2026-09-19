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
// uses — the MultiSelect primitive then filters that page client-side as the
// user types. That's the right tradeoff for the FK sets this targets
// (segments, tags, categories — tens, not thousands of rows); a field with a
// genuinely large option set should keep using a single dynamic_select per
// value instead.
import { useMemo } from 'react'
import { MultiSelect } from '@asteby/metacore-ui/primitives'
import { useOptionsResolver } from './use-options-resolver'
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
    const { options, loading } = useOptionsResolver({
        modelKey: '',
        fieldKey: 'id',
        ref,
        endpoint: !ref && field.searchEndpoint ? field.searchEndpoint : undefined,
        limit: 200,
    })

    const selected = useMemo(() => (Array.isArray(value) ? value.map(String) : []), [value])
    const uiOptions = useMemo(
        () => options.map((o) => ({ value: String(o.id), label: o.label })),
        [options],
    )

    return (
        <MultiSelect
            options={uiOptions}
            selected={selected}
            onChange={onChange}
            placeholder={loading ? 'Cargando…' : (field.placeholder || 'Seleccionar...')}
            searchPlaceholder="Buscar..."
            emptyMessage="Sin resultados."
        />
    )
}
