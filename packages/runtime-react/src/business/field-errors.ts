// Mapeo de errores de API (409/422/…) a mensajes por campo (PIT-002/003/013/021/029).
//
// Un 422 trae `errors: {campo: [{code, params}]}`; un 409 (duplicado, enum,
// conflicto de estado) suele traer solo `message`/`details`. Ambos se resuelven
// aquí a `{ fields, form }`: los campos se pintan junto al input y `form` (lo que
// no se pudo atribuir a un campo) va a un banner persistente — el toast solo
// confirma éxitos.
import {
    extractFieldErrors,
    extractServerError,
    localizeFieldErrorMap,
    type Translate,
} from '../server-error'

export interface MappedApiError {
    /** HTTP status si el error lo trae (axios `response.status`). */
    status?: number
    /** Mensaje ya localizado por campo, listo para el `error` de cada input. */
    fields: Record<string, string>
    /** Mensaje general (qué pasó + cómo corregirlo) para un banner; sin jerga. */
    form?: string
    /** true si hay al menos un mensaje atribuible a un campo. */
    hasFieldErrors: boolean
}

export interface MapApiErrorOptions {
    t?: Translate
    language?: string
    /** Etiquetas traducidas por clave de campo (para «El campo {{label}}…»). */
    labels?: Record<string, string>
    /** Campos conocidos del formulario: un 409 se atribuye al que la causa nombra. */
    knownFields?: string[]
    fallback?: string
}

const CONFLICT_HINTS: Array<{ re: RegExp; es: string }> = [
    { re: /duplicate|already exists|unique|23505|ya existe/i, es: 'Ya existe un registro con ese valor' },
]

/** Traductor sin i18next: devuelve el default con `{{var}}` interpolado. */
const defaultTranslate: Translate = (key, o) =>
    (o?.defaultValue ?? key).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(o?.[k] ?? ''))

function statusOf(err: unknown): number | undefined {
    const s = (err as { response?: { status?: unknown } } | undefined)?.response?.status
    return typeof s === 'number' ? s : undefined
}

/** Encuentra el campo que un texto de causa nombra (`Key (sku)=(A1) already exists`). */
function fieldNamedBy(text: string, known: string[] | undefined): string | undefined {
    if (!known?.length) return undefined
    const lower = text.toLowerCase()
    return known.find((k) => new RegExp(`(^|[^a-z0-9_])${k.toLowerCase()}([^a-z0-9_]|$)`).test(lower))
}

/**
 * Convierte cualquier error de mutación en mensajes por campo + mensaje general.
 * Pura salvo por `t`; no muestra toasts.
 */
export function mapApiError(err: unknown, opts: MapApiErrorOptions = {}): MappedApiError {
    const t: Translate = opts.t ?? defaultTranslate
    const status = statusOf(err)
    const raw = extractFieldErrors(err)
    if (raw) {
        const fields = localizeFieldErrorMap(raw, t, { labels: opts.labels, language: opts.language })
        return { status, fields, hasFieldErrors: Object.keys(fields).length > 0 }
    }

    // Sin respuesta HTTP (red caída, CORS, excepción): el texto crudo es jerga.
    const noResponse = !(err as { response?: unknown } | undefined)?.response && err instanceof Error
    const fallback = opts.fallback ?? t('common.error', { defaultValue: 'No se pudo completar la operación' })
    if (noResponse) return { status, fields: {}, form: fallback, hasFieldErrors: false }
    const { title, description } = extractServerError(err, fallback)
    const text = [title, description].filter(Boolean).join(' — ')

    if (status === 409 || status === 422) {
        const hint = CONFLICT_HINTS.find((h) => h.re.test(text))
        const field = fieldNamedBy(text, opts.knownFields)
        if (field) {
            const label = opts.labels?.[field] ?? field
            const msg = hint
                ? t('validation.duplicate', { defaultValue: 'Ya existe un registro con ese {{label}}', label })
                : t(title, { defaultValue: title })
            return { status, fields: { [field]: msg }, hasFieldErrors: true }
        }
        const form = hint ? hint.es : t(title, { defaultValue: title })
        return { status, fields: {}, form: description && !hint ? `${form}. ${description}` : form, hasFieldErrors: false }
    }

    const form = t(title, { defaultValue: title })
    return { status, fields: {}, form: description ? `${form}. ${description}` : form, hasFieldErrors: false }
}
