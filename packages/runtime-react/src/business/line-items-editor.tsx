// DocumentLinesGrid — editor único de renglones (UX-2).
// `LineItemsEditor` es el mismo componente: las props nuevas son opcionales.
// Controlado: `value`/`onChange` con `LineItem[]`. Guardar = `serializeLineItems`.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Heading, Minus, Plus, StickyNote, Trash2 } from 'lucide-react'
import { Button, Input } from '@asteby/metacore-ui'
import { useCan } from '../permissions-context'
import { useFormatter } from './format'
import {
    addProductLine,
    applyProductToLine,
    lineGridKeyCommand,
    type DocumentLinesMode,
    type PriceSource,
} from './document-lines'
import {
    computeLine,
    computeTotals,
    makeLine,
    validateLineItems,
    type LineItem,
    type LineItemsPolicy,
    type LineItemsValidation,
} from './line-items'
import { LineProductCell } from './line-product-cell'
import {
    type ProductQuery,
    type ProductResult,
    type ProductVariant,
} from './product-search'

export type LineItemsColumn = 'discount' | 'tax' | 'technician' | 'lot' | 'dot' | 'unit'

export interface DocumentLinesGridProps {
    value: LineItem[]
    /** Se emite con cada cambio; las líneas siempre traen `key`. */
    onChange: (lines: LineItem[]) => void
    /** Columnas opcionales visibles. Default: `['discount']`. */
    columns?: LineItemsColumn[]
    policy?: LineItemsPolicy
    /** Errores externos del servidor `"<índice>.<campo>"` (de `mapApiError().fields`). */
    serverErrors?: Record<string, string>
    /** Se emite tras cada cambio con el resultado de validar (para bloquear «Guardar»). */
    onValidate?: (v: LineItemsValidation) => void
    /** Slot legado: abre el ProductPicker. Con `search`, el buscador va en la fila. */
    onRequestProduct?: () => void
    /**
     * Búsqueda en la fila (mismo contrato que ProductPicker). Al elegir, el renglón
     * se llena aquí; un segundo clic del mismo producto suma cantidad.
     */
    search?: (query: Exclude<ProductQuery, { kind: 'empty' }>, signal: AbortSignal) => Promise<ProductResult[]>
    /** `sale` usa el precio de lista; `cost` el costo de catálogo (compras). Default `sale`. */
    priceSource?: PriceSource
    /** `from_source` oculta alta/borrado y permite cantidad 0 hasta `max_quantity`. */
    mode?: DocumentLinesMode
    /** Cómo se captura el descuento. Default `percent` (el comportamiento anterior). */
    discountMode?: 'percent' | 'amount' | 'both'
    /** − / cantidad / +. Default: activo cuando hay `search`. */
    quantityStepper?: boolean
    /** Un segundo clic incrementa la cantidad del mismo producto. Default true. */
    mergeSameProduct?: boolean
    warehouseId?: string
    /** Permite secciones y notas (Odoo-style). Default true. */
    allowSections?: boolean
    readOnly?: boolean
    /** Permiso requerido para editar (default: sin gate). Sin él → solo lectura. */
    editPermission?: string
    /** Moneda ISO (default: la de la org). */
    currency?: string
    /**
     * Pinta el bloque de totales bajo la tabla. Default true; un contenedor que
     * ya muestra sus propios totales (DocumentEditor) lo apaga.
     */
    showTotals?: boolean
}

/** @deprecated Usa `DocumentLinesGridProps`. Es el mismo contrato. */
export type LineItemsEditorProps = DocumentLinesGridProps

const num = (s: string): number => (s.trim() === '' ? 0 : Number(s.replace(',', '.')) || 0)

export function DocumentLinesGrid({
    value,
    onChange,
    columns = ['discount'],
    policy,
    serverErrors,
    onValidate,
    onRequestProduct,
    search,
    priceSource = 'sale',
    mode = 'free',
    discountMode = 'percent',
    quantityStepper,
    mergeSameProduct = true,
    warehouseId,
    allowSections = true,
    readOnly = false,
    editPermission,
    currency,
    showTotals = true,
}: DocumentLinesGridProps) {
    const { t } = useTranslation()
    const can = useCan()
    const fmt = useFormatter({ currency })
    const locked = readOnly || (editPermission ? !can(editPermission) : false)
    const fromSource = mode === 'from_source'
    const effectivePolicy = useMemo<LineItemsPolicy>(
        () => (fromSource ? { ...policy, allowZeroQuantity: policy?.allowZeroQuantity ?? true } : (policy ?? {})),
        [policy, fromSource],
    )
    const view = useMemo(
        () =>
            discountMode === 'amount'
                ? value.map((l) => (l.kind === 'item' ? { ...l, discount_kind: 'amount' as const } : l))
                : value,
        [value, discountMode],
    )
    const validation = useMemo(() => validateLineItems(view, effectivePolicy), [view, effectivePolicy])
    const totals = useMemo(() => computeTotals(view), [view])
    const errors = { ...validation.errors, ...serverErrors }
    const show = (c: LineItemsColumn) => columns.includes(c)
    const stepper = quantityStepper ?? !!search
    const canAdd = !locked && !fromSource
    const [undo, setUndo] = useState<LineItem[] | null>(null)

    const emit = (next: LineItem[]) => {
        onChange(next)
        const priced = discountMode === 'amount' ? next.map((l) => (l.kind === 'item' ? { ...l, discount_kind: 'amount' as const } : l)) : next
        onValidate?.(validateLineItems(priced, effectivePolicy))
    }
    const patch = (idx: number, p: Partial<LineItem>) => {
        if (discountMode === 'amount') p = { ...p, discount_kind: 'amount' }
        emit(value.map((l, i) => (i === idx ? { ...l, ...p } : l)))
    }
    const remove = (idx: number) => {
        setUndo(value)
        emit(value.filter((_, i) => i !== idx))
    }

    const cell = (i: number, field: keyof LineItem) => errors[`${i}.${field}`]
    const warn = (i: number, field: string) => validation.warnings[`${i}.${field}`]

    // Foco tras elegir: Enter en el buscador pasa a «Cant.» del renglón que
    // recibió el producto (nuevo o sumado), como un editor de facturas pro.
    const rootRef = useRef<HTMLDivElement>(null)
    const [focusQty, setFocusQty] = useState<string | null>(null)
    useEffect(() => {
        if (!focusQty) return
        const el = rootRef.current?.querySelector<HTMLInputElement>(`[data-line-key="${focusQty}"] [data-cell="quantity"]`)
        if (el) {
            el.focus()
            el.select?.()
        }
        setFocusQty(null)
    }, [focusQty, value])

    const blankLine = () => makeLine(discountMode === 'amount' ? { discount_kind: 'amount' } : {})

    /** Renglón vacío del final: el producto entra como renglón nuevo (o suma al mismo). */
    const pickProduct = (product: ProductResult, variant?: ProductVariant) => {
        const next = addProductLine(value, product, variant, { priceSource, warehouseId, mergeSameProduct })
        emit(next)
        const id = variant?.id ?? product.id
        const target = next.find((l) => l.kind === 'item' && l.product_id === id && !value.includes(l)) ?? next[next.length - 1]
        if (target) setFocusQty(target.key)
    }

    /** Renglón libre existente: el producto elegido en su celda llena ESE renglón. */
    const fillLine = (idx: number, product: ProductResult, variant?: ProductVariant) => {
        const cur = value[idx]
        if (!cur) return
        const filled = applyProductToLine(cur, product, variant, { priceSource, warehouseId })
        emit(value.map((l, i) => (i === idx ? (discountMode === 'amount' ? { ...filled, discount_kind: 'amount' as const } : filled) : l)))
        setFocusQty(cur.key)
    }

    /** Texto escrito en el renglón vacío sin elegir producto → renglón libre con esa descripción. */
    const addFreeFromDraft = (description: string) => {
        const line = { ...blankLine(), description }
        emit([...value, line])
        setFocusQty(line.key)
    }

    // Ancho mínimo = columnas fijas + un mínimo legible para «Descripción».
    const minWidth =
        260 +
        (stepper ? 144 : 96) +
        112 +
        112 +
        40 +
        (show('discount') ? (discountMode === 'both' ? 128 : 96) : 0) +
        (show('tax') ? 64 : 0) +
        (show('unit') ? 80 : 0) +
        (show('technician') ? 128 : 0) +
        (show('lot') ? 112 : 0) +
        (show('dot') ? 96 : 0)
    const colCount = 1 + (['unit', 'discount', 'tax', 'technician', 'lot', 'dot'] as LineItemsColumn[]).filter(show).length + 4

    const descKeys = (e: KeyboardEvent<HTMLInputElement>, i: number, l: LineItem) => {
        const cmd = lineGridKeyCommand(e.key, {
            cellEmpty: !l.description.trim() && !l.product_id,
            mode,
        })
        if (cmd === 'delete') {
            e.preventDefault()
            remove(i)
        } else if (cmd === 'add') {
            e.preventDefault()
            emit([...value, blankLine()])
        }
    }

    return (
        <div ref={rootRef} data-slot="line-items-editor" data-component="DocumentLinesGrid" data-mode={mode} className="space-y-2">
            <div className="overflow-x-auto rounded-lg border bg-card/40">
                {/* table-fixed: «Descripción» se queda con el ancho libre y las
                    numéricas con el suyo; en pantallas angostas la tabla
                    conserva un mínimo y desplaza en horizontal. */}
                <table className="w-full table-fixed border-collapse text-sm" style={{ minWidth }}>
                    <thead className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2 font-medium">{t('lineItems.description', { defaultValue: 'Descripción' })}</th>
                            {show('unit') && <th className="w-20 px-3 py-2 font-medium">{t('lineItems.unit', { defaultValue: 'Unidad' })}</th>}
                            <th className={(stepper ? 'w-36' : 'w-24') + ' px-3 py-2 text-right font-medium'}>{t('lineItems.quantity', { defaultValue: 'Cant.' })}</th>
                            <th className="w-28 px-3 py-2 text-right font-medium">
                                {priceSource === 'cost'
                                    ? t('lineItems.unitCost', { defaultValue: 'Costo unitario' })
                                    : t('lineItems.unitPrice', { defaultValue: 'Precio' })}
                            </th>
                            {show('discount') && (
                                <th className={(discountMode === 'both' ? 'w-32' : 'w-24') + ' px-3 py-2 text-right font-medium'}>
                                    {discountMode === 'amount'
                                        ? t('lineItems.discountAmount', { defaultValue: 'Desc.' })
                                        : t('lineItems.discount', { defaultValue: 'Desc. %' })}
                                </th>
                            )}
                            {show('tax') && <th className="w-16 px-3 py-2 text-right font-medium">{t('lineItems.tax', { defaultValue: 'IVA %' })}</th>}
                            {show('technician') && <th className="w-32 px-3 py-2 font-medium">{t('lineItems.technician', { defaultValue: 'Técnico' })}</th>}
                            {show('lot') && <th className="w-28 px-3 py-2 font-medium">{t('lineItems.lot', { defaultValue: 'Lote' })}</th>}
                            {show('dot') && <th className="w-24 px-3 py-2 font-medium">DOT</th>}
                            <th className="w-28 px-3 py-2 text-right font-medium">{t('lineItems.amount', { defaultValue: 'Importe' })}</th>
                            <th className="w-10"><span className="sr-only">{t('common.actions', { defaultValue: 'Acciones' })}</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {value.map((l, i) => {
                            if (l.kind !== 'item') {
                                return (
                                    <tr key={l.key} className="group border-t bg-muted/30" data-line-key={l.key}>
                                        <td colSpan={99} className={CELL}>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    value={l.description}
                                                    disabled={locked}
                                                    aria-invalid={!!cell(i, 'description')}
                                                    placeholder={l.kind === 'section' ? t('lineItems.sectionPlaceholder', { defaultValue: 'Sección' }) : t('lineItems.notePlaceholder', { defaultValue: 'Nota' })}
                                                    className={'h-8 ' + (l.kind === 'section' ? 'font-semibold' : 'italic')}
                                                    onChange={(e) => patch(i, { description: e.target.value })}
                                                    onKeyDown={(e) => {
                                                        const cmd = lineGridKeyCommand(e.key, { cellEmpty: !l.description.trim(), mode })
                                                        if (cmd === 'delete') {
                                                            e.preventDefault()
                                                            remove(i)
                                                        }
                                                    }}
                                                />
                                                {canAdd && (
                                                    <Button type="button" size="icon" variant="ghost" className={DELETE} onClick={() => remove(i)} aria-label={t('common.delete', { defaultValue: 'Eliminar' })}>
                                                        <Trash2 className="size-4" />
                                                    </Button>
                                                )}
                                            </div>
                                            {cell(i, 'description') && <p className="mt-1 text-xs text-destructive">{cell(i, 'description')}</p>}
                                        </td>
                                    </tr>
                                )
                            }
                            const shown = view[i] ?? l
                            const a = computeLine(shown)
                            const kind = shown.discount_kind ?? 'percent'
                            const qtyMax = l.max_quantity
                            return (
                                <tr key={l.key} className="group border-t align-top transition-colors hover:bg-muted/30 focus-within:bg-muted/20" data-line-key={l.key}>
                                    <td className={CELL}>
                                        {search && canAdd && !l.product_id ? (
                                            <LineProductCell
                                                search={search}
                                                text={l.description}
                                                onTextChange={(text) => patch(i, { description: text })}
                                                onPick={(p, v) => fillLine(i, p, v)}
                                                onKeyDownClosed={(e) => descKeys(e, i, l)}
                                                warehouseId={warehouseId}
                                                currency={currency}
                                                ariaLabel={t('lineItems.description', { defaultValue: 'Descripción' })}
                                                invalid={!!cell(i, 'description')}
                                                dataCell="description"
                                            />
                                        ) : (
                                            <Input
                                                value={l.description}
                                                disabled={locked}
                                                className={INPUT}
                                                data-cell="description"
                                                aria-label={t('lineItems.description', { defaultValue: 'Descripción' })}
                                                aria-invalid={!!cell(i, 'description')}
                                                onChange={(e) => patch(i, { description: e.target.value })}
                                                onKeyDown={(e) => descKeys(e, i, l)}
                                            />
                                        )}
                                        {(l.sku || l.unit) && (
                                            <p className="mt-0.5 text-xs text-muted-foreground">{[l.sku, !show('unit') ? l.unit : ''].filter(Boolean).join(' · ')}</p>
                                        )}
                                        {cell(i, 'description') && <p className="mt-0.5 text-xs text-destructive">{cell(i, 'description')}</p>}
                                    </td>
                                    {show('unit') && (
                                        <td className={CELL}>
                                            <Input className={INPUT} value={l.unit ?? ''} disabled={locked} onChange={(e) => patch(i, { unit: e.target.value })} />
                                        </td>
                                    )}
                                    <td className={CELL}>
                                        {stepper ? (
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="outline"
                                                    className="size-7"
                                                    disabled={locked || toNum(l.quantity) <= (fromSource ? 0 : 1)}
                                                    aria-label={t('lineItems.decreaseQty', { defaultValue: 'Disminuir cantidad' })}
                                                    onClick={() => patch(i, { quantity: Math.max(fromSource ? 0 : 1, toNum(l.quantity) - 1) })}
                                                >
                                                    <Minus className="size-3" />
                                                </Button>
                                                <Input
                                                    inputMode="decimal"
                                                    className="h-8 w-14 text-right tabular-nums"
                                                    data-cell="quantity"
                                                    value={String(l.quantity)}
                                                    disabled={locked}
                                                    aria-label={t('lineItems.quantity', { defaultValue: 'Cant.' })}
                                                    aria-invalid={!!cell(i, 'quantity')}
                                                    onChange={(e) => {
                                                        let q = num(e.target.value)
                                                        if (qtyMax != null && q > qtyMax) q = qtyMax
                                                        if (q < 0 && !effectivePolicy.allowNegative) q = 0
                                                        patch(i, { quantity: q })
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="outline"
                                                    className="size-7"
                                                    disabled={locked || (qtyMax != null && toNum(l.quantity) >= qtyMax)}
                                                    aria-label={t('lineItems.increaseQty', { defaultValue: 'Aumentar cantidad' })}
                                                    onClick={() => {
                                                        const next = toNum(l.quantity) + 1
                                                        patch(i, { quantity: qtyMax != null ? Math.min(next, qtyMax) : next })
                                                    }}
                                                >
                                                    <Plus className="size-3" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <Input
                                                inputMode="decimal"
                                                className={NUM}
                                                data-cell="quantity"
                                                value={String(l.quantity)}
                                                disabled={locked}
                                                aria-label={t('lineItems.quantity', { defaultValue: 'Cant.' })}
                                                aria-invalid={!!cell(i, 'quantity')}
                                                onChange={(e) => patch(i, { quantity: num(e.target.value) })}
                                            />
                                        )}
                                        {cell(i, 'quantity') && <p className="mt-0.5 text-xs text-destructive">{cell(i, 'quantity')}</p>}
                                        {!cell(i, 'quantity') && warn(i, 'quantity') && <p className="mt-0.5 text-xs text-muted-foreground">{warn(i, 'quantity')}</p>}
                                    </td>
                                    <td className={CELL}>
                                        <Input
                                            inputMode="decimal"
                                            className={NUM}
                                            value={String(l.unit_price)}
                                            disabled={locked}
                                            aria-label={priceSource === 'cost' ? t('lineItems.unitCost', { defaultValue: 'Costo unitario' }) : t('lineItems.unitPrice', { defaultValue: 'Precio' })}
                                            aria-invalid={!!cell(i, 'unit_price')}
                                            onChange={(e) => patch(i, { unit_price: num(e.target.value) })}
                                        />
                                        {l.catalog_price != null && (
                                            <p className="mt-0.5 truncate whitespace-nowrap text-right text-xs text-muted-foreground">
                                                {t('lineItems.catalogPrice', { defaultValue: 'Catálogo' })} {fmt.money(l.catalog_price)}
                                            </p>
                                        )}
                                        {cell(i, 'unit_price') && <p className="mt-0.5 text-xs text-destructive">{cell(i, 'unit_price')}</p>}
                                        {!cell(i, 'unit_price') && warn(i, 'unit_price') && <p className="mt-0.5 text-xs text-muted-foreground">{warn(i, 'unit_price')}</p>}
                                    </td>
                                    {show('discount') && (
                                        <td className={CELL}>
                                            <div className="flex items-center gap-1">
                                                {discountMode === 'both' && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-8 px-1.5"
                                                        aria-label={t('lineItems.discountKind', { defaultValue: 'Tipo de descuento' })}
                                                        onClick={() => patch(i, { discount_kind: kind === 'amount' ? 'percent' : 'amount', discount: 0 })}
                                                    >
                                                        {kind === 'amount' ? '$' : '%'}
                                                    </Button>
                                                )}
                                                <Input
                                                    inputMode="decimal"
                                                    className={NUM}
                                                    value={String(l.discount)}
                                                    disabled={locked}
                                                    aria-invalid={!!cell(i, 'discount')}
                                                    onChange={(e) => patch(i, { discount: num(e.target.value), discount_kind: kind })}
                                                />
                                            </div>
                                            {cell(i, 'discount') && <p className="mt-0.5 text-xs text-destructive">{cell(i, 'discount')}</p>}
                                        </td>
                                    )}
                                    {show('tax') && (
                                        <td className={CELL}>
                                            <Input
                                                inputMode="decimal"
                                                className={NUM}
                                                value={String(Math.round(l.tax_rate * 10000) / 100)}
                                                disabled={locked}
                                                onChange={(e) => patch(i, { tax_rate: num(e.target.value) / 100 })}
                                            />
                                        </td>
                                    )}
                                    {show('technician') && (
                                        <td className={CELL}>
                                            <Input className={INPUT} value={l.technician_id ?? ''} disabled={locked} onChange={(e) => patch(i, { technician_id: e.target.value })} />
                                        </td>
                                    )}
                                    {show('lot') && (
                                        <td className={CELL}>
                                            <Input className={INPUT} value={l.lot ?? ''} disabled={locked} onChange={(e) => patch(i, { lot: e.target.value })} />
                                        </td>
                                    )}
                                    {show('dot') && (
                                        <td className={CELL}>
                                            <Input className={INPUT} value={l.dot ?? ''} disabled={locked} onChange={(e) => patch(i, { dot: e.target.value })} />
                                        </td>
                                    )}
                                    <td className="px-3 py-1.5 text-right align-top font-medium tabular-nums" data-slot="line-amount">
                                        <span className="inline-flex h-8 items-center">{fmt.money(a.net)}</span>
                                    </td>
                                    <td className="px-1 py-1.5 align-top">
                                        {canAdd && (
                                            <Button type="button" size="icon" variant="ghost" className={DELETE} onClick={() => remove(i)} aria-label={t('common.delete', { defaultValue: 'Eliminar' })}>
                                                <Trash2 className="size-4" />
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                        {value.length === 0 && !search && (
                            <tr>
                                <td colSpan={99} className="px-3 py-6 text-center text-muted-foreground">
                                    {t('lineItems.empty', { defaultValue: 'Aún no hay renglones. Agrega un producto o un renglón libre.' })}
                                </td>
                            </tr>
                        )}
                        {canAdd && search && (
                            <DraftRow
                                search={search}
                                warehouseId={warehouseId}
                                currency={currency}
                                onPick={pickProduct}
                                onFree={addFreeFromDraft}
                                onAddBlank={() => emit([...value, blankLine()])}
                                trailingCells={colCount - 1}
                            />
                        )}
                    </tbody>
                    {showTotals && (
                        <tfoot className="border-t bg-muted/20 text-sm tabular-nums" data-slot="line-totals">
                            <TotalRow span={colCount - 2} label={t('lineItems.subtotal', { defaultValue: 'Subtotal' })} value={fmt.money(totals.subtotal)} />
                            {totals.discount > 0 && <TotalRow span={colCount - 2} label={t('lineItems.discountTotal', { defaultValue: 'Descuento' })} value={`-${fmt.money(totals.discount)}`} />}
                            {totals.tax > 0 && <TotalRow span={colCount - 2} label={t('lineItems.taxTotal', { defaultValue: 'Impuestos' })} value={fmt.money(totals.tax)} slot="tax-total" />}
                            <TotalRow span={colCount - 2} label={t('lineItems.total', { defaultValue: 'Total' })} value={fmt.money(totals.total)} slot="grand-total" strong />
                        </tfoot>
                    )}
                </table>
            </div>

            {validation.form && value.length > 0 && <p role="alert" className="text-sm text-destructive">{validation.form}</p>}

            {undo && canAdd && (
                <p className="text-sm text-muted-foreground">
                    {t('lineItems.removed', { defaultValue: 'Renglón eliminado.' })}{' '}
                    <button
                        type="button"
                        className="underline"
                        onClick={() => {
                            emit(undo)
                            setUndo(null)
                        }}
                    >
                        {t('lineItems.undo', { defaultValue: 'Deshacer' })}
                    </button>
                </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
                {canAdd ? (
                    <div className="flex flex-wrap gap-1">
                        {onRequestProduct && !search && (
                            <Button type="button" size="sm" variant="outline" onClick={onRequestProduct}>
                                <Plus className="mr-1 size-4" />
                                {t('lineItems.addProduct', { defaultValue: 'Agregar producto' })}
                            </Button>
                        )}
                        <Button type="button" size="sm" variant="ghost" onClick={() => emit([...value, blankLine()])}>
                            <Plus className="mr-1 size-4" />
                            {t('lineItems.addLine', { defaultValue: 'Renglón libre' })}
                        </Button>
                        {allowSections && (
                            <>
                                <Button type="button" size="sm" variant="ghost" onClick={() => emit([...value, makeLine({ kind: 'section' })])}>
                                    <Heading className="mr-1 size-4" />
                                    {t('lineItems.addSection', { defaultValue: 'Sección' })}
                                </Button>
                                <Button type="button" size="sm" variant="ghost" onClick={() => emit([...value, makeLine({ kind: 'note' })])}>
                                    <StickyNote className="mr-1 size-4" />
                                    {t('lineItems.addNote', { defaultValue: 'Nota' })}
                                </Button>
                            </>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    )
}

/** Mismo componente. El nombre anterior sigue exportado. */
export const LineItemsEditor = DocumentLinesGrid

function toNum(n: number): number {
    return Number.isFinite(n) ? n : 0
}

/**
 * Renglón vacío del final, siempre listo para buscar: el buscador vive en la
 * celda «Descripción» (no en una barra a todo lo ancho). Elegir agrega el
 * producto; Enter con texto sin coincidencias lo agrega como renglón libre.
 */
function DraftRow({
    search,
    warehouseId,
    currency,
    onPick,
    onFree,
    onAddBlank,
    trailingCells,
}: {
    trailingCells: number
    search: NonNullable<DocumentLinesGridProps['search']>
    warehouseId?: string
    currency?: string
    onPick: (product: ProductResult, variant?: ProductVariant) => void
    onFree: (description: string) => void
    onAddBlank: () => void
}) {
    const { t } = useTranslation()
    const [text, setText] = useState('')
    return (
        <tr className="border-t border-dashed" data-slot="line-draft-row">
            <td className={CELL}>
                <LineProductCell
                    search={search}
                    text={text}
                    onTextChange={setText}
                    onPick={(p, v) => {
                        setText('')
                        onPick(p, v)
                    }}
                    onKeyDownClosed={(e) => {
                        if (e.key !== 'Enter') return
                        e.preventDefault()
                        const typed = text.trim()
                        setText('')
                        if (typed) onFree(typed)
                        else onAddBlank()
                    }}
                    warehouseId={warehouseId}
                    currency={currency}
                    ariaLabel={t('lineItems.searchProduct', { defaultValue: 'Buscar producto' })}
                    placeholder={t('lineItems.searchPlaceholder', { defaultValue: 'Producto, medida (205/55R16), SKU o código de barras' })}
                    className="border-dashed bg-transparent shadow-none"
                    dataCell="search"
                />
            </td>
            {/* Celdas vacías con la misma estructura: el buscador mide lo que su columna. */}
            {Array.from({ length: trailingCells }, (_, i) => (
                <td key={i} aria-hidden />
            ))}
        </tr>
    )
}

/** Fila de totales alineada a la columna «Importe». */
function TotalRow({ span, label, value, slot, strong }: { span: number; label: string; value: string; slot?: string; strong?: boolean }) {
    return (
        <tr className={strong ? 'font-semibold' : 'text-muted-foreground'}>
            <td colSpan={span} className="px-3 py-1 text-right">{label}</td>
            <td className={'px-3 py-1 text-right ' + (strong ? 'text-base text-foreground' : 'text-foreground')} data-slot={slot}>
                {value}
            </td>
            <td />
        </tr>
    )
}

/** Borrar renglón: aparece al pasar o enfocar la fila (siempre visible en móvil). */
const DELETE =
    'size-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100'

/** Celda densa: misma altura en todos los renglones. */
const CELL = 'px-2 py-1.5 align-top'
/** Inputs de celda: un poco más bajos que los del formulario (densidad de editor). */
const INPUT = 'h-8'
/** Numéricos: alineados a la derecha y con cifras tabulares. */
const NUM = 'h-8 text-right tabular-nums'
