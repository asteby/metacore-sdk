// option-when.ts — opciones estáticas de un select condicionadas por el valor
// de un campo hermano (`options[].when`) y la dependencia declarada del campo
// (`dependsOn`). Módulo hoja: lo usan el formulario (dynamic-form-schema), el
// render compartido de campos (renderField) y el validador, sin ciclos.
import type { ActionFieldDef, OptionDef } from './types'

/**
 * Resolves a field's cascade dependency — the key of another form field whose
 * current value scopes this picker's options (`filter_value`). Tolerates the
 * camelCase `dependsOn` (authored SDK shape) and the snake_case `depends_on`
 * the kernel manifest serves. Returns the trimmed field key, or `undefined`
 * when the field declares no dependency.
 */
export function getDependsOn(field: ActionFieldDef): string | undefined {
    const dep = field.dependsOn ?? field.depends_on
    if (typeof dep === 'string' && dep.trim() !== '') return dep.trim()
    return undefined
}

/**
 * Filters a STATIC enum's `options[]` by each option's `when` gate against the
 * current form values. Pure — no React, no side effects.
 *
 * Rule per option:
 * - No `when` → always included (retrocompat; existing enums untouched).
 * - With `when`: the gating field is `when.field ?? dependsOn`. If neither is
 *   present the option is included (nothing to gate on). Otherwise the form's
 *   value for that field is compared AS STRING: included when (no `in`, or
 *   value ∈ `in`) AND (no `not_in`, or value ∉ `not_in`). Tolerates the
 *   snake_case `not_in` the kernel serves alongside camelCase `notIn`.
 *
 * `formValues` is the flat map of the surrounding form/row values the gating
 * field is read from; `dependsOn` is the containing field's declared dependency
 * used as the default gating field.
 */
export function applyOptionWhen(
    options: OptionDef[] | undefined,
    formValues: Record<string, any> | null | undefined,
    dependsOn?: string,
): OptionDef[] {
    if (!Array.isArray(options)) return []
    return options.filter((opt) => {
        const when = opt?.when
        if (!when) return true
        const gate = (typeof when.field === 'string' && when.field.trim() !== '')
            ? when.field.trim()
            : dependsOn
        if (!gate) return true
        const raw = formValues ? formValues[gate] : undefined
        const current = raw == null ? '' : String(raw)
        const inList = when.in
        const notIn = when.notIn ?? when.not_in
        if (Array.isArray(inList) && inList.length > 0) {
            if (!inList.some((v) => String(v) === current)) return false
        }
        if (Array.isArray(notIn) && notIn.length > 0) {
            if (notIn.some((v) => String(v) === current)) return false
        }
        return true
    })
}
