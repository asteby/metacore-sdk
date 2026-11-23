// Núcleo genérico de «filas borrador»: filas capturadas en el cliente que aún
// no existen en el servidor. Lo comparten el editor de renglones de documento
// (`business/line-items.ts`: claves de UI) y las relaciones hijas capturadas
// al crear (`dialogs/inline-relation-rows.tsx`). Puro y sin React.
//
// Convenciones compartidas:
//   - Clave de UI estable por fila (`key`), nunca se envía al backend.
//   - Errores por celda con la ruta `"<índice>.<campo>"` (mismo formato que
//     `validateLineItems` y `lineItemErrorsFor`).

export interface DraftRow {
    /** Clave estable de UI (sobrevive a reordenar/quitar); no se envía. */
    key: string
    values: Record<string, any>
    /**
     * Id de una fila YA guardada (editar el padre). Viaja en `_children` como `id` para que el
     * servidor la actualice; una fila sin `id` es nueva. Un widget que reemplaza filas debe
     * conservarlo (`{ ...row, values }`); quitar una fila existente del arreglo la borra.
     */
    id?: string | number
}

let seq = 0
/** Clave de UI única en el proceso. `prefix` solo ayuda a depurar. */
export function newDraftKey(prefix = 'row'): string {
    seq += 1
    return `${prefix}_${Date.now().toString(36)}_${seq}`
}

export function makeDraftRow(values: Record<string, any> = {}, key?: string, id?: string | number): DraftRow {
    const row: DraftRow = { key: key ?? newDraftKey(), values }
    if (id !== undefined && id !== null && id !== '') row.id = id
    return row
}

/** Agrega al final (orden de captura = orden de envío). */
export function appendDraftRow(rows: DraftRow[], row: DraftRow): DraftRow[] {
    return [...rows, row]
}

export function removeDraftRow(rows: DraftRow[], key: string): DraftRow[] {
    return rows.filter((r) => r.key !== key)
}

export function updateDraftCell(rows: DraftRow[], key: string, field: string, value: unknown): DraftRow[] {
    return rows.map((r) => (r.key === key ? { ...r, values: { ...r.values, [field]: value } } : r))
}

/** Ruta de error de una celda: `"<índice>.<campo>"`. */
export const cellErrorKey = (index: number, field: string): string => `${index}.${field}`

export const isBlankValue = (v: unknown): boolean =>
    v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

export interface DraftColumn {
    key: string
    label: string
    required?: boolean
    type?: string
}

export interface DraftRowsPolicy {
    /** Mínimo de filas (`RelationMeta.min`). Default 0. */
    min?: number
    messages?: {
        required?: (label: string) => string
        min?: (min: number, count: number) => string
    }
}

export interface DraftRowsValidation {
    /** Errores por celda `"<índice>.<campo>"`. */
    errors: Record<string, string>
    /** Error de conjunto (menos filas que el mínimo). */
    form?: string
    valid: boolean
}

/** Requeridos por celda + mínimo de filas. */
export function validateDraftRows(
    rows: DraftRow[],
    columns: DraftColumn[],
    policy: DraftRowsPolicy = {},
): DraftRowsValidation {
    const min = policy.min ?? 0
    const requiredMsg = policy.messages?.required ?? ((label: string) => `El campo ${label} es obligatorio`)
    const minMsg =
        policy.messages?.min ??
        ((m: number) => `Agrega al menos ${m} ${m === 1 ? 'fila' : 'filas'}`)
    const errors: Record<string, string> = {}
    rows.forEach((row, i) => {
        for (const col of columns) {
            if (col.required && isBlankValue(row.values[col.key])) {
                errors[cellErrorKey(i, col.key)] = requiredMsg(col.label)
            }
        }
    })
    const form = min > 0 && rows.length < min ? minMsg(min, rows.length) : undefined
    return { errors, form, valid: !form && Object.keys(errors).length === 0 }
}

/**
 * Valores listos para el backend: solo las columnas conocidas, opcionales
 * vacíos omitidos (nunca `""`), números reales y booleanos tal cual.
 */
export function serializeDraftRows(
    rows: DraftRow[],
    columns: DraftColumn[],
    opts: { includeId?: boolean } = {},
): Array<Record<string, unknown>> {
    return rows.map((row) => {
        const out: Record<string, unknown> = {}
        // Editar: la fila guardada viaja con su `id` (el kernel la actualiza; sin id crea).
        if (opts.includeId && row.id !== undefined && row.id !== null && row.id !== '') out.id = row.id
        for (const col of columns) {
            const v = row.values[col.key]
            if (isBlankValue(v)) continue
            if (col.type === 'number' || col.type === 'integer' || col.type === 'decimal') {
                const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
                out[col.key] = Number.isFinite(n) ? n : v
            } else {
                out[col.key] = typeof v === 'string' ? v.trim() : v
            }
        }
        return out
    })
}
