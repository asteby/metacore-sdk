// RefundDestination — a dónde regresa el dinero: efectivo, tarjeta, monedero,
// saldo a favor o NC CFDI (benchmark §7, POS-3/DEV-*).
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Input } from '@asteby/metacore-ui'
import { useFormatter, roundMoney } from './format'
import {
    DEFAULT_REFUND_DESTINATIONS,
    singleDestination,
    validateRefund,
    type RefundAllocation,
    type RefundDestinationKind,
    type RefundDestinationOption,
    type RefundValidation,
} from './refund'

export interface RefundDestinationProps {
    /** Monto total a reembolsar. */
    total: number
    value: RefundAllocation[]
    onChange: (allocations: RefundAllocation[]) => void
    /** Destinos ofrecidos (default: los cinco). Filtra/limita según el documento. */
    options?: RefundDestinationOption[]
    /** Emite la validación tras cada cambio (para bloquear «Confirmar»). */
    onValidate?: (v: RefundValidation) => void
    /** Errores del servidor `"<índice>.<campo>"`. */
    serverErrors?: Record<string, string>
    /** Permite repartir entre varios destinos. Default false (un solo destino). */
    allowSplit?: boolean
    currency?: string
    disabled?: boolean
}

export function RefundDestination({
    total,
    value,
    onChange,
    options = DEFAULT_REFUND_DESTINATIONS,
    onValidate,
    serverErrors,
    allowSplit = false,
    currency,
    disabled,
}: RefundDestinationProps) {
    const { t } = useTranslation()
    const fmt = useFormatter({ currency })
    const validation = useMemo(() => validateRefund(total, value, options), [total, value, options])
    const errors = { ...validation.errors, ...serverErrors }
    const chosen = (k: RefundDestinationKind) => value.some((a) => a.kind === k)

    const emit = (next: RefundAllocation[]) => {
        onChange(next)
        onValidate?.(validateRefund(total, next, options))
    }
    const toggle = (o: RefundDestinationOption) => {
        if (!allowSplit) return emit(singleDestination(o.kind, total))
        if (chosen(o.kind)) return emit(value.filter((a) => a.kind !== o.kind))
        emit([...value, { kind: o.kind, amount: Math.max(0, roundMoney(total - validation.allocated)) }])
    }

    return (
        <div data-slot="refund-destination" className="space-y-2">
            <p className="text-sm text-muted-foreground">
                {t('refund.amount', { defaultValue: 'Monto a reembolsar' })}: <span className="font-semibold text-foreground">{fmt.money(total)}</span>
            </p>
            <div role={allowSplit ? 'group' : 'radiogroup'} className="grid gap-2 sm:grid-cols-2">
                {options.map((o) => {
                    const off = o.available === false
                    const on = chosen(o.kind)
                    return (
                        <Button
                            key={o.kind}
                            type="button"
                            variant={on ? 'default' : 'outline'}
                            role={allowSplit ? 'checkbox' : 'radio'}
                            aria-checked={on}
                            disabled={disabled || off}
                            title={off ? o.disabledReason : undefined}
                            className="h-auto justify-start whitespace-normal py-2 text-left"
                            onClick={() => toggle(o)}
                        >
                            <span>
                                <span className="block">{o.label}</span>
                                {off && o.disabledReason && <span className="block text-xs opacity-70">{o.disabledReason}</span>}
                                {!off && o.maxAmount != null && <span className="block text-xs opacity-70">{t('refund.max', { defaultValue: 'Máx.' })} {fmt.money(o.maxAmount)}</span>}
                            </span>
                        </Button>
                    )
                })}
            </div>

            {value.map((a, i) => (
                <div key={a.kind} className="grid grid-cols-[1fr_8rem_10rem] items-start gap-2">
                    <span className="pt-2 text-sm">{options.find((o) => o.kind === a.kind)?.label ?? a.kind}</span>
                    <div>
                        <Input
                            inputMode="decimal"
                            className="text-right"
                            value={String(a.amount)}
                            disabled={disabled || !allowSplit}
                            aria-invalid={!!errors[`${i}.amount`]}
                            onChange={(e) => emit(value.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value.replace(',', '.')) || 0 } : x)))}
                        />
                        {errors[`${i}.amount`] && <p className="mt-0.5 text-xs text-destructive">{errors[`${i}.amount`]}</p>}
                    </div>
                    {(a.kind === 'card' || a.kind === 'credit_note') && (
                        <Input
                            placeholder={a.kind === 'card' ? t('refund.cardRef', { defaultValue: 'Referencia' }) : t('refund.ncRef', { defaultValue: 'Folio / UUID relacionado' })}
                            value={a.reference ?? ''}
                            disabled={disabled}
                            onChange={(e) => emit(value.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))}
                        />
                    )}
                    {errors[`${i}.kind`] && <p className="col-span-3 text-xs text-destructive">{errors[`${i}.kind`]}</p>}
                </div>
            ))}

            {validation.form && value.length > 0 && <p role="alert" className="text-sm text-destructive">{validation.form}</p>}
        </div>
    )
}
