// DynamicSelectField — async, searchable single-select for declarative forms.
// A configuration of the shared <RecordPicker> (record-picker.tsx).
//
// This is the declarative answer to "I don't want to type a raw FK UUID".
// Instead of a plain <select> that dumps every option (RefSelect) or a free
// text input, it renders a typeahead combobox that queries the canonical
// options endpoint as the user types:
//
//   GET /api/options/<ref>?field=id&q=<text>&limit=<n>
//
// reusing `useOptionsResolver` (which already debounce-aborts in-flight
// requests). It is the metacore equivalent of 7leguas' `search.go` / dynamic
// `type: search` field, but driven entirely from the manifest — so an addon
// declares `type: "dynamic_select"` + `ref` and gets a searchable picker with
// zero custom React.
//
// Resolution path (highest priority first):
//   1. field.ref          → /options/<ref>?field=id        (canonical, preferred)
//   2. field.searchEndpoint→ used verbatim as the options endpoint (escape hatch)
//
// Edit-mode caveat: resolving an EXISTING value's label requires the id to be
// in a fetched page (we match by id against loaded options, else show the raw
// value). A dedicated `?ids=` lookup is a follow-up; create flows — the common
// case — start empty and never hit this.
import { useEffect, useRef, useState } from 'react'
import { getOptionFilter } from './option-filter'
import { useTranslation } from 'react-i18next'
import { Badge, Button } from '@asteby/metacore-ui/primitives'
import { ScanLine } from 'lucide-react'
import { BarcodeScanner } from './barcode-scanner'
import { RecordPicker } from './record-picker'
import { OptionLead } from './record-picker-option'
import { recordLabel, requestRecordCreate, requestRecordEdit, withSearchPrefill } from './record-picker-actions'
import { useOptionsResolver, type ResolvedOption } from './use-options-resolver'
import { useDebouncedValue } from './use-debounced-value'
import { getDependsOn, getFieldRef, resolveOptionsSource } from './dynamic-form-schema'
import type { ActionFieldDef } from './types'

export { OptionLead, OptionThumb } from './record-picker-option'

/**
 * Default hint shown when a cascading picker's depended-on field is still
 * empty. Domain-neutral on purpose; a caller may override it per field via
 * `dependsHint`.
 */
export const DEFAULT_DEPENDS_HINT = 'Selecciona primero el campo del que depende'

export interface DynamicSelectFieldProps {
    field: ActionFieldDef
    value: any
    onChange: (v: any) => void
    /** Opción completa recién elegida (incluye `meta` para autollenar columnas hermanas). */
    onPick?: (opt: ResolvedOption) => void
    /**
     * Pre-resolved option for the CURRENT value (label + image/color/icon) the
     * caller already has — e.g. the relation sibling the table served. Lets the
     * trigger show the name + thumbnail for an existing value without waiting for
     * a lookup (which only loads once the popover opens). Matched by id == value.
     */
    seedOption?: ResolvedOption | null
    /**
     * Cascade scope: the current value of the field this picker `dependsOn`
     * (the caller resolves it from the form context). Forwarded as
     * `filter_value`. When the field declares a `dependsOn` and this is empty,
     * the picker is disabled with `dependsHint` and the current selection is
     * cleared. Changing it re-fetches and clears the selection.
     */
    dependsValue?: string
    /** Overrides the disabled-state hint shown while `dependsValue` is empty. */
    dependsHint?: string
    /**
     * Renders the picker as a locked, non-interactive display of the current
     * value's resolved label (no popover, no inline-create). Used when the value
     * is fixed by context — e.g. the product of a receive-goods line is dictated
     * by the source document, not chosen. Options are fetched eagerly (not just
     * on open) so the label resolves to the NAME instead of showing the raw id.
     */
    readonly?: boolean
    /**
     * Caller-owned options (e.g. warehouses filtered by available stock for a
     * dispatch line). When set, skips `/options` and filters these client-side
     * by the search box. Federated process modals use this so they share the
     * same DynamicSelect chrome without reinventing a lighter picker.
     */
    staticOptions?: readonly ResolvedOption[] | null
    /**
     * Render `option.description` as a trailing Badge (stock, codes, …) instead
     * of the default muted subtitle under the label.
     */
    descriptionAsBadge?: boolean
    /**
     * Hide the inline create/edit affordances (joined "+" / pencil and the
     * "Crear …" list footer) even when `field.ref` is set.
     * Useful for static / filtered lists where creating a new record is not
     * meaningful in context.
     */
    hideCreate?: boolean
    /**
     * Pre-filled values for the record the inline "+" creates, forwarded to
     * the host's create modal via the `metacore:create-record` event.
     * Generic: any model, any fields (e.g. a mechanic picker seeding
     * `{ role: 'mecanico' }` on a new team user).
     */
    createDefaults?: Record<string, unknown>
    /**
     * Fields of the inline-created record the user must NOT change — the
     * host's create modal renders them locked. Pairs with `createDefaults`.
     */
    createLockedFields?: string[]
    /** Paint trigger with destructive border when validation failed. */
    invalid?: boolean
}

/**
 * Declarative `dynamic_select` (manifest `ref` / `optionsConfig.source`) on top
 * of the shared {@link RecordPicker}: options from the canonical options
 * endpoint (`useOptionsResolver`: option_filter, options[].when keep-value,
 * cascade `filter_value`), inline create/edit through the host modal events.
 */
export function DynamicSelectField({
    field,
    value,
    onChange,
    onPick,
    seedOption,
    dependsValue,
    dependsHint,
    readonly = false,
    staticOptions = null,
    descriptionAsBadge = false,
    hideCreate = false,
    createDefaults,
    createLockedFields,
    invalid = false,
}: DynamicSelectFieldProps) {
    const { t } = useTranslation()
    const ph = (fallback: string) =>
        field.placeholder ? t(field.placeholder, { defaultValue: field.placeholder }) : fallback
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [scanOpen, setScanOpen] = useState(false)
    const debounced = useDebouncedValue(search, 250)

    // Escaneo por cámara para "llenar rápido": opt-in por campo (`scan`). El
    // botón aparece SIEMPRE que el campo lo declara (igual que el POS). El
    // BarcodeScanner ya degrada con un mensaje cuando no hay cámara. Un código
    // escaneado alimenta la búsqueda y abre el picker.
    const scanEnabled = !!(field.scan ?? field.scannable)
    const handleScanDetected = (code: string) => {
        setSearch(code)
        setOpen(true)
    }
    // Remember the option the user actually picked so the trigger shows a name
    // (not a UUID) without a round-trip.
    const [picked, setPicked] = useState<ResolvedOption | null>(null)

    // Tolerate the snake_case `source`/`relation` aliases for the FK target.
    const fieldRef = getFieldRef(field)
    // An `optionsConfig.source` (dependent/scoped picker) wins over `ref`.
    const source = resolveOptionsSource(field)

    // Cascade: a `dependsOn` field whose value is still empty leaves this
    // picker disabled until the parent is set.
    const dependsOn = getDependsOn(field)
    const scope = dependsValue ? String(dependsValue) : ''
    const blockedByDependency = !!dependsOn && scope === ''

    const useStatic = Array.isArray(staticOptions)
    const optionFilter = getOptionFilter(field)

    const { options: fetchedOptions, loading: fetchLoading } = useOptionsResolver({
        modelKey: '',
        fieldKey: source.fieldKey,
        ref: source.ref,
        // optionsConfig.source → `/options/<source>`. Else searchEndpoint only
        // drives the URL when there's no ref (ref is canonical and wins).
        endpoint: source.endpoint ?? (source.ref ? undefined : field.searchEndpoint),
        query: debounced,
        limit: 20,
        filterValue: dependsOn ? scope : undefined,
        optionFilter,
        keepValue: value,
        // Fetch only while open; a readonly cell fetches eagerly so its label
        // resolves to the name. Blocked cascades and static lists never fetch.
        enabled: !useStatic && (open || readonly) && !blockedByDependency,
    })

    const options = useStatic
        ? (staticOptions as ResolvedOption[]).filter((o) => {
              if (!debounced) return true
              const q = debounced.toLowerCase()
              return (
                  String(o.label ?? '').toLowerCase().includes(q) ||
                  String(o.description ?? '').toLowerCase().includes(q)
              )
          })
        : fetchedOptions
    const loading = useStatic ? false : fetchLoading

    // A new cascade scope invalidates the selection (skip the initial mount).
    const prevScopeRef = useRef<string>(scope)
    useEffect(() => {
        if (!dependsOn) return
        if (prevScopeRef.current !== scope) {
            prevScopeRef.current = scope
            setPicked(null)
            if (value) onChange('')
        }
    }, [dependsOn, scope, value, onChange])

    const selectedOption =
        (picked && String(picked.id) === String(value) ? picked : null) ??
        options.find((o) => String(o.id) === String(value)) ??
        (seedOption && String(seedOption.id) === String(value) ? seedOption : null) ??
        null
    const selectedLabel = selectedOption?.label ?? (value ? String(value) : '')

    const handlePick = (opt: ResolvedOption) => {
        setPicked(opt)
        onChange(String(opt.id))
        onPick?.(opt)
        setOpen(false)
        setSearch('')
    }

    const toOption = (id: string, label: string): ResolvedOption => ({ id, value: id, label, name: label })

    // Inline create / edit: the REFERENCED model's real modal, rendered by the
    // host (RecordCreateBridge) via decoupled window events — no host import.
    const openCreate = (query: string) => {
        if (!fieldRef) return
        setOpen(false)
        requestRecordCreate({
            model: fieldRef,
            // The searched text seeds the new record's name; explicit
            // createDefaults win. Keys that aren't fields are ignored.
            defaults: withSearchPrefill(query, 'name', createDefaults),
            lockedFields: createLockedFields,
            onCreated: (rec: any) => {
                if (rec && rec.id != null) {
                    const id = String(rec.id)
                    handlePick(toOption(id, recordLabel(rec) ?? id))
                }
            },
        })
    }
    const openEdit = () => {
        if (!fieldRef || !value) return
        setOpen(false)
        const id = String(value)
        requestRecordEdit({
            model: fieldRef,
            recordId: id,
            onSaved: (rec: any) => {
                const label = recordLabel(rec)
                if (label != null) setPicked({ ...(selectedOption ?? toOption(id, label)), id, value: id, label, name: label })
            },
        })
    }

    const canMutate = !!fieldRef && !hideCreate && !useStatic && !blockedByDependency
    const fieldName = field.label ? t(field.label, { defaultValue: field.label }) : fieldRef ?? ''
    const badge = (opt: ResolvedOption) =>
        opt.description ? (
            <Badge variant="secondary" className="shrink-0 font-normal tabular-nums">
                {opt.description}
            </Badge>
        ) : null

    return (
        <RecordPicker<ResolvedOption>
            slot="dynamic-select"
            id={field.key}
            items={options}
            loading={loading}
            getKey={(o) => String(o.id)}
            getLabel={(o) => o.label}
            value={value}
            selected={selectedOption}
            onSelect={handlePick}
            query={search}
            onQueryChange={setSearch}
            open={open && !blockedByDependency}
            onOpenChange={(o) => {
                if (!blockedByDependency) setOpen(o)
            }}
            disabled={blockedByDependency}
            readOnly={readonly}
            invalid={invalid}
            renderLead={(o, where) => <OptionLead option={o} size={where === 'option' ? 24 : 20} />}
            getDescription={descriptionAsBadge ? undefined : (o) => o.description}
            renderTrailing={descriptionAsBadge ? (o) => badge(o) : undefined}
            renderValue={() => {
                if (readonly) {
                    return (
                        <>
                            {selectedOption ? <OptionLead option={selectedOption} size={20} /> : null}
                            <span className={'min-w-0 flex-1 truncate ' + (selectedOption ? '' : 'text-muted-foreground')}>
                                {/* Never flash the raw id while the eager fetch resolves. */}
                                {selectedOption?.label ?? (loading ? 'Cargando…' : ph('—'))}
                            </span>
                        </>
                    )
                }
                return (
                    <>
                        {value && selectedOption ? <OptionLead option={selectedOption} size={20} /> : null}
                        <span className={'min-w-0 flex-1 truncate ' + (selectedLabel ? '' : 'text-muted-foreground')}>
                            {blockedByDependency ? dependsHint || DEFAULT_DEPENDS_HINT : selectedLabel || ph('Buscar…')}
                        </span>
                        {descriptionAsBadge && selectedOption ? badge(selectedOption) : null}
                    </>
                )
            }}
            placeholder={ph('Buscar…')}
            searchPlaceholder={ph('Buscar…')}
            emptyText={debounced ? 'Sin resultados' : useStatic ? 'Sin opciones' : 'Sin resultados — escribe para filtrar'}
            entityLabel={fieldName}
            onCreate={canMutate ? openCreate : undefined}
            onEdit={canMutate ? openEdit : undefined}
            triggerProps={{
                'data-depends-blocked': blockedByDependency ? '' : undefined,
            }}
            after={
                scanEnabled ? (
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-9 shrink-0"
                            onClick={() => setScanOpen(true)}
                            title="Escanear con la cámara"
                            aria-label="Escanear código de barras con la cámara"
                        >
                            <ScanLine className="size-4" />
                        </Button>
                        <BarcodeScanner
                            open={scanOpen}
                            onClose={() => setScanOpen(false)}
                            onDetected={handleScanDetected}
                            continuous={false}
                            position="fixed"
                            title={`Escanear ${field.label ?? ''}`.trim()}
                        />
                    </>
                ) : null
            }
        />
    )
}

export default DynamicSelectField
