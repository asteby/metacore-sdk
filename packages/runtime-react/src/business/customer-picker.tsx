// CustomerPicker + alta rápida — busca por nombre, RFC/ID fiscal, teléfono, placa
// o VIN; muestra saldo, crédito y alertas (benchmark §7). El alta rápida reutiliza
// el <CreateRecordDialog> dinámico del modelo (formulario desde metadata).
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Search, X } from 'lucide-react'
import { Badge, Button, Input } from '@asteby/metacore-ui'
import { CreateRecordDialog } from '../dialogs/create-record-dialog'
import { useApi } from '../api-context'
import { useCan } from '../permissions-context'
import { useFormatter } from './format'
import { useAsyncSearch } from './use-async-search'
import { EmptyState } from './feedback'

export interface CustomerResult {
    id: string
    name: string
    /** Identificador fiscal (RFC u homólogo): dato de la org, sin formato hardcodeado. */
    tax_id?: string
    phone?: string
    email?: string
    plate?: string
    vin?: string
    /** Saldo por cobrar (adeudo). */
    balance?: number
    credit_limit?: number
    /** Alertas visibles: «Cliente con adeudo vencido», «Lista negra». */
    alerts?: string[]
}

export interface CustomerPickerProps {
    value: CustomerResult | null
    /** Evento único de cambio: cliente elegido/creado, o `null` al limpiar. */
    onChange: (customer: CustomerResult | null) => void
    /** Búsqueda (nombre, ID fiscal, teléfono, placa, VIN). Estable (useCallback). */
    search: (q: string, signal: AbortSignal) => Promise<CustomerResult[]>
    /** Modelo del kernel para el alta rápida. Default `Customer`. */
    model?: string
    /** Endpoint CRUD del alta. Default `/data/<model>/me`. */
    endpoint?: string
    /** Convierte el registro guardado a `CustomerResult`. Default: id + name. */
    mapRecord?: (rec: Record<string, unknown>) => CustomerResult
    /** Valida el ID fiscal según la config de la org; devuelve el mensaje o undefined. */
    validateTaxId?: (taxId: string) => string | undefined
    /** Overrides de permiso (default `<model>.create` con useCan). */
    canCreate?: boolean
    /** Valores iniciales del alta rápida (p. ej. el texto buscado como nombre). */
    createDefaults?: Record<string, unknown>
    currency?: string
    disabled?: boolean
    placeholder?: string
}

function snake(model: string): string {
    return model.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

export function CustomerPicker({
    value,
    onChange,
    search,
    model = 'Customer',
    endpoint,
    mapRecord,
    validateTaxId,
    canCreate,
    createDefaults,
    currency,
    disabled,
    placeholder,
}: CustomerPickerProps) {
    const { t } = useTranslation()
    const api = useApi()
    const can = useCan()
    const fmt = useFormatter({ currency })
    const [text, setText] = useState('')
    const [creating, setCreating] = useState(false)
    const { results, loading, error } = useAsyncSearch(text, search, { minChars: 2 })
    const mayCreate = canCreate ?? can(`${snake(model)}.create`)
    const base = endpoint ?? `/data/${model}/me`
    const taxIdError = value?.tax_id && validateTaxId ? validateTaxId(value.tax_id) : undefined

    const pick = (c: CustomerResult) => {
        onChange(c)
        setText('')
    }
    const toResult = useCallback(
        (rec: Record<string, unknown>): CustomerResult =>
            mapRecord
                ? mapRecord(rec)
                : {
                      id: String(rec.id ?? ''),
                      name: String(rec.name ?? ''),
                      tax_id: typeof rec.tax_id === 'string' ? rec.tax_id : undefined,
                      phone: typeof rec.phone === 'string' ? rec.phone : undefined,
                  },
        [mapRecord],
    )

    if (value) {
        const overLimit = value.credit_limit != null && (value.balance ?? 0) > value.credit_limit
        return (
            <div data-slot="customer-picker" className="space-y-1 rounded-md border p-2">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="text-sm font-medium">{value.name}</p>
                        <p className="text-xs text-muted-foreground">
                            {[value.tax_id, value.phone, value.plate, value.vin].filter(Boolean).join(' · ')}
                        </p>
                    </div>
                    {!disabled && (
                        <Button type="button" size="icon" variant="ghost" onClick={() => onChange(null)} aria-label={t('customerPicker.clear', { defaultValue: 'Quitar cliente' })}>
                            <X className="size-4" />
                        </Button>
                    )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {value.balance != null && value.balance !== 0 && (
                        <Badge variant={overLimit ? 'danger' : 'warning'}>
                            {t('customerPicker.balance', { defaultValue: 'Adeudo' })} {fmt.money(value.balance)}
                        </Badge>
                    )}
                    {value.credit_limit != null && (
                        <Badge variant="muted">
                            {t('customerPicker.credit', { defaultValue: 'Crédito' })} {fmt.money(value.credit_limit)}
                        </Badge>
                    )}
                    {value.alerts?.map((a) => (
                        <Badge key={a} variant="danger">{a}</Badge>
                    ))}
                </div>
                {taxIdError && <p role="alert" className="text-xs text-destructive">{taxIdError}</p>}
            </div>
        )
    }

    return (
        <div data-slot="customer-picker" className="space-y-2">
            <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
                    <Input
                        className="pl-8"
                        disabled={disabled}
                        value={text}
                        placeholder={placeholder ?? t('customerPicker.placeholder', { defaultValue: 'Nombre, RFC, teléfono, placa o VIN' })}
                        onChange={(e) => setText(e.target.value)}
                    />
                </div>
                {mayCreate && (
                    <Button type="button" variant="outline" size="icon" disabled={disabled} onClick={() => setCreating(true)} aria-label={t('customerPicker.create', { defaultValue: 'Nuevo cliente' })}>
                        <Plus className="size-4" />
                    </Button>
                )}
            </div>
            {loading && <p className="text-sm text-muted-foreground">{t('common.searching', { defaultValue: 'Buscando…' })}</p>}
            {error && !loading && (
                <p role="alert" className="text-sm text-destructive">
                    {t('customerPicker.error', { defaultValue: 'No se pudo buscar clientes. Inténtalo de nuevo.' })}
                </p>
            )}
            {!loading && !error && text.trim().length >= 2 && results.length === 0 && (
                <EmptyState
                    title={t('customerPicker.empty', { defaultValue: 'No encontramos a ese cliente' })}
                    action={mayCreate ? { label: t('customerPicker.createAction', { defaultValue: 'Crear cliente' }), onClick: () => setCreating(true) } : undefined}
                />
            )}
            {results.length > 0 && (
                <ul role="listbox" className="max-h-64 divide-y overflow-auto rounded-md border">
                    {results.map((c) => (
                        <li key={c.id} role="option" aria-selected={false}>
                            <button type="button" className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-accent" onClick={() => pick(c)}>
                                <span>
                                    <span className="block text-sm font-medium">{c.name}</span>
                                    <span className="block text-xs text-muted-foreground">{[c.tax_id, c.phone, c.plate, c.vin].filter(Boolean).join(' · ')}</span>
                                </span>
                                {c.balance != null && c.balance > 0 && <Badge variant="warning">{fmt.money(c.balance)}</Badge>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {creating && (
                <CreateRecordDialog
                    modelKey={model}
                    open={creating}
                    onOpenChange={setCreating}
                    endpoint={base}
                    defaults={createDefaults ?? (text.trim() ? { name: text.trim() } : undefined)}
                    onCreate={async (data) => {
                        const res = await api.post(base, data)
                        const rec = (res.data?.data ?? res.data) as Record<string, unknown>
                        pick(toResult(rec))
                        return rec.id != null ? { id: String(rec.id) } : undefined
                    }}
                />
            )}
        </div>
    )
}
