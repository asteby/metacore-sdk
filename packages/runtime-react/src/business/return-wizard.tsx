// ReturnWizard («Devolver mercancía») — un solo componente para POS, Pedido,
// Factura, RMA y OT (benchmark §7, DEV-2). No conoce endpoints: recibe los
// renglones devolvibles y entrega un payload por `onSubmit`.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@asteby/metacore-ui'
import { useFormatter } from './format'
import { RefundDestination } from './refund-destination'
import {
    DEFAULT_REFUND_DESTINATIONS,
    type RefundAllocation,
    type RefundDestinationOption,
} from './refund'
import {
    RETURN_CONDITION_DESTINATIONS,
    computeReturnTotals,
    creditNoteRelation,
    defaultStockDestination,
    returnSteps,
    returnableQty,
    serializeReturn,
    validateReturnChoices,
    validateReturnRefund,
    type ReturnChoices,
    type ReturnCondition,
    type ReturnStep,
    type ReturnStockDestination,
    type ReturnSubmitPayload,
    type ReturnableLine,
} from './return'

export interface ReturnWizardProps {
    lines: ReturnableLine[]
    /** ¿Hay un addon de almacén que confirma la recepción? Sin él, «Recibir» es un paso. */
    warehouseConnected?: boolean
    /** La venta está facturada: habilita la NC CFDI con relación 01/03 automática. */
    invoiced?: boolean
    /** Destinos de reembolso; `credit_note` se deshabilita solo si no está facturada. */
    refundOptions?: RefundDestinationOption[]
    reasons?: { value: string; label: string }[]
    currency?: string
    submitting?: boolean
    /** Errores del servidor (`"<key>.<campo>"`). */
    serverErrors?: Record<string, string>
    onSubmit: (payload: ReturnSubmitPayload) => void | Promise<void>
    onCancel?: () => void
}

const DEFAULT_REASONS = [
    { value: 'not_wanted', label: 'No lo quiso' },
    { value: 'defective', label: 'Defectuoso' },
    { value: 'wrong_item', label: 'Producto equivocado' },
    { value: 'warranty', label: 'Garantía' },
]

const STOCK_LABEL: Record<ReturnStockDestination, string> = { stock: 'Regresa a stock', scrap: 'Merma', warranty: 'Garantía con proveedor' }
const STEP_LABEL: Record<ReturnStep, string> = { lines: 'Renglones', condition: 'Condición', receive: 'Recibir', refund: 'Reembolso' }

export function ReturnWizard({
    lines,
    warehouseConnected = false,
    invoiced = false,
    refundOptions = DEFAULT_REFUND_DESTINATIONS,
    reasons = DEFAULT_REASONS,
    currency,
    submitting,
    serverErrors,
    onSubmit,
    onCancel,
}: ReturnWizardProps) {
    const { t } = useTranslation()
    const fmt = useFormatter({ currency })
    const steps = useMemo(() => returnSteps({ warehouseConnected }), [warehouseConnected])
    const [stepIdx, setStepIdx] = useState(0)
    const [choices, setChoices] = useState<ReturnChoices>({})
    const [reason, setReason] = useState('')
    const [notes, setNotes] = useState('')
    const [received, setReceived] = useState(false)
    const [refund, setRefund] = useState<RefundAllocation[]>([])

    const step = steps[stepIdx]
    const totals = useMemo(() => computeReturnTotals(lines, choices), [lines, choices])
    const validation = useMemo(() => validateReturnChoices(lines, choices, reason), [lines, choices, reason])
    const relation = useMemo(() => creditNoteRelation(lines, choices), [lines, choices])
    const options = useMemo(
        () =>
            refundOptions.map((o) =>
                o.kind === 'credit_note' && !invoiced
                    ? { ...o, available: false, disabledReason: 'La venta no está facturada' }
                    : o.kind === 'credit_note'
                      ? { ...o, label: `${o.label} · relación ${relation}` }
                      : o,
            ),
        [refundOptions, invoiced, relation],
    )
    const refundValidation = useMemo(() => validateReturnRefund(totals.total, refund, options), [totals.total, refund, options])
    const errors = { ...validation.errors, ...serverErrors }

    const setChoice = (key: string, patch: Partial<ReturnChoices[string]>) =>
        setChoices((prev) => {
            const cur = prev[key] ?? { quantity: 0, condition: 'sellable' as ReturnCondition, destination: 'stock' as ReturnStockDestination }
            const next = { ...cur, ...patch }
            if (patch.condition && !patch.destination) next.destination = defaultStockDestination(patch.condition)
            return { ...prev, [key]: next }
        })

    const canNext =
        step === 'lines' ? validation.valid
        : step === 'condition' ? validation.valid
        : step === 'receive' ? received
        : refundValidation.valid

    const submit = () =>
        onSubmit(serializeReturn({ lines, choices, reason, notes, received: warehouseConnected ? false : received, refund }))

    return (
        <div data-slot="return-wizard" className="space-y-4">
            <ol className="flex flex-wrap gap-2 text-xs">
                {steps.map((s, i) => (
                    <li key={s} aria-current={i === stepIdx ? 'step' : undefined} className={i === stepIdx ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                        {i + 1}. {t(`returns.step.${s}`, { defaultValue: STEP_LABEL[s] })}
                    </li>
                ))}
                {warehouseConnected && (
                    <li className="text-muted-foreground">{t('returns.step.warehouse', { defaultValue: 'Almacén confirma la recepción' })}</li>
                )}
            </ol>

            {(step === 'lines' || step === 'condition') && (
                <div className="space-y-2">
                    {lines.map((l) => {
                        const c = choices[l.key]
                        const max = returnableQty(l)
                        return (
                            <div key={l.key} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_6rem_auto]">
                                <div>
                                    <p className="text-sm font-medium">{l.description}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {t('returns.sold', { defaultValue: 'Vendido' })}: {l.sold} · {t('returns.returnable', { defaultValue: 'Por devolver' })}: {max} · {fmt.money(l.unit_price)}
                                    </p>
                                </div>
                                {step === 'lines' ? (
                                    <div>
                                        <Input
                                            inputMode="decimal"
                                            className="text-right"
                                            aria-label={l.description}
                                            disabled={max === 0}
                                            value={c ? String(c.quantity) : ''}
                                            placeholder="0"
                                            onChange={(e) => setChoice(l.key, { quantity: Number(e.target.value.replace(',', '.')) || 0 })}
                                        />
                                        {errors[`${l.key}.quantity`] && <p className="mt-0.5 text-xs text-destructive">{errors[`${l.key}.quantity`]}</p>}
                                    </div>
                                ) : (
                                    (c?.quantity ?? 0) > 0 && (
                                        <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                                            {(['sellable', 'defective'] as ReturnCondition[]).map((cond) => (
                                                <Button key={cond} type="button" size="sm" variant={c!.condition === cond ? 'default' : 'outline'} onClick={() => setChoice(l.key, { condition: cond })}>
                                                    {cond === 'sellable' ? t('returns.sellable', { defaultValue: 'Vendible' }) : t('returns.defective', { defaultValue: 'Defectuoso' })}
                                                </Button>
                                            ))}
                                            {RETURN_CONDITION_DESTINATIONS[c!.condition].length > 1 &&
                                                RETURN_CONDITION_DESTINATIONS[c!.condition].map((d) => (
                                                    <Button key={d} type="button" size="sm" variant={c!.destination === d ? 'secondary' : 'ghost'} onClick={() => setChoice(l.key, { destination: d })}>
                                                        {STOCK_LABEL[d]}
                                                    </Button>
                                                ))}
                                            {RETURN_CONDITION_DESTINATIONS[c!.condition].length === 1 && (
                                                <span className="text-xs text-muted-foreground">{STOCK_LABEL[c!.destination]}</span>
                                            )}
                                            {errors[`${l.key}.destination`] && <p className="w-full text-xs text-destructive">{errors[`${l.key}.destination`]}</p>}
                                        </div>
                                    )
                                )}
                            </div>
                        )
                    })}
                    {step === 'lines' && (
                        <div className="grid gap-2 sm:grid-cols-2">
                            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('returns.reason', { defaultValue: 'Motivo' })}>
                                <option value="">{t('returns.reason', { defaultValue: 'Motivo' })}…</option>
                                {reasons.map((r) => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                            </select>
                            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('returns.notes', { defaultValue: 'Notas (opcional)' })} />
                        </div>
                    )}
                    {validation.form && stepIdx === 0 && Object.keys(choices).length > 0 && <p role="alert" className="text-sm text-destructive">{validation.form}</p>}
                </div>
            )}

            {step === 'receive' && (
                <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
                    <input type="checkbox" className="mt-1" checked={received} onChange={(e) => setReceived(e.target.checked)} />
                    <span>{t('returns.receiveHere', { defaultValue: 'Confirmo que la mercancía ya está en tienda. No hay almacén que la reciba, así que la recepción se registra aquí.' })}</span>
                </label>
            )}

            {step === 'refund' && (
                <RefundDestination total={totals.total} value={refund} onChange={setRefund} options={options} currency={currency} allowSplit serverErrors={serverErrors} />
            )}

            <div className="flex items-center justify-between gap-2 border-t pt-3">
                <span className="text-sm">
                    {t('returns.total', { defaultValue: 'Total a devolver' })}: <strong>{fmt.money(totals.total)}</strong>
                </span>
                <div className="flex gap-2">
                    {onCancel && stepIdx === 0 && <Button type="button" variant="outline" onClick={onCancel}>{t('common.cancel', { defaultValue: 'Cancelar' })}</Button>}
                    {stepIdx > 0 && <Button type="button" variant="outline" onClick={() => setStepIdx(stepIdx - 1)}>{t('common.back', { defaultValue: 'Atrás' })}</Button>}
                    {stepIdx < steps.length - 1 ? (
                        <Button type="button" disabled={!canNext} onClick={() => setStepIdx(stepIdx + 1)}>{t('common.next', { defaultValue: 'Siguiente' })}</Button>
                    ) : (
                        <Button type="button" disabled={!canNext || submitting} onClick={submit}>
                            {t('returns.confirm', { defaultValue: 'Confirmar devolución' })} {fmt.money(totals.total)}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}
