// PaymentCapture — cobro mixto con cambio, referencia y cuenta (benchmark §7).
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Button, Input } from '@asteby/metacore-ui'
import { useCan } from '../permissions-context'
import { useFormatter } from './format'
import {
    newTender,
    serializePayment,
    summarizePayment,
    validatePayment,
    type PaymentMethodOption,
    type PaymentPolicy,
    type PaymentTender,
} from './payment'

export interface PaymentCaptureProps {
    /** Total a cobrar. */
    total: number
    methods: PaymentMethodOption[]
    value: PaymentTender[]
    onChange: (tenders: PaymentTender[]) => void
    /** Confirmar cobro: recibe el payload ya serializado. Solo se llama si es válido. */
    onSubmit?: (payload: ReturnType<typeof serializePayment>) => void
    policy?: PaymentPolicy
    /** Errores del servidor `"<índice>.<campo>"`. */
    serverErrors?: Record<string, string>
    submitLabel?: string
    submitting?: boolean
    /** Capability requerida para cobrar (p. ej. `pos_orders.pagar`). Sin ella, botón oculto. */
    submitPermission?: string
    currency?: string
    disabled?: boolean
}

export function PaymentCapture({
    total,
    methods,
    value,
    onChange,
    onSubmit,
    policy,
    serverErrors,
    submitLabel,
    submitting,
    submitPermission,
    currency,
    disabled,
}: PaymentCaptureProps) {
    const { t } = useTranslation()
    const can = useCan()
    const fmt = useFormatter({ currency })
    const summary = useMemo(() => summarizePayment(total, value, methods), [total, value, methods])
    const validation = useMemo(() => validatePayment(total, value, methods, policy), [total, value, methods, policy])
    const errors = { ...validation.errors, ...serverErrors }
    const byId = new Map(methods.map((m) => [m.id, m]))
    const mayPay = submitPermission ? can(submitPermission) : true

    const patch = (idx: number, p: Partial<PaymentTender>) =>
        onChange(value.map((x, i) => (i === idx ? { ...x, ...p } : x)))

    return (
        <div data-slot="payment-capture" className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {methods.map((m) => (
                    <Button
                        key={m.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => onChange([...value, newTender(m.id, summary.remaining)])}
                    >
                        {m.label}
                    </Button>
                ))}
            </div>

            {value.map((tender, i) => {
                const m = byId.get(tender.method)
                return (
                    <div key={tender.key} className="grid grid-cols-[1fr_8rem_auto] items-start gap-2 rounded-md border p-2">
                        <div className="space-y-1">
                            <p className="text-sm font-medium">{m?.label ?? tender.method}</p>
                            {m?.requiresReference && (
                                <Input
                                    placeholder={t('payment.reference', { defaultValue: 'Referencia' })}
                                    value={tender.reference ?? ''}
                                    disabled={disabled}
                                    aria-invalid={!!errors[`${i}.reference`]}
                                    onChange={(e) => patch(i, { reference: e.target.value })}
                                />
                            )}
                            {m?.requiresAccount && (
                                <select
                                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                                    value={tender.account_id ?? ''}
                                    disabled={disabled}
                                    onChange={(e) => patch(i, { account_id: e.target.value || undefined })}
                                >
                                    <option value="">{t('payment.account', { defaultValue: 'Cuenta…' })}</option>
                                    {(m.accounts ?? []).map((a) => (
                                        <option key={a.id} value={a.id}>{a.label}</option>
                                    ))}
                                </select>
                            )}
                            {(['reference', 'account_id', 'method'] as const).map(
                                (f) => errors[`${i}.${f}`] && <p key={f} className="text-xs text-destructive">{errors[`${i}.${f}`]}</p>,
                            )}
                        </div>
                        <div>
                            <Input
                                inputMode="decimal"
                                className="text-right"
                                value={String(tender.amount)}
                                disabled={disabled}
                                aria-invalid={!!errors[`${i}.amount`]}
                                onChange={(e) => patch(i, { amount: Number(e.target.value.replace(',', '.')) || 0 })}
                            />
                            {errors[`${i}.amount`] && <p className="mt-0.5 text-xs text-destructive">{errors[`${i}.amount`]}</p>}
                        </div>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            disabled={disabled}
                            aria-label={t('common.delete', { defaultValue: 'Eliminar' })}
                            onClick={() => onChange(value.filter((_, j) => j !== i))}
                        >
                            <Trash2 className="size-4" />
                        </Button>
                    </div>
                )
            })}

            <dl className="space-y-0.5 text-sm tabular-nums">
                <div className="flex justify-between"><dt className="text-muted-foreground">{t('payment.total', { defaultValue: 'Total' })}</dt><dd>{fmt.money(summary.total)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{t('payment.paid', { defaultValue: 'Pagado' })}</dt><dd>{fmt.money(summary.paid)}</dd></div>
                {summary.remaining > 0 && <div className="flex justify-between font-medium"><dt>{t('payment.remaining', { defaultValue: 'Pendiente' })}</dt><dd>{fmt.money(summary.remaining)}</dd></div>}
                {summary.change > 0 && <div className="flex justify-between font-semibold"><dt>{t('payment.change', { defaultValue: 'Cambio' })}</dt><dd>{fmt.money(summary.change)}</dd></div>}
            </dl>

            {validation.form && value.length > 0 && <p role="alert" className="text-sm text-destructive">{validation.form}</p>}

            {onSubmit && mayPay && (
                <Button
                    type="button"
                    className="w-full"
                    disabled={disabled || submitting || !validation.valid}
                    onClick={() => onSubmit(serializePayment(value, methods, total))}
                >
                    {submitLabel ?? t('payment.submit', { defaultValue: 'Cobrar' })}
                </Button>
            )}
        </div>
    )
}
