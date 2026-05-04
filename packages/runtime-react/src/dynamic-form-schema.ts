// Pure schema-building helpers for DynamicForm. Lives in its own module so
// callers (and unit tests) can use the zod schema without pulling in React or
// metacore-ui primitives.
import { z, type ZodTypeAny } from 'zod'
import type { ActionFieldDef, FieldValidation } from './types'

// Builds a zod object schema from an ActionFieldDef[]. Required fields stay
// non-empty; optional fields accept undefined / "". Validation rules
// (regex/min/max) layer on top: for numeric columns they bound the value, for
// strings they bound length — same dual semantics the kernel uses.
export function buildZodSchema(fields: ActionFieldDef[]) {
    const shape: Record<string, ZodTypeAny> = {}
    for (const field of fields) {
        shape[field.key] = fieldToZod(field)
    }
    return z.object(shape)
}

function fieldToZod(field: ActionFieldDef): ZodTypeAny {
    const v = field.validation ?? ({} as FieldValidation)
    const isNumeric = field.type === 'number'
    const isBool = field.type === 'boolean'

    if (isBool) {
        const base = z.boolean()
        return field.required ? base : base.optional()
    }

    if (isNumeric) {
        let s = z.coerce.number()
        if (typeof v.min === 'number') s = s.min(v.min, `Debe ser ≥ ${v.min}`)
        if (typeof v.max === 'number') s = s.max(v.max, `Debe ser ≤ ${v.max}`)
        if (field.required) return s
        return z.preprocess((val) => (val === '' || val == null ? undefined : val), s.optional())
    }

    let s = z.string()
    if (typeof v.min === 'number') s = s.min(v.min, `Mínimo ${v.min} caracteres`)
    if (typeof v.max === 'number') s = s.max(v.max, `Máximo ${v.max} caracteres`)
    if (v.regex) {
        try { s = s.regex(new RegExp(v.regex), `Formato inválido`) }
        catch { /* malformed regex from manifest — skip rather than throw at render time */ }
    }
    if (field.type === 'email') s = s.email('Email inválido')
    if (field.type === 'url') s = s.url('URL inválida')

    if (field.required) {
        return s.min(Math.max(typeof v.min === 'number' ? v.min : 1, 1), `${field.label} es requerido`)
    }
    return s.optional().or(z.literal(''))
}

// Resolves the renderer widget for a field. Explicit `widget` wins; otherwise
// it is inferred from `type` to preserve the legacy behaviour (zero-value =
// same render as before).
export function resolveWidget(field: ActionFieldDef): string {
    if (field.widget) return field.widget
    switch (field.type) {
        case 'textarea': return 'textarea'
        case 'select': return 'select'
        case 'boolean': return 'switch'
        case 'number': return 'number'
        case 'date': return 'date'
        default: return 'text'
    }
}
