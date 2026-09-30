// Destino de un reembolso (ReturnWizard, cancelación de apartado, anticipos).
// Lógica pura de <RefundDestination>.
import { roundMoney, toAmount } from './format'

export type RefundDestinationKind = 'cash' | 'card' | 'transfer' | 'wallet' | 'store_credit' | 'credit_note'

export interface RefundDestinationOption {
    kind: RefundDestinationKind
    label: string
    /** Tope reembolsable por este destino (p. ej. lo pagado con tarjeta). */
    maxAmount?: number
    /** false → la opción se muestra deshabilitada con `disabledReason`. */
    available?: boolean
    disabledReason?: string
}

export interface RefundAllocation {
    kind: RefundDestinationKind
    amount: number
    /** Referencia del reembolso a tarjeta / folio de NC relacionada. */
    reference?: string
}

/** Catálogo por defecto: el llamador filtra/limita según el documento. */
export const DEFAULT_REFUND_DESTINATIONS: RefundDestinationOption[] = [
    { kind: 'cash', label: 'Efectivo' },
    { kind: 'card', label: 'Tarjeta' },
    { kind: 'transfer', label: 'Transferencia' },
    { kind: 'wallet', label: 'Monedero' },
    { kind: 'store_credit', label: 'Saldo a favor' },
    { kind: 'credit_note', label: 'Nota de crédito (CFDI)' },
]

export interface RefundValidation {
    errors: Record<string, string>
    form?: string
    allocated: number
    remaining: number
    valid: boolean
}

export function validateRefund(
    total: number,
    allocations: RefundAllocation[],
    options: RefundDestinationOption[] = DEFAULT_REFUND_DESTINATIONS,
): RefundValidation {
    const byKind = new Map(options.map((o) => [o.kind, o]))
    const errors: Record<string, string> = {}
    let allocated = 0
    const seen = new Set<string>()
    allocations.forEach((a, i) => {
        const o = byKind.get(a.kind)
        const amt = toAmount(a.amount)
        allocated += amt
        if (!o || o.available === false) errors[`${i}.kind`] = o?.disabledReason ?? 'Destino no disponible'
        if (seen.has(a.kind)) errors[`${i}.kind`] = 'Ese destino ya está en la lista'
        seen.add(a.kind)
        if (amt <= 0) errors[`${i}.amount`] = 'Captura un monto mayor a cero'
        else if (o?.maxAmount != null && amt > o.maxAmount) errors[`${i}.amount`] = `El máximo para ${o.label} es ${o.maxAmount}`
    })
    allocated = roundMoney(allocated)
    const remaining = roundMoney(total - allocated)
    let form: string | undefined
    if (allocations.length === 0) form = 'Elige a dónde se devuelve el dinero'
    else if (remaining !== 0) form = remaining > 0 ? 'Falta asignar parte del reembolso' : 'La suma excede el monto a reembolsar'
    return { errors, form, allocated, remaining, valid: !form && Object.keys(errors).length === 0 }
}

/** Un solo destino cubriendo todo el monto (caso común). */
export function singleDestination(kind: RefundDestinationKind, total: number): RefundAllocation[] {
    return [{ kind, amount: roundMoney(total) }]
}
