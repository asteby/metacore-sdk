// PaymentAllocator — UI del reparto de un pago entre los documentos abiertos de
// la contraparte (cobro multi-factura / REP, CxP «Aplicar pago»). Las reglas
// son las de primitives/allocation (allocatePayment / validateAllocation); aquí
// solo se pintan y se editan. Por defecto reparte solo, del más vencido al más
// reciente; al teclear un monto pasa a manual sin perder lo ya repartido.
import { useTranslation } from 'react-i18next'
import { Badge, Button } from '@asteby/metacore-ui/primitives'
import { Input } from '@asteby/metacore-ui'
import type { AllocationResult, AllocationStrategy, OpenDocument } from '../primitives/allocation'
import { manualFromAllocations, overdueDays } from './document-editor-model'
import { useFormatter } from './format'

export interface PaymentAllocatorValue {
    strategy: AllocationStrategy
    manual: Record<string, number>
}

export interface PaymentAllocatorProps {
    documents: OpenDocument[]
    /** Resultado de `allocatePayment(amount, documents, value.strategy, value.manual)`. */
    result: AllocationResult
    value: PaymentAllocatorValue
    onChange: (next: PaymentAllocatorValue) => void
    currency?: string
    loading?: boolean
    readOnly?: boolean
    /** Hoy (para los días de atraso; inyectable en tests). */
    today?: Date
}

const num = (s: string): number => (s.trim() === '' ? 0 : Number(s.replace(',', '.')) || 0)

export function PaymentAllocator({ documents, result, value, onChange, currency, loading, readOnly, today }: PaymentAllocatorProps) {
    const { t } = useTranslation()
    const fmt = useFormatter({ currency })
    const byDoc = new Map(result.allocations.map((a) => [a.document_id, a]))

    if (loading) {
        return <p className="text-sm text-muted-foreground">{t('paymentAllocator.loading', { defaultValue: 'Buscando documentos con saldo…' })}</p>
    }
    if (documents.length === 0) {
        return (
            <p className="text-sm text-muted-foreground" data-slot="payment-allocator-empty">
                {t('paymentAllocator.empty', { defaultValue: 'No hay documentos con saldo pendiente.' })}
            </p>
        )
    }

    const setAmount = (id: string, amount: number) =>
        onChange({ strategy: 'manual', manual: { ...manualFromAllocations(result.allocations), [id]: amount } })

    return (
        <div className="space-y-2" data-slot="payment-allocator">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                    {value.strategy === 'manual'
                        ? t('paymentAllocator.manual', { defaultValue: 'Reparto manual' })
                        : t('paymentAllocator.auto', { defaultValue: 'Se aplica primero a lo más vencido' })}
                </span>
                {!readOnly && value.strategy === 'manual' && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ strategy: 'oldest_due_first', manual: {} })}>
                        {t('paymentAllocator.autoapply', { defaultValue: 'Autoaplicar' })}
                    </Button>
                )}
            </div>
            <ul className="divide-y rounded-md border">
                {documents.map((d) => {
                    const a = byDoc.get(d.id)
                    const late = overdueDays(d, today)
                    return (
                        <li key={d.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm" data-document={d.id}>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{d.number}</span>
                                    {late > 0 && (
                                        <Badge variant="secondary">{t('paymentAllocator.overdue', { defaultValue: 'Vencida · {{days}} d', days: late })}</Badge>
                                    )}
                                    {d.payment_method && <span className="text-xs text-muted-foreground">{d.payment_method}</span>}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {t('paymentAllocator.balance', { defaultValue: 'Saldo' })} {fmt.money(d.balance, d.currency)}
                                    {a && a.balance_after > 0 && (
                                        <>
                                            {' · '}
                                            {t('paymentAllocator.installment', { defaultValue: 'Parcialidad {{n}}', n: a.installment })}
                                            {' · '}
                                            {t('paymentAllocator.remaining', { defaultValue: 'Queda' })} {fmt.money(a.balance_after, d.currency)}
                                        </>
                                    )}
                                </div>
                            </div>
                            <Input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.01"
                                aria-label={t('paymentAllocator.apply_to', { defaultValue: 'Aplicar a {{number}}', number: d.number })}
                                className="h-9 w-32 text-right tabular-nums"
                                value={a ? String(a.amount) : ''}
                                placeholder="0.00"
                                disabled={readOnly}
                                onChange={(e) => setAmount(d.id, num(e.target.value))}
                            />
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
