// CustomerPicker + alta rápida — busca por nombre, RFC/ID fiscal, teléfono, placa
// o VIN; muestra saldo, crédito y alertas (benchmark §7). Configuración del
// <RecordPicker> compartido: el alta rápida (y la edición del elegido) reutiliza
// el <CreateRecordDialog> dinámico del modelo (formulario desde metadata).
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@asteby/metacore-ui'
import { RecordPicker, useLatestSearch } from '../record-picker'
import { useRecordPickerDialog } from '../record-picker-dialog'
import { useCan } from '../permissions-context'
import { useFormatter } from './format'

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
    /** Búsqueda (nombre, ID fiscal, teléfono, placa, VIN). */
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
    /** Override de permiso para editar al elegido (default `<model>.update`). */
    canEdit?: boolean
    /** Valores iniciales del alta rápida (p. ej. el texto buscado como nombre). */
    createDefaults?: Record<string, unknown>
    currency?: string
    disabled?: boolean
    placeholder?: string
}

function snake(model: string): string {
    return model.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

const customerLine = (c: CustomerResult) => [c.tax_id, c.phone, c.plate, c.vin].filter(Boolean).join(' · ')

/**
 * @deprecated Configuración fina de {@link RecordPicker}; se conserva para no
 * romper consumidores.
 */
export function CustomerPicker({
    value,
    onChange,
    search,
    model = 'Customer',
    endpoint,
    mapRecord,
    validateTaxId,
    canCreate,
    canEdit,
    createDefaults,
    currency,
    disabled,
    placeholder,
}: CustomerPickerProps) {
    const { t } = useTranslation()
    const can = useCan()
    const fmt = useFormatter({ currency })
    const [text, setText] = useState('')
    const [open, setOpen] = useState(false)
    const searchFn = useLatestSearch(search)
    const mayCreate = canCreate ?? can(`${snake(model)}.create`)
    const mayEdit = canEdit ?? can(`${snake(model)}.update`)
    const taxIdError = value?.tax_id && validateTaxId ? validateTaxId(value.tax_id) : undefined

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
    const { openCreate, openEdit, dialog } = useRecordPickerDialog({
        model,
        endpoint,
        prefillField: 'name',
        createDefaults,
        onSaved: (rec, kind) => {
            const next = toResult(rec)
            // Al editar se conservan saldo/crédito/alertas que el registro no trae.
            onChange(kind === 'edit' && value ? { ...value, ...next } : next)
            setText('')
        },
    })

    const overLimit = !!value && value.credit_limit != null && (value.balance ?? 0) > value.credit_limit
    const below = value ? (
        <>
            {(value.balance != null && value.balance !== 0) || value.credit_limit != null || value.alerts?.length ? (
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
            ) : null}
            {taxIdError && <p role="alert" className="text-xs text-destructive">{taxIdError}</p>}
        </>
    ) : null

    return (
        <>
            <RecordPicker<CustomerResult>
                trigger="input"
                slot="customer-picker"
                search={searchFn}
                minChars={2}
                query={text}
                onQueryChange={setText}
                open={open}
                onOpenChange={setOpen}
                getKey={(c) => c.id}
                getLabel={(c) => c.name}
                renderItem={(c) => (
                    <span className="flex w-full min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0">
                            <span className="block truncate font-medium">{c.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{customerLine(c)}</span>
                        </span>
                        {c.balance != null && c.balance > 0 && <Badge variant="warning">{fmt.money(c.balance)}</Badge>}
                    </span>
                )}
                value={value?.id ?? null}
                selected={value}
                onSelect={(c) => onChange(c)}
                onClear={disabled ? undefined : () => onChange(null)}
                clearLabel={t('customerPicker.clear', { defaultValue: 'Quitar cliente' })}
                renderValue={(c) =>
                    c ? (
                        <span className="block min-w-0">
                            <span className="block truncate text-sm font-medium">{c.name}</span>
                            {customerLine(c) && <span className="block truncate text-xs text-muted-foreground">{customerLine(c)}</span>}
                        </span>
                    ) : null
                }
                below={below}
                disabled={disabled}
                placeholder={placeholder ?? t('customerPicker.placeholder', { defaultValue: 'Nombre, RFC, teléfono, placa o VIN' })}
                loadingText={t('common.searching', { defaultValue: 'Buscando…' })}
                errorText={t('customerPicker.error', { defaultValue: 'No se pudo buscar clientes. Inténtalo de nuevo.' })}
                emptyText={t('customerPicker.empty', { defaultValue: 'No encontramos a ese cliente' })}
                entityLabel={t('customerPicker.entity', { defaultValue: 'cliente' })}
                createLabel={t('customerPicker.create', { defaultValue: 'Nuevo cliente' })}
                editLabel={t('customerPicker.edit', { defaultValue: 'Editar cliente' })}
                createFooter="empty"
                createFooterLabel={() => t('customerPicker.createAction', { defaultValue: 'Crear cliente' })}
                onCreate={mayCreate ? (q) => openCreate(q) : undefined}
                onEdit={mayEdit && value ? () => openEdit(value.id) : undefined}
            />
            {dialog}
        </>
    )
}
