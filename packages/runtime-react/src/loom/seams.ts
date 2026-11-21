// Catálogo de seams del SDK (contratos versionados). Cada seam documenta sus
// lentes (con clase de datos), lo que acepta como propuesta y sus intenciones.
import type { SeamContract } from './types'

/** Arriba del formulario de DynamicRecordDialog (alta/edición). */
export const RECORD_DIALOG_HEADER = 'record.dialog.header'
/** Debajo de los campos del formulario, antes del pie: contenido (no sólo botones) dentro del modal. */
export const RECORD_FORM_SECTION = 'record.form.section'
export type RecordFormSeam = typeof RECORD_DIALOG_HEADER | typeof RECORD_FORM_SECTION

export interface RecordDialogHeaderLenses {
    /** Modelo del formulario (`Customer`). */
    model: string
    mode: 'create' | 'edit'
    /** Id del registro en edición. */
    recordId?: string
    /** Valores vivos del formulario. Clase `pii`: pueden traer datos personales. */
    values: Record<string, unknown>
    /** Campos del formulario: `{ key, label, type }`. */
    fields: Array<{ key: string; label: string; type?: string }>
}

/**
 * Contrato v1 de `record.dialog.header` y `record.form.section` (mismas lentes y propuestas).
 * `writable` = campos editables que el formulario
 * declara (lo calcula el diálogo). Intenciones:
 *   - `record.select` `{ record }`: usar un registro existente en lugar de crear (p. ej. el
 *     RFC ya existe). Lo atiende quien abrió el diálogo (CustomerPicker la convierte en selección).
 *   - `record.edit` `{ id, patch }`: abrir la edición de otro registro con `patch` como propuesta.
 */
export function recordDialogHeaderContract(
    writable: ReadonlySet<string>,
    id: RecordFormSeam = RECORD_DIALOG_HEADER,
): SeamContract {
    return {
        id,
        version: '1.0.0',
        lenses: { model: 'public', mode: 'public', recordId: 'internal', values: 'pii', fields: 'public' },
        writable,
        intents: ['record.select', 'record.edit'],
    }
}
