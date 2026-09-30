// LineItemsEditor — editor de renglones compartido (benchmark §7, COT-1/PIT-018).
// Controlado: `value`/`onChange` con `LineItem[]`. Guardar = `serializeLineItems`.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, StickyNote, Heading } from 'lucide-react'
import { Button, Input } from '@asteby/metacore-ui'
import { useCan } from '../permissions-context'
import { useFormatter } from './format'
import {
    computeLine,
    computeTotals,
    makeLine,
    validateLineItems,
    type LineItem,
    type LineItemsPolicy,
    type LineItemsValidation,
} from './line-items'

export type LineItemsColumn = 'discount' | 'tax' | 'technician' | 'lot' | 'dot'

export interface LineItemsEditorProps {
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
    /** Slot: abre el ProductPicker; al elegir, el llamador hace `onChange([...value, makeLine(...)])`. */
    onRequestProduct?: () => void
    /** Permite secciones y notas (Odoo-style). Default true. */
    allowSections?: boolean
    readOnly?: boolean
    /** Permiso requerido para editar (default: sin gate). Sin él → solo lectura. */
    editPermission?: string
    /** Moneda ISO (default: la de la org). */
    currency?: string
}

const num = (s: string): number => (s.trim() === '' ? 0 : Number(s.replace(',', '.')) || 0)

export function LineItemsEditor({
    value,
    onChange,
    columns = ['discount'],
    policy,
    serverErrors,
    onValidate,
    onRequestProduct,
    allowSections = true,
    readOnly = false,
    editPermission,
    currency,
}: LineItemsEditorProps) {
    const { t } = useTranslation()
    const can = useCan()
    const fmt = useFormatter({ currency })
    const locked = readOnly || (editPermission ? !can(editPermission) : false)
    const validation = useMemo(() => validateLineItems(value, policy), [value, policy])
    const totals = useMemo(() => computeTotals(value), [value])
    const errors = { ...validation.errors, ...serverErrors }
    const show = (c: LineItemsColumn) => columns.includes(c)

    const emit = (next: LineItem[]) => {
        onChange(next)
        onValidate?.(validateLineItems(next, policy))
    }
    const patch = (idx: number, p: Partial<LineItem>) =>
        emit(value.map((l, i) => (i === idx ? { ...l, ...p } : l)))
    const remove = (idx: number) => emit(value.filter((_, i) => i !== idx))

    const cell = (i: number, field: keyof LineItem) => errors[`${i}.${field}`]
    const warn = (i: number, field: string) => validation.warnings[`${i}.${field}`]

    return (
        <div data-slot="line-items-editor" className="space-y-2">
            <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                        <tr>
                            <th className="px-2 py-2">{t('lineItems.description', { defaultValue: 'Descripción' })}</th>
                            <th className="w-24 px-2 py-2 text-right">{t('lineItems.quantity', { defaultValue: 'Cant.' })}</th>
                            <th className="w-32 px-2 py-2 text-right">{t('lineItems.unitPrice', { defaultValue: 'Precio' })}</th>
                            {show('discount') && <th className="w-20 px-2 py-2 text-right">{t('lineItems.discount', { defaultValue: 'Desc. %' })}</th>}
                            {show('tax') && <th className="w-20 px-2 py-2 text-right">{t('lineItems.tax', { defaultValue: 'IVA %' })}</th>}
                            {show('technician') && <th className="w-32 px-2 py-2">{t('lineItems.technician', { defaultValue: 'Técnico' })}</th>}
                            {show('lot') && <th className="w-28 px-2 py-2">{t('lineItems.lot', { defaultValue: 'Lote' })}</th>}
                            {show('dot') && <th className="w-24 px-2 py-2">DOT</th>}
                            <th className="w-32 px-2 py-2 text-right">{t('lineItems.total', { defaultValue: 'Importe' })}</th>
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
                                                />
                                                {!locked && (
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
                            const a = computeLine(l)
                            return (
                                <tr key={l.key} className="border-t align-top">
                                    <td className="px-2 py-1.5">
                                        <Input
                                            value={l.description}
                                            disabled={locked}
                                            aria-invalid={!!cell(i, 'description')}
                                            onChange={(e) => patch(i, { description: e.target.value })}
                                        />
                                        {l.sku && <p className="mt-0.5 text-xs text-muted-foreground">{l.sku}</p>}
                                        {cell(i, 'description') && <p className="mt-0.5 text-xs text-destructive">{cell(i, 'description')}</p>}
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <Input
                                            inputMode="decimal"
                                            className="text-right"
                                            value={String(l.quantity)}
                                            disabled={locked}
                                            aria-invalid={!!cell(i, 'quantity')}
                                            onChange={(e) => patch(i, { quantity: num(e.target.value) })}
                                        />
                                        {cell(i, 'quantity') && <p className="mt-0.5 text-xs text-destructive">{cell(i, 'quantity')}</p>}
                                        {!cell(i, 'quantity') && warn(i, 'quantity') && <p className="mt-0.5 text-xs text-muted-foreground">{warn(i, 'quantity')}</p>}
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <Input
                                            inputMode="decimal"
                                            className="text-right"
                                            value={String(l.unit_price)}
                                            disabled={locked}
                                            aria-invalid={!!cell(i, 'unit_price')}
                                            onChange={(e) => patch(i, { unit_price: num(e.target.value) })}
                                        />
                                        {cell(i, 'unit_price') && <p className="mt-0.5 text-xs text-destructive">{cell(i, 'unit_price')}</p>}
                                    </td>
                                    {show('discount') && (
                                        <td className="px-2 py-1.5">
                                            <Input
                                                inputMode="decimal"
                                                className="text-right"
                                                value={String(l.discount)}
                                                disabled={locked}
                                                aria-invalid={!!cell(i, 'discount')}
                                                onChange={(e) => patch(i, { discount: num(e.target.value) })}
                                            />
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
                                    <td className="px-2 py-2 text-right tabular-nums">{fmt.money(a.net)}</td>
                                    <td className="px-1 py-1.5">
                                        {!locked && (
                                            <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)} aria-label={t('common.delete', { defaultValue: 'Eliminar' })}>
                                                <Trash2 className="size-4" />
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                        {value.length === 0 && (
                            <tr>
                                <td colSpan={99} className="px-3 py-6 text-center text-muted-foreground">
                                    {t('lineItems.empty', { defaultValue: 'Aún no hay renglones. Agrega un producto o un renglón libre.' })}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {validation.form && value.length > 0 && <p role="alert" className="text-sm text-destructive">{validation.form}</p>}

            <div className="flex flex-wrap items-start justify-between gap-3">
                {!locked ? (
                    <div className="flex flex-wrap gap-2">
                        {onRequestProduct && (
                            <Button type="button" size="sm" variant="outline" onClick={onRequestProduct}>
                                <Plus className="mr-1 size-4" />
                                {t('lineItems.addProduct', { defaultValue: 'Agregar producto' })}
                            </Button>
                        )}
                        <Button type="button" size="sm" variant="outline" onClick={() => emit([...value, makeLine()])}>
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
                    {totals.tax > 0 && <div className="flex justify-between gap-6"><dt className="text-muted-foreground">{t('lineItems.taxTotal', { defaultValue: 'Impuestos' })}</dt><dd>{fmt.money(totals.tax)}</dd></div>}
                    <div className="flex justify-between gap-6 font-semibold"><dt>{t('lineItems.total', { defaultValue: 'Total' })}</dt><dd>{fmt.money(totals.total)}</dd></div>
                </dl>
            </div>
        </div>
    )
}
