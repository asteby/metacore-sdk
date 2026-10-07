// VehiclePicker + alta rápida — busca por placa o VIN (y marca/modelo/cliente que
// el host decida indexar). Configuración del <RecordPicker> compartido: el alta
// rápida (y la edición del elegido) reutiliza el <CreateRecordDialog> dinámico
// del modelo vehículo. Mismo contrato que <CustomerPicker>: controlado
// (`value` / `onChange`), `search` inyectado por el host, permisos con useCan
// (sin <PermissionsProvider> no bloquea nada: el backend autoriza).
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Car } from 'lucide-react'
import { RecordPicker, useLatestSearch } from '../record-picker'
import { useRecordPickerDialog } from '../record-picker-dialog'
import { useCan } from '../permissions-context'

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
    /** Búsqueda por placa o VIN. */
    search: (q: string, signal: AbortSignal) => Promise<VehicleResult[]>
    /** Modelo del kernel para el alta rápida. Default `Vehicle`. */
    model?: string
    /** Endpoint CRUD del alta. Default `/data/<model>/me`. */
    endpoint?: string
    /** Convierte el registro guardado a `VehicleResult`. Default: id, placa, VIN, marca, modelo, año. */
    mapRecord?: (rec: Record<string, unknown>) => VehicleResult
    /** Override de permiso (default `<model>.create` con useCan). */
    canCreate?: boolean
    /** Override de permiso para editar al elegido (default `<model>.update`). */
    canEdit?: boolean
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

/**
 * @deprecated Configuración fina de {@link RecordPicker}; se conserva para no
 * romper consumidores.
 */
export function VehiclePicker({
    value,
    onChange,
    search,
    model = 'Vehicle',
    endpoint,
    mapRecord,
    canCreate,
    canEdit,
    createDefaults,
    disabled,
    placeholder,
}: VehiclePickerProps) {
    const { t } = useTranslation()
    const can = useCan()
    const [text, setText] = useState('')
    const [open, setOpen] = useState(false)
    const searchFn = useLatestSearch(search)
    const mayCreate = canCreate ?? can(`${snake(model)}.create`)
    const mayEdit = canEdit ?? can(`${snake(model)}.update`)

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
    const { openCreate, openEdit, dialog } = useRecordPickerDialog({
        model,
        endpoint,
        prefillField: 'plate',
        createDefaults,
        onSaved: (rec, kind) => {
            const next = toResult(rec)
            onChange(kind === 'edit' && value ? { ...value, ...next } : next)
            setText('')
        },
    })

    return (
        <>
            <RecordPicker<VehicleResult>
                trigger="input"
                slot="vehicle-picker"
                search={searchFn}
                minChars={2}
                query={text}
                onQueryChange={setText}
                open={open}
                onOpenChange={setOpen}
                getKey={(v) => v.id}
                getLabel={(v) => v.plate || v.vin || v.id}
                getDescription={(v) => [describeVehicle({ ...v, plate: undefined }), v.customer_name].filter(Boolean).join(' · ')}
                value={value?.id ?? null}
                selected={value}
                onSelect={(v) => onChange(v)}
                onClear={disabled ? undefined : () => onChange(null)}
                clearLabel={t('vehiclePicker.clear', { defaultValue: 'Quitar vehículo' })}
                renderValue={(v) =>
                    v ? (
                        <span className="flex min-w-0 items-start gap-2">
                            <Car className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <span className="block min-w-0">
                                <span className="block truncate text-sm font-medium">{v.plate || v.vin || t('vehiclePicker.noPlate', { defaultValue: 'Sin placa' })}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                    {[[v.make, v.model, v.year].filter((x) => x != null && x !== '').join(' '), v.vin && v.plate ? v.vin : '', v.customer_name]
                                        .filter(Boolean)
                                        .join(' · ')}
                                </span>
                            </span>
                        </span>
                    ) : null
                }
                disabled={disabled}
                placeholder={placeholder ?? t('vehiclePicker.placeholder', { defaultValue: 'Placa o VIN' })}
                loadingText={t('common.searching', { defaultValue: 'Buscando…' })}
                errorText={t('vehiclePicker.error', { defaultValue: 'No se pudo buscar vehículos. Inténtalo de nuevo.' })}
                emptyText={t('vehiclePicker.empty', { defaultValue: 'No encontramos ese vehículo' })}
                entityLabel={t('vehiclePicker.entity', { defaultValue: 'vehículo' })}
                createLabel={t('vehiclePicker.create', { defaultValue: 'Nuevo vehículo' })}
                editLabel={t('vehiclePicker.edit', { defaultValue: 'Editar vehículo' })}
                createFooter="empty"
                createFooterLabel={() => t('vehiclePicker.createAction', { defaultValue: 'Crear vehículo' })}
                onCreate={mayCreate ? (q) => openCreate(q) : undefined}
                onEdit={mayEdit && value ? () => openEdit(value.id) : undefined}
            />
            {dialog}
        </>
    )
}
