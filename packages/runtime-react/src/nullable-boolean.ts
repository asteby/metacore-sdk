// Booleanos opcionales con tres estados: Sí / No / Sin definir.
//
// El kernel (>= v0.248.4) conserva NULL en los booleanos opcionales del CRUD
// dinámico y Get/List devuelven `null` cuando la columna es NULL. Ese NULL
// significa algo («modo desconocido» en `mp_payments.sandbox`), así que el SDK
// no puede pintarlo como «No» ni convertirlo en `false` al guardar: un pago de
// prueba pasaría a parecer real.
//
// Regla: un booleano NO requerido (sin `required` y sin
// `nullable: false` explícito) acepta NULL — es el contrato del kernel, que
// sirve `nullable = !required`. Esos campos se editan con este control de tres
// estados; los requeridos siguen con su switch/checkbox de dos estados.

type BoolFieldLike = {
    type?: string
    required?: boolean
    nullable?: boolean
}

const BOOL_TYPES = new Set(['boolean', 'checkbox'])

/** El campo es booleano (tipo `boolean` o `checkbox`). */
export function isBooleanField(field: BoolFieldLike | undefined | null): boolean {
    return !!field && BOOL_TYPES.has(String(field.type ?? '').toLowerCase())
}

/**
 * El campo es un booleano que admite NULL: no es requerido y no trae
 * `nullable: false`. Un booleano requerido devuelve false (dos estados).
 */
export function isNullableBooleanField(field: BoolFieldLike | undefined | null): boolean {
    if (!isBooleanField(field)) return false
    if (field!.required) return false
    if (field!.nullable === false) return false
    return true
}

/**
 * ¿Se edita con el control de tres estados? Sólo un booleano que admite NULL y,
 * además, (a) el servidor lo declara `nullable: true` (el kernel lo sirve en los
 * campos del CRUD) o (b) el registro lo trae en NULL. Así un flag opcional de una
 * acción («notificar al cliente») sigue siendo un switch, y un NULL real nunca se
 * pinta como «No».
 */
export function usesTriState(
    field: BoolFieldLike | undefined | null,
    original: unknown,
): boolean {
    if (!isNullableBooleanField(field)) return false
    return field!.nullable === true || original === null
}

/**
 * Valor de filtro «Sin definir» de un booleano: el dialecto de filtros de ops
 * del kernel (`query.ParseOpsFilterValue`) lee `f_<col>=NULL` como `IS NULL`
 * (OpNull). No hay OR entre operadores, así que el filtro booleano es de una
 * sola opción: Sí (`= true`), No (`= false`, excluye NULL) o Sin definir
 * (`IS NULL`).
 */
export const BOOLEAN_UNSET_FILTER_VALUE = 'NULL'

/**
 * Agrega la opción «Sin definir» a las opciones de un filtro booleano (Sí/No
 * que sirve el host). Sin opciones o si ya está, las devuelve igual.
 */
export function withBooleanUnsetOption<T extends { label: string; value: string }>(
    options: T[],
    label: string,
): T[] {
    if (options.length === 0) return options
    if (options.some((o) => String(o.value).toUpperCase() === BOOLEAN_UNSET_FILTER_VALUE)) return options
    return [...options, { label, value: BOOLEAN_UNSET_FILTER_VALUE } as T]
}

/**
 * Contrato de payload (ops #2252 / kernel v0.248.4): un booleano que no se tocó
 * NO viaja. Quita del payload las llaves booleanas que siguen en NULL igual que
 * en el registro original (el usuario no eligió nada). Un `null` elegido a
 * propósito («Sin definir» sobre un Sí/No guardado) sí viaja como `null` JSON.
 * Nunca convierte a `false`, a `""` ni al texto `"null"`.
 */
export function omitUntouchedNullBooleans<T extends Record<string, unknown>>(
    payload: T,
    fields: ReadonlyArray<BoolFieldLike & { key: string }> | undefined,
    original: (key: string) => unknown,
): T {
    let out: T | undefined
    for (const f of fields ?? []) {
        if (!isBooleanField(f) || !(f.key in payload)) continue
        if (payload[f.key] === null && original(f.key) === null) {
            out ??= { ...payload }
            delete out[f.key]
        }
    }
    return out ?? payload
}
