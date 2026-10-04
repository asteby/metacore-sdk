// VehiclePicker + alta rápida — busca por placa o VIN (y marca/modelo/cliente que
// el host decida indexar) y reutiliza el <CreateRecordDialog> dinámico del modelo
// vehículo para el alta rápida. Mismo contrato que <CustomerPicker>: controlado
// (`value` / `onChange`), `search` inyectado por el host, permisos con useCan
// (sin <PermissionsProvider> no bloquea nada: el backend autoriza).
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Car, Plus, Search, X } from 'lucide-react'
import { Button, Input } from '@asteby/metacore-ui'
import { CreateRecordDialog } from '../dialogs/create-record-dialog'
import { useApi } from '../api-context'
import { useCan } from '../permissions-context'
import { useAsyncSearch } from './use-async-search'
import { EmptyState } from './feedback'

export interface VehicleResult {
    id: string
    /** Placa tal como la capturó el taller (sin formato hardcodeado por país). */
    plate?: string
    vin?: string
    make?: string
    model?: string
    year?: number | string
    color?: string
    /** Propietario, cuando el host lo expone. */
    customer_id?: string
    customer_name?: string
}

export interface VehiclePickerProps {
    value: VehicleResult | null
    /** Evento único de cambio: vehículo elegido/creado, o `null` al limpiar. */
    onChange: (vehicle: VehicleResult | null) => void
    /** Búsqueda por placa o VIN. Estable (useCallback). */
    search: (q: string, signal: AbortSignal) => Promise<VehicleResult[]>
    /** Modelo del kernel para el alta rápida. Default `Vehicle`. */
    model?: string
    /** Endpoint CRUD del alta. Default `/data/<model>/me`. */
    endpoint?: string
    /** Convierte el registro guardado a `VehicleResult`. Default: id, placa, VIN, marca, modelo, año. */
    mapRecord?: (rec: Record<string, unknown>) => VehicleResult
    /** Override de permiso (default `<model>.create` con useCan). */
    canCreate?: boolean
    /** Valores iniciales del alta (p. ej. `customer_id` del cliente ya elegido). */
    createDefaults?: Record<string, unknown>
    disabled?: boolean
    placeholder?: string
}

function snake(model: string): string {
    return model.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/** Línea corta de un vehículo: «Nissan Versa 2019 · ABC-123 · VIN…». */
export function describeVehicle(v: VehicleResult): string {
    const unit = [v.make, v.model, v.year].filter((x) => x != null && x !== '').join(' ')
    return [unit, v.plate, v.vin].filter(Boolean).join(' · ')
}

export function VehiclePicker({
    value,
    onChange,
    search,
    model = 'Vehicle',
    endpoint,
    mapRecord,
    canCreate,
    createDefaults,
    disabled,
    placeholder,
}: VehiclePickerProps) {
    const { t } = useTranslation()
    const api = useApi()
    const can = useCan()
    const [text, setText] = useState('')
    const [creating, setCreating] = useState(false)
    const { results, loading, error } = useAsyncSearch(text, search, { minChars: 2 })
    const mayCreate = canCreate ?? can(`${snake(model)}.create`)
    const base = endpoint ?? `/data/${model}/me`

    const pick = (v: VehicleResult) => {
        onChange(v)
        setText('')
    }
    const toResult = useCallback(
        (rec: Record<string, unknown>): VehicleResult =>
            mapRecord
                ? mapRecord(rec)
                : {
                      id: String(rec.id ?? ''),
                      plate: str(rec.plate),
                      vin: str(rec.vin),
                      make: str(rec.make),
                      model: str(rec.model),
                      year: typeof rec.year === 'number' || typeof rec.year === 'string' ? rec.year : undefined,
                      color: str(rec.color),
                      customer_id: str(rec.customer_id),
                  },
        [mapRecord],
    )

    if (value) {
        return (
            <div data-slot="vehicle-picker" className="flex items-start justify-between gap-2 rounded-md border p-2">
                <div className="flex items-start gap-2">
                    <Car className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
                    <div>
                        <p className="text-sm font-medium">{value.plate || value.vin || t('vehiclePicker.noPlate', { defaultValue: 'Sin placa' })}</p>
                        <p className="text-xs text-muted-foreground">
                            {[[value.make, value.model, value.year].filter((x) => x != null && x !== '').join(' '), value.vin && value.plate ? value.vin : '', value.customer_name]
                                .filter(Boolean)
                                .join(' · ')}
                        </p>
                    </div>
                </div>
                {!disabled && (
                    <Button type="button" size="icon" variant="ghost" onClick={() => onChange(null)} aria-label={t('vehiclePicker.clear', { defaultValue: 'Quitar vehículo' })}>
                        <X className="size-4" />
                    </Button>
                )}
            </div>
        )
    }

    return (
        <div data-slot="vehicle-picker" className="space-y-2">
            <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
                    <Input
                        className="pl-8"
                        disabled={disabled}
                        value={text}
                        placeholder={placeholder ?? t('vehiclePicker.placeholder', { defaultValue: 'Placa o VIN' })}
                        onChange={(e) => setText(e.target.value)}
                    />
                </div>
                {mayCreate && (
                    <Button type="button" variant="outline" size="icon" disabled={disabled} onClick={() => setCreating(true)} aria-label={t('vehiclePicker.create', { defaultValue: 'Nuevo vehículo' })}>
                        <Plus className="size-4" />
                    </Button>
                )}
            </div>
            {loading && <p className="text-sm text-muted-foreground">{t('common.searching', { defaultValue: 'Buscando…' })}</p>}
            {error && !loading && (
                <p role="alert" className="text-sm text-destructive">
                    {t('vehiclePicker.error', { defaultValue: 'No se pudo buscar vehículos. Inténtalo de nuevo.' })}
                </p>
            )}
            {!loading && !error && text.trim().length >= 2 && results.length === 0 && (
                <EmptyState
                    title={t('vehiclePicker.empty', { defaultValue: 'No encontramos ese vehículo' })}
                    action={mayCreate ? { label: t('vehiclePicker.createAction', { defaultValue: 'Crear vehículo' }), onClick: () => setCreating(true) } : undefined}
                />
            )}
            {results.length > 0 && (
                <ul role="listbox" className="max-h-64 divide-y overflow-auto rounded-md border">
                    {results.map((v) => (
                        <li key={v.id} role="option" aria-selected={false}>
                            <button type="button" className="flex w-full flex-col px-2 py-1.5 text-left hover:bg-accent" onClick={() => pick(v)}>
                                <span className="text-sm font-medium">{v.plate || v.vin || v.id}</span>
                                <span className="text-xs text-muted-foreground">{[describeVehicle({ ...v, plate: undefined }), v.customer_name].filter(Boolean).join(' · ')}</span>
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
                    defaults={createDefaults ?? (text.trim() ? { plate: text.trim() } : undefined)}
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
