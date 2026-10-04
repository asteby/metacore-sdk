// DocumentLinesGrid — editor único de renglones (UX-2).
// `LineItemsEditor` es el mismo componente: las props nuevas son opcionales.
// Controlado: `value`/`onChange` con `LineItem[]`. Guardar = `serializeLineItems`.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heading, Minus, Plus, Search, StickyNote, Trash2 } from 'lucide-react'
import { Button, Input } from '@asteby/metacore-ui'
import { useCan } from '../permissions-context'
import { useFormatter } from './format'
import {
    addProductLine,
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
import { useAsyncSearch } from './use-async-search'
import {
    parseProductQuery,
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

    const pickProduct = (product: ProductResult, variant?: ProductVariant) => {
        emit(addProductLine(value, product, variant, { priceSource, warehouseId, mergeSameProduct }))
    }

    return (
        <div data-slot="line-items-editor" data-component="DocumentLinesGrid" data-mode={mode} className="space-y-2">
            <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                        <tr>
                            <th className="px-2 py-2">{t('lineItems.description', { defaultValue: 'Descripción' })}</th>
                            {show('unit') && <th className="w-20 px-2 py-2">{t('lineItems.unit', { defaultValue: 'Unidad' })}</th>}
                            <th className="w-36 px-2 py-2 text-right">{t('lineItems.quantity', { defaultValue: 'Cant.' })}</th>
                            <th className="w-32 px-2 py-2 text-right">
                                {priceSource === 'cost'
                                    ? t('lineItems.unitCost', { defaultValue: 'Costo unitario' })
                                    : t('lineItems.unitPrice', { defaultValue: 'Precio' })}
                            </th>
                            {show('discount') && (
                                <th className="w-28 px-2 py-2 text-right">
                                    {discountMode === 'amount'
                                        ? t('lineItems.discountAmount', { defaultValue: 'Desc.' })
                                        : t('lineItems.discount', { defaultValue: 'Desc. %' })}
                                </th>
                            )}
                            {show('tax') && <th className="w-20 px-2 py-2 text-right">{t('lineItems.tax', { defaultValue: 'IVA %' })}</th>}
                            {show('technician') && <th className="w-32 px-2 py-2">{t('lineItems.technician', { defaultValue: 'Técnico' })}</th>}
                            {show('lot') && <th className="w-28 px-2 py-2">{t('lineItems.lot', { defaultValue: 'Lote' })}</th>}
                            {show('dot') && <th className="w-24 px-2 py-2">DOT</th>}
                            <th className="w-32 px-2 py-2 text-right">{t('lineItems.amount', { defaultValue: 'Importe' })}</th>
                            <th className="w-10" />
                        </tr>
                    </thead>
                    <tbody>
                        {value.map((l, i) => {
                            if (l.kind !== 'item') {
                                return (
                                    <tr key={l.key} className="border-t bg-muted/30">
                                        <td colSpan={99} className="px-2 py-1.5">
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    value={l.description}
                                                    disabled={locked}
                                                    aria-invalid={!!cell(i, 'description')}
                                                    placeholder={l.kind === 'section' ? t('lineItems.sectionPlaceholder', { defaultValue: 'Sección' }) : t('lineItems.notePlaceholder', { defaultValue: 'Nota' })}
                                                    className={l.kind === 'section' ? 'font-semibold' : 'italic'}
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
                                                    <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)} aria-label={t('common.delete', { defaultValue: 'Eliminar' })}>
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
                                <tr key={l.key} className="border-t align-top" data-line-key={l.key}>
                                    <td className="px-2 py-1.5">
                                        <Input
                                            value={l.description}
                                            disabled={locked}
                                            aria-label={t('lineItems.description', { defaultValue: 'Descripción' })}
                                            aria-invalid={!!cell(i, 'description')}
                                            onChange={(e) => patch(i, { description: e.target.value })}
                                            onKeyDown={(e) => {
                                                const cmd = lineGridKeyCommand(e.key, {
                                                    cellEmpty: !l.description.trim() && !l.product_id,
                                                    mode,
                                                })
                                                if (cmd === 'delete') {
                                                    e.preventDefault()
                                                    remove(i)
                                                } else if (cmd === 'add') {
                                                    e.preventDefault()
                                                    emit([...value, makeLine(discountMode === 'amount' ? { discount_kind: 'amount' } : {})])
                                                }
                                            }}
                                        />
                                        {(l.sku || l.unit) && (
                                            <p className="mt-0.5 text-xs text-muted-foreground">{[l.sku, !show('unit') ? l.unit : ''].filter(Boolean).join(' · ')}</p>
                                        )}
                                        {cell(i, 'description') && <p className="mt-0.5 text-xs text-destructive">{cell(i, 'description')}</p>}
                                    </td>
                                    {show('unit') && (
                                        <td className="px-2 py-1.5">
                                            <Input value={l.unit ?? ''} disabled={locked} onChange={(e) => patch(i, { unit: e.target.value })} />
                                        </td>
                                    )}
                                    <td className="px-2 py-1.5">
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
                                                    className="h-8 w-14 text-right"
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
                                                className="text-right"
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
                                    <td className="px-2 py-1.5">
                                        <Input
                                            inputMode="decimal"
                                            className="text-right"
                                            value={String(l.unit_price)}
                                            disabled={locked}
                                            aria-label={priceSource === 'cost' ? t('lineItems.unitCost', { defaultValue: 'Costo unitario' }) : t('lineItems.unitPrice', { defaultValue: 'Precio' })}
                                            aria-invalid={!!cell(i, 'unit_price')}
                                            onChange={(e) => patch(i, { unit_price: num(e.target.value) })}
                                        />
                                        {l.catalog_price != null && (
                                            <p className="mt-0.5 text-right text-xs text-muted-foreground">
                                                {t('lineItems.catalogPrice', { defaultValue: 'Catálogo' })} {fmt.money(l.catalog_price)}
                                            </p>
                                        )}
                                        {cell(i, 'unit_price') && <p className="mt-0.5 text-xs text-destructive">{cell(i, 'unit_price')}</p>}
                                        {!cell(i, 'unit_price') && warn(i, 'unit_price') && <p className="mt-0.5 text-xs text-muted-foreground">{warn(i, 'unit_price')}</p>}
                                    </td>
                                    {show('discount') && (
                                        <td className="px-2 py-1.5">
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
                                                    className="text-right"
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
                                        <td className="px-2 py-1.5">
                                            <Input
                                                inputMode="decimal"
                                                className="text-right"
                                                value={String(Math.round(l.tax_rate * 10000) / 100)}
                                                disabled={locked}
                                                onChange={(e) => patch(i, { tax_rate: num(e.target.value) / 100 })}
                                            />
                                        </td>
                                    )}
                                    {show('technician') && (
                                        <td className="px-2 py-1.5">
                                            <Input value={l.technician_id ?? ''} disabled={locked} onChange={(e) => patch(i, { technician_id: e.target.value })} />
                                        </td>
                                    )}
                                    {show('lot') && (
                                        <td className="px-2 py-1.5">
                                            <Input value={l.lot ?? ''} disabled={locked} onChange={(e) => patch(i, { lot: e.target.value })} />
                                        </td>
                                    )}
                                    {show('dot') && (
                                        <td className="px-2 py-1.5">
                                            <Input value={l.dot ?? ''} disabled={locked} onChange={(e) => patch(i, { dot: e.target.value })} />
                                        </td>
                                    )}
                                    <td className="px-2 py-2 text-right tabular-nums" data-slot="line-amount">{fmt.money(a.net)}</td>
                                    <td className="px-1 py-1.5">
                                        {canAdd && (
                                            <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)} aria-label={t('common.delete', { defaultValue: 'Eliminar' })}>
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
                            <SearchRow
                                search={search}
                                warehouseId={warehouseId}
                                currency={currency}
                                onPick={pickProduct}
                                onAddFree={() => emit([...value, makeLine(discountMode === 'amount' ? { discount_kind: 'amount' } : {})])}
                            />
                        )}
                    </tbody>
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

            <div className="flex flex-wrap items-start justify-between gap-3">
                {canAdd ? (
                    <div className="flex flex-wrap gap-2">
                        {onRequestProduct && !search && (
                            <Button type="button" size="sm" variant="outline" onClick={onRequestProduct}>
                                <Plus className="mr-1 size-4" />
                                {t('lineItems.addProduct', { defaultValue: 'Agregar producto' })}
                            </Button>
                        )}
                        <Button type="button" size="sm" variant="outline" onClick={() => emit([...value, makeLine(discountMode === 'amount' ? { discount_kind: 'amount' } : {})])}>
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
                ) : (
                    <span />
                )}
                <dl className="min-w-56 space-y-0.5 text-sm tabular-nums">
                    <div className="flex justify-between gap-6"><dt className="text-muted-foreground">{t('lineItems.subtotal', { defaultValue: 'Subtotal' })}</dt><dd>{fmt.money(totals.subtotal)}</dd></div>
                    {totals.discount > 0 && <div className="flex justify-between gap-6"><dt className="text-muted-foreground">{t('lineItems.discountTotal', { defaultValue: 'Descuento' })}</dt><dd>-{fmt.money(totals.discount)}</dd></div>}
                    {totals.tax > 0 && <div className="flex justify-between gap-6"><dt className="text-muted-foreground">{t('lineItems.taxTotal', { defaultValue: 'Impuestos' })}</dt><dd data-slot="tax-total">{fmt.money(totals.tax)}</dd></div>}
                    <div className="flex justify-between gap-6 font-semibold"><dt>{t('lineItems.total', { defaultValue: 'Total' })}</dt><dd data-slot="grand-total">{fmt.money(totals.total)}</dd></div>
                </dl>
            </div>
        </div>
    )
}

/** Mismo componente. El nombre anterior sigue exportado. */
export const LineItemsEditor = DocumentLinesGrid

function toNum(n: number): number {
    return Number.isFinite(n) ? n : 0
}

function SearchRow({
    search,
    warehouseId,
    currency,
    onPick,
    onAddFree,
}: {
    search: NonNullable<DocumentLinesGridProps['search']>
    warehouseId?: string
    currency?: string
    onPick: (product: ProductResult, variant?: ProductVariant) => void
    onAddFree: () => void
}) {
    const { t } = useTranslation()
    const fmt = useFormatter({ currency })
    const [text, setText] = useState('')
    const [active, setActive] = useState(0)
    const parsed = parseProductQuery(text)
    const run = useMemo(() => {
        return (q: string, signal: AbortSignal) => {
            const p = parseProductQuery(q)
            return p.kind === 'empty' ? Promise.resolve([]) : search(p, signal)
        }
    }, [search])
    const { results, loading } = useAsyncSearch(text, run, {
        minChars: parsed.kind === 'barcode' ? 8 : 2,
        delay: parsed.kind === 'barcode' ? 0 : 250,
    })
    const flat = results.flatMap((p) =>
        (p.variants?.length ?? 0) > 0 ? p.variants!.map((v) => ({ product: p, variant: v as ProductVariant | undefined })) : [{ product: p, variant: undefined as ProductVariant | undefined }],
    )
    const open = flat.length > 0

    const choose = (idx: number) => {
        const hit = flat[idx]
        if (!hit) return
        onPick(hit.product, hit.variant)
        setText('')
        setActive(0)
    }

    return (
        <tr className="border-t">
            <td colSpan={99} className="px-2 py-1.5">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
                    <Input
                        className="pl-8"
                        value={text}
                        role="combobox"
                        aria-expanded={open}
                        aria-label={t('lineItems.searchProduct', { defaultValue: 'Buscar producto' })}
                        placeholder={t('lineItems.searchPlaceholder', { defaultValue: 'Producto, medida (205/55R16), SKU o código de barras' })}
                        onChange={(e) => {
                            setText(e.target.value)
                            setActive(0)
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'ArrowDown' && open) {
                                e.preventDefault()
                                setActive((n) => Math.min(flat.length - 1, n + 1))
                                return
                            }
                            if (e.key === 'ArrowUp' && open) {
                                e.preventDefault()
                                setActive((n) => Math.max(0, n - 1))
                                return
                            }
                            const cmd = lineGridKeyCommand(e.key, { suggestionsOpen: open, cellEmpty: !text.trim(), mode: 'free' })
                            if (e.key === 'Enter' && open) {
                                e.preventDefault()
                                choose(active)
                                return
                            }
                            if (cmd === 'add' && !text.trim()) {
                                e.preventDefault()
                                onAddFree()
                            }
                        }}
                    />
                    {open && (
                        <ul role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-md">
                            {flat.map((hit, idx) => {
                                const price = priceOf(hit.product, hit.variant, warehouseId)
                                return (
                                    <li key={`${hit.product.id}:${hit.variant?.id ?? ''}`} role="option" aria-selected={idx === active}>
                                        <button
                                            type="button"
                                            className={'flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent ' + (idx === active ? 'bg-accent' : '')}
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => choose(idx)}
                                        >
                                            <span>
                                                <span className="block font-medium">{hit.variant ? `${hit.product.name} · ${hit.variant.label}` : hit.product.name}</span>
                                                <span className="block text-xs text-muted-foreground">{hit.variant?.sku ?? hit.product.sku}</span>
                                            </span>
                                            {price != null && <span className="tabular-nums">{fmt.money(price)}</span>}
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                    {loading && <p className="mt-1 text-xs text-muted-foreground">{t('common.searching', { defaultValue: 'Buscando…' })}</p>}
                </div>
            </td>
        </tr>
    )
}

function priceOf(p: ProductResult, v: ProductVariant | undefined, _warehouseId?: string): number | undefined {
    return v?.price ?? p.price
}
