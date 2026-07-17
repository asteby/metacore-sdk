// DynamicLineItems — renders a repeatable line-items group: a table/grid of
// rows where each column is one of the field's `itemFields` (the v3
// `item_fields`). Powers declarative multi-line action modals (e.g. the item
// rows of a "Recibir mercancía" modal, or the debit/credit lines of a journal
// entry) without needing a custom federated modal.
//
// The value is an array of row objects keyed by the item field keys. Add/remove
// row controls mutate the array; each cell is a widget resolved via
// `resolveWidget`, matching the flat-field renderer in dynamic-form.tsx.
import {
    Input,
    Textarea,
    Switch,
    Button,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@asteby/metacore-ui/primitives'
import { useEffect, useRef } from 'react'
import { Plus, Trash2, Check } from 'lucide-react'
import type { ActionFieldDef } from './types'
import {
    resolveWidget,
    getItemFields,
    computeLineItemTotals,
    evaluateBalance,
    toNumber,
    getDependsOn,
    resolveDependsValue,
    getOptionsConfig,
    resolveOptionsSource,
    applyOptionWhen,
} from './dynamic-form-schema'
import { DynamicSelectField, DEFAULT_DEPENDS_HINT } from './dynamic-select-field'
import { useOptionsResolver, type ResolvedOption } from './use-options-resolver'

export interface DynamicLineItemsProps {
    field: ActionFieldDef
    value: any[] | undefined
    onChange: (rows: any[]) => void
    disabled?: boolean
    /**
     * Current values of the surrounding (header) form. Threaded into each cell
     * so a cell field with `dependsOn` can scope its options by a HEADER field
     * (e.g. `source_warehouse_id`), not just a sibling cell on the same row.
     */
    formValues?: Record<string, any>
}

const fmtNumber = (n: number): string =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Numeric columns render right-aligned (debit/credit/amount feel). */
function isNumericCol(col: ActionFieldDef): boolean {
    return resolveWidget(col) === 'number'
}

function emptyRow(itemFields: ActionFieldDef[]): Record<string, any> {
    const row: Record<string, any> = {}
    for (const f of itemFields) {
        row[f.key] = f.defaultValue ?? (f.type === 'boolean' ? false : '')
    }
    return row
}

export function DynamicLineItems({ field, value, onChange, disabled = false, formValues }: DynamicLineItemsProps) {
    const itemFields = getItemFields(field)
    const rows: any[] = Array.isArray(value) ? value : []

    // `lock_rows` fixes the row set: no add-row button, no per-row delete. Rows
    // stay editable cell-by-cell. Snake_case is what the kernel serves; tolerate
    // the camelCase alias too. Derived once.
    const lockRows = field.lock_rows ?? (field as any).lockRows ?? false

    // Columns flagged `total` get a per-column sum in the footer; the balance
    // rule (if any) reconciles two of them. Both are declarative & generic.
    const totals = computeLineItemTotals(field, rows)
    const totalKeys = itemFields.filter((c) => c.total).map((c) => c.key)
    const hasTotals = totalKeys.length > 0
    const balance = evaluateBalance(field, rows)

    const addRow = () => onChange([...rows, emptyRow(itemFields)])
    const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx))
    const updateCell = (idx: number, key: string, cellValue: any) =>
        onChange(rows.map((r, i) => (i === idx ? { ...r, [key]: cellValue } : r)))

    // When a balance rule reconciles two columns (e.g. debit ↔ credit), typing
    // into one clears the sibling on the same row — mirrors the federated modal
    // UX so a line is never both a debit and a credit.
    const balancePair: [string, string] | null = balance
        ? (() => {
              const f = getItemFields(field)
              void f
              const d = field.balance?.debitColumn ?? field.balance?.debit_column
              const c = field.balance?.creditColumn ?? field.balance?.credit_column
              return d && c ? [d, c] : null
          })()
        : null

    const handleCell = (idx: number, key: string, cellValue: any) => {
        if (balancePair && (key === balancePair[0] || key === balancePair[1])) {
            const sibling = key === balancePair[0] ? balancePair[1] : balancePair[0]
            const hasValue = toNumber(cellValue) > 0
            onChange(
                rows.map((r, i) =>
                    i === idx ? { ...r, [key]: cellValue, ...(hasValue ? { [sibling]: '' } : {}) } : r,
                ),
            )
            return
        }
        updateCell(idx, key, cellValue)
    }

    return (
        <div className="grid gap-2" data-widget="line_items">
            <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            {itemFields.map((col) => (
                                <th
                                    key={col.key}
                                    className={
                                        'px-3 py-2 font-medium ' +
                                        (isNumericCol(col) ? 'text-right' : 'text-left')
                                    }
                                >
                                    {col.label}
                                    {col.required && <span className="text-red-500 ml-1">*</span>}
                                </th>
                            ))}
                            {!lockRows && <th className="w-12 px-3 py-2" aria-label="acciones" />}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && (
                            <tr>
                                <td
                                    colSpan={itemFields.length + (lockRows ? 0 : 1)}
                                    className="px-3 py-4 text-center text-muted-foreground"
                                >
                                    Sin renglones
                                </td>
                            </tr>
                        )}
                        {rows.map((row, idx) => (
                            <tr key={idx} className="border-t align-top">
                                {itemFields.map((col) => (
                                    <td key={col.key} className="px-2 py-1.5">
                                        <CellRenderer
                                            field={col}
                                            value={row?.[col.key]}
                                            onChange={(v: any) => handleCell(idx, col.key, v)}
                                            disabled={disabled}
                                            formValues={formValues}
                                            rowValues={row}
                                        />
                                    </td>
                                ))}
                                {!lockRows && (
                                    <td className="px-2 py-1.5 text-center">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeRow(idx)}
                                            disabled={disabled}
                                            aria-label="Eliminar renglón"
                                        >
                                            <Trash2 className="h-4 w-4 text-red-500" />
                                        </Button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                    {hasTotals && rows.length > 0 && (
                        <tfoot className="border-t bg-muted/30">
                            <tr>
                                {itemFields.map((col, ci) => {
                                    if (ci === 0) {
                                        return (
                                            <td
                                                key={col.key}
                                                className="px-3 py-2 text-left font-medium text-muted-foreground"
                                            >
                                                Totales
                                            </td>
                                        )
                                    }
                                    return (
                                        <td
                                            key={col.key}
                                            className={
                                                'px-3 py-2 ' +
                                                (col.total
                                                    ? 'text-right font-semibold tabular-nums'
                                                    : '')
                                            }
                                        >
                                            {col.total ? fmtNumber(totals[col.key] ?? 0) : null}
                                        </td>
                                    )
                                })}
                                {!lockRows && <td />}
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
            <div className="flex items-center justify-between gap-2">
                {lockRows ? (
                    <span />
                ) : (
                    <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={disabled}>
                        <Plus className="mr-1 h-4 w-4" />
                        Agregar renglón
                    </Button>
                )}
                {balance && <BalanceBadge state={balance} />}
            </div>
        </div>
    )
}

function BalanceBadge({
    state,
}: {
    state: NonNullable<ReturnType<typeof evaluateBalance>>
}) {
    if (state.balanced) {
        return (
            <span
                className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary"
                data-balance="balanced"
                role="status"
            >
                <Check className="h-4 w-4" />
                Cuadrado
            </span>
        )
    }
    const diff = Math.abs(state.diff)
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1 text-sm font-medium text-destructive"
            data-balance="unbalanced"
            role="status"
        >
            {state.message ?? `Descuadre: ${fmtNumber(diff)}`}
        </span>
    )
}

interface CellRendererProps {
    field: ActionFieldDef
    value: any
    onChange: (v: any) => void
    disabled?: boolean
    /** Header form values — for resolving a cell's `dependsOn` to a header field. */
    formValues?: Record<string, any>
    /** This row's values — for resolving a cell's `dependsOn` to a sibling cell. */
    rowValues?: Record<string, any>
}

// Per-cell widget. Mirrors the flat FieldRenderer in dynamic-form.tsx but
// without the per-field Label (the column header is the label) and sized for a
// table cell. Nested line-items inside a row are not supported (a row column is
// a scalar widget).
function CellRenderer({ field, value, onChange, disabled, formValues, rowValues }: CellRendererProps) {
    const widget = resolveWidget(field)
    // Per-field read-only: a column locked by a PrefillSpec.lock (e.g. the
    // "ordered" / "already received" progress columns of a receive-goods modal)
    // renders disabled so it shows context without being editable. Tolerates the
    // snake_case alias the kernel may serve.
    const ro = !!(field as { readonly?: boolean; read_only?: boolean }).readonly ||
        !!(field as { readonly?: boolean; read_only?: boolean }).read_only
    const off = disabled || ro
    // Cascade scope for a cell with `dependsOn`: resolved from this row first
    // (a sibling cell) then the header form (e.g. `source_warehouse_id`).
    const dependsValue = getDependsOn(field)
        ? resolveDependsValue(field, formValues, rowValues)
        : undefined

    // STATIC enum options gated per-cell by a sibling (row) or header value.
    // Row values win over the header when a key exists in both, matching
    // `resolveDependsValue`. Filtered against each option's `when`.
    const isStaticSelect =
        widget === 'select' && !field.ref && !getOptionsConfig(field)?.source && Array.isArray(field.options)
    const gateValues = isStaticSelect ? { ...(formValues ?? {}), ...(rowValues ?? {}) } : undefined
    const effectiveOptions = isStaticSelect
        ? applyOptionWhen(field.options, gateValues, getDependsOn(field))
        : undefined

    // Reset a selection the current sibling value no longer permits.
    useEffect(() => {
        if (!isStaticSelect || !effectiveOptions) return
        if (value && !effectiveOptions.some((o) => String(o.value) === String(value))) {
            onChange('')
        }
    }, [isStaticSelect, effectiveOptions, value, onChange])

    // Async searchable picker per row cell — e.g. the account_id column of a
    // journal entry's debit/credit lines. Same widget as the flat form.
    if (widget === 'dynamic_select') {
        return <DynamicSelectField field={field} value={value} onChange={onChange} dependsValue={dependsValue} readonly={ro} />
    }
    if (widget === 'select' && (field.ref || getOptionsConfig(field)?.source)) {
        return (
            <RefCell
                field={field}
                value={value}
                onChange={onChange}
                disabled={disabled}
                formValues={formValues}
                rowValues={rowValues}
            />
        )
    }
    switch (widget) {
        case 'textarea':
        case 'richtext':
            return (
                <Textarea
                    value={value || ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
                    placeholder={field.placeholder}
                    disabled={off}
                    rows={2}
                />
            )
        case 'color':
            return (
                <Input
                    type="color"
                    value={value || '#000000'}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
                    disabled={off}
                />
            )
        case 'select': {
            const opts = effectiveOptions ?? field.options
            // No option applies under the current sibling value → hide the cell.
            if (effectiveOptions && effectiveOptions.length === 0) return null
            return (
                <Select value={value || ''} onValueChange={onChange} disabled={off}>
                    <SelectTrigger className="w-full">
                        <SelectValue placeholder={field.placeholder || 'Seleccionar...'} />
                    </SelectTrigger>
                    <SelectContent>
                        {opts?.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )
        }
        case 'switch':
            return <Switch checked={!!value} onCheckedChange={onChange} disabled={off} />
        case 'number':
            return (
                <Input
                    type="number"
                    value={value ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.valueAsNumber || '')}
                    placeholder={field.placeholder}
                    disabled={off}
                />
            )
        case 'date':
            return (
                <Input
                    type="date"
                    value={value || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
                    disabled={off}
                />
            )
        default:
            return (
                <Input
                    type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
                    value={value || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
                    placeholder={field.placeholder}
                    disabled={off}
                />
            )
    }
}

function RefCell({ field, value, onChange, disabled, formValues, rowValues }: CellRendererProps) {
    // Cascade: resolve the value of the field this cell `dependsOn` from the
    // row (sibling) first, then the header form. While empty, the picker is
    // disabled with a hint instead of listing the whole (unscoped) table.
    const dependsOn = getDependsOn(field)
    const scope = dependsOn ? resolveDependsValue(field, formValues, rowValues) : ''
    const blockedByDependency = !!dependsOn && scope === ''

    // optionsConfig.source → query the source model (`/options/<source>` with
    // `field=<value>`); else fall back to the field's `ref`.
    const optSource = resolveOptionsSource(field)

    const { options, loading } = useOptionsResolver({
        modelKey: '',
        fieldKey: optSource.fieldKey,
        ref: optSource.ref,
        endpoint: optSource.endpoint,
        filterValue: dependsOn ? scope : undefined,
        enabled: !blockedByDependency,
    })

    // Clear the selection when the parent scope changes (skip initial mount).
    const prevScopeRef = useRef<string>(scope)
    useEffect(() => {
        if (!dependsOn) return
        if (prevScopeRef.current !== scope) {
            prevScopeRef.current = scope
            if (value) onChange('')
        }
    }, [dependsOn, scope, value, onChange])

    const placeholder = blockedByDependency
        ? DEFAULT_DEPENDS_HINT
        : loading
          ? 'Cargando…'
          : field.placeholder || 'Seleccionar...'

    return (
        <Select
            value={value || ''}
            onValueChange={onChange}
            disabled={disabled || loading || blockedByDependency}
        >
            <SelectTrigger className="w-full" data-depends-blocked={blockedByDependency ? '' : undefined}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {options.map((opt: ResolvedOption) => (
                    <SelectItem key={String(opt.id)} value={String(opt.id)}>
                        <span className="flex flex-col">
                            <span className="truncate">{opt.label}</span>
                            {opt.description && (
                                <span className="text-muted-foreground truncate text-xs">
                                    {opt.description}
                                </span>
                            )}
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
