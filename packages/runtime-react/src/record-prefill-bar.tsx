// RecordPrefillBar — pinta los ayudantes de captura (record-prefill-registry de
// @asteby/metacore-sdk) arriba del formulario genérico de un modelo.
//
// El formulario no conoce a los addons: sólo pregunta "¿quién aporta prefill
// para <model> en <mode>?". Hoy: fiscal_mexico → «Cargar constancia» en
// Customer/Supplier. Mañana: un vertical restaurante aporta «Importar menú» en
// Product, un vertical ferretería «Leer código de proveedor», etc.
//
// Seguridad del patch: sólo se aplican claves que el formulario declara
// (allowedKeys) — un addon no puede inyectar columnas ocultas (organization_id,
// created_by…) por esta vía; el backend sigue validando como siempre.
import { useCallback, useSyncExternalStore } from 'react'
import {
    getRecordPrefills,
    recordPrefillsVersion,
    subscribeRecordPrefills,
    type RecordFormMode,
} from '@asteby/metacore-sdk'
import { useCan } from './permissions-context'

export interface RecordPrefillBarProps {
    model: string
    mode: RecordFormMode
    recordId?: string | null
    values: Record<string, any>
    allowedKeys: ReadonlySet<string>
    onApply: (patch: Record<string, any>) => void
}

export function RecordPrefillBar({ model, mode, recordId, values, allowedKeys, onApply }: RecordPrefillBarProps) {
    // Re-render cuando un remote registra/des-registra (carga tardía o unbind).
    useSyncExternalStore(subscribeRecordPrefills, recordPrefillsVersion, recordPrefillsVersion)
    const can = useCan()
    const items = getRecordPrefills(model, mode).filter(c => !c.permission || can(c.permission))

    const applyValues = useCallback(
        (patch: Record<string, unknown>) => {
            const safe: Record<string, any> = {}
            for (const [k, v] of Object.entries(patch ?? {})) {
                if (allowedKeys.has(k)) safe[k] = v
            }
            if (Object.keys(safe).length > 0) onApply(safe)
        },
        [allowedKeys, onApply],
    )

    if (items.length === 0) return null
    return (
        <div className="flex flex-wrap items-center gap-2" data-aby-record-prefill="">
            {items.map(({ id, component: C }) => (
                <C
                    key={id}
                    model={model}
                    mode={mode}
                    recordId={recordId ?? undefined}
                    values={values}
                    applyValues={applyValues}
                />
            ))}
        </div>
    )
}
