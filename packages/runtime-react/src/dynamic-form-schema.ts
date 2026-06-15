// Pure schema-building helpers for DynamicForm. Lives in its own module so
// callers (and unit tests) can use the zod schema without pulling in React or
// metacore-ui primitives.
import { z, type ZodTypeAny } from 'zod'
import type { ActionFieldDef, FieldValidation } from './types'
import { resolveValidatorToken } from './use-org-config-bridge'

/**
 * Built-in validators the SDK knows how to apply by symbolic name. Apps
 * that wire `OrgConfigProvider` map `$org.<key>` references to one of
 * these slugs (or to a custom slug they register). Unknown slugs are a
 * no-op so unresolved $org references degrade to "no extra check"
 * rather than a runtime crash — matches the kernel's pass-through
 * semantics for unresolved references.
 */
const builtinValidators: Record<string, (s: z.ZodString) => z.ZodString> = {
    // The SDK ships ZERO fiscal vocabulary by default. Apps register
    // their own validators (mx.rfc, co.nit, pe.ruc, etc.) via
    // `registerValidator` so kernel/SDK stay region-agnostic.
}

/**
 * Apps register validator implementations by slug. The slug is the value
 * `OrgConfig.validators[<key>]` returns for a $org.<key> reference.
 */
export function registerValidator(slug: string, fn: (s: z.ZodString) => z.ZodString): void {
    builtinValidators[slug] = fn
}

function applyCustomValidator(s: z.ZodString, customToken: string | undefined): z.ZodString {
    if (!customToken) return s
    const resolved = resolveValidatorToken(customToken)
    if (!resolved) return s
    const fn = builtinValidators[resolved]
    return fn ? fn(s) : s
}

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

/**
 * Returns the line-items columns of a repeatable-group field, tolerating both
 * the camelCase `itemFields` (the authored SDK shape) and the raw snake_case
 * `item_fields` that the kernel serves in action metadata. Empty when the
 * field is not a line-items group.
 */
export function getItemFields(field: ActionFieldDef): ActionFieldDef[] {
    const raw = field.itemFields ?? (field as { item_fields?: ActionFieldDef[] }).item_fields
    return Array.isArray(raw) ? raw : []
}

/** A field is a repeatable line-items group when it declares item columns. */
export function isLineItemsField(field: ActionFieldDef): boolean {
    return getItemFields(field).length > 0
}

/**
 * Resolves the balance rule of a line-items field, tolerating both the
 * camelCase authored shape and the snake_case the kernel serves. Returns
 * normalized `{ debitColumn, creditColumn, message, requireNonzero }` or
 * `undefined` when the field declares no balance constraint.
 */
export function getBalanceRule(
    field: ActionFieldDef,
): { debitColumn: string; creditColumn: string; message?: string; requireNonzero: boolean } | undefined {
    const b = field.balance
    if (!b) return undefined
    const debitColumn = b.debitColumn ?? b.debit_column ?? ''
    const creditColumn = b.creditColumn ?? b.credit_column ?? ''
    if (!debitColumn || !creditColumn) return undefined
    const reqRaw = b.requireNonzero ?? b.require_nonzero
    return {
        debitColumn,
        creditColumn,
        message: b.message,
        requireNonzero: reqRaw === undefined ? true : !!reqRaw,
    }
}

/** Coerces a cell value to a finite number, treating blanks/garbage as 0. */
export function toNumber(v: unknown): number {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0
    if (typeof v === 'string') {
        const n = parseFloat(v)
        return Number.isFinite(n) ? n : 0
    }
    return 0
}

/**
 * Sums each `total`-flagged column of a line-items field across its rows.
 * Pure — no React — so the renderer and unit tests share one implementation.
 * Returns a map of column key → summed value. Rounds to cents to avoid float
 * drift (0.1 + 0.2 noise) that would make a genuinely balanced entry look off.
 */
export function computeLineItemTotals(
    field: ActionFieldDef,
    rows: any[] | undefined,
): Record<string, number> {
    const cols = getItemFields(field).filter((c) => c.total)
    const totals: Record<string, number> = {}
    for (const c of cols) totals[c.key] = 0
    if (Array.isArray(rows)) {
        for (const row of rows) {
            for (const c of cols) totals[c.key] += toNumber(row?.[c.key])
        }
    }
    for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 100) / 100
    return totals
}

export interface BalanceState {
    debit: number
    credit: number
    /** credit − debit, rounded to cents. Zero when balanced. */
    diff: number
    balanced: boolean
    message?: string
}

/**
 * Evaluates a line-items field's balance rule against its rows. Returns
 * `undefined` when the field declares no balance rule. `balanced` is true when
 * the two summed columns are equal (and, unless `requireNonzero` is false,
 * strictly positive). Pure — drives both the indicator and the submit gate.
 */
export function evaluateBalance(
    field: ActionFieldDef,
    rows: any[] | undefined,
): BalanceState | undefined {
    const rule = getBalanceRule(field)
    if (!rule) return undefined
    let debit = 0
    let credit = 0
    if (Array.isArray(rows)) {
        for (const row of rows) {
            debit += toNumber(row?.[rule.debitColumn])
            credit += toNumber(row?.[rule.creditColumn])
        }
    }
    debit = Math.round(debit * 100) / 100
    credit = Math.round(credit * 100) / 100
    const diff = Math.round((credit - debit) * 100) / 100
    const balanced = diff === 0 && (!rule.requireNonzero || debit > 0)
    return { debit, credit, diff, balanced, message: rule.message }
}

function fieldToZod(field: ActionFieldDef): ZodTypeAny {
    // Repeatable line-items group → array of row objects, each row built from
    // the item field columns. Required keeps at least one row.
    const itemFields = getItemFields(field)
    if (itemFields.length > 0) {
        const row = buildZodSchema(itemFields)
        const arr = z.array(row)
        return field.required ? arr.min(1, `${field.label} requiere al menos un renglón`) : arr
    }

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

    // Custom validator: a literal slug (`mx.rfc`) OR a `$org.<key>`
    // reference resolved through the OrgConfigProvider. Unknown slugs
    // pass through as no-ops so apps never crash on missing config.
    s = applyCustomValidator(s, v.custom)

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
    // S1: any field that declares an FK target (`ref`, or the snake_case
    // `source`/`relation` the kernel may serve) renders as an async searchable
    // single-select — NOT a raw text input. This wins over the `type` switch so
    // a declared FK column is a picker regardless of its SQL column type
    // (uuid/text/etc), matching the kernel's option-resolution semantics.
    if (fieldHasRef(field)) return 'dynamic_select'
    switch (field.type) {
        case 'textarea': return 'textarea'
        case 'select': return 'select'
        // Async searchable single-select against /api/options/<ref>. The
        // declarative replacement for typing a raw FK UUID.
        case 'dynamic_select': return 'dynamic_select'
        case 'boolean': return 'switch'
        case 'number': return 'number'
        case 'date': return 'date'
        // File upload: POSTs to the host upload endpoint and stores the returned
        // file url/path as the field value. Rendered by `UploadField`.
        case 'upload': return 'upload'
        // S2: media-bearing types resolve to the upload widget so an `image`
        // (logo/photo) or generic `file`/`media` field gets a real file picker
        // instead of a free-text input.
        case 'image': return 'upload'
        case 'media': return 'upload'
        case 'file': return 'upload'
        default: return 'text'
    }
}

/**
 * Resolves a field's FK target, tolerating the camelCase `ref` (authored SDK
 * shape) and the snake_case `source` / `relation` aliases the kernel manifest
 * may serve for a belongs_to column. Returns the trimmed model key, or
 * `undefined` when the field declares no relation.
 */
export function getFieldRef(field: ActionFieldDef): string | undefined {
    const ref = field.ref ?? field.source ?? field.relation
    if (typeof ref === 'string' && ref.trim() !== '') return ref.trim()
    return undefined
}

/** True when a field declares an FK target the SDK can resolve options against. */
export function fieldHasRef(field: ActionFieldDef): boolean {
    return getFieldRef(field) !== undefined
}

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
 * Resolves the cascade `filter_value` for a field from the surrounding form
 * context. The depended-on key is matched against the current row first (a
 * sibling item-field on the same line) and then the header form values, so a
 * line-items cell can depend on either a sibling cell OR a header field (e.g.
 * `source_warehouse_id`). Returns the stringified value, or `''` when the
 * field has no dependency or the depended-on value is empty/unset.
 */
export function resolveDependsValue(
    field: ActionFieldDef,
    formValues?: Record<string, any> | null,
    rowValues?: Record<string, any> | null,
): string {
    const dep = getDependsOn(field)
    if (!dep) return ''
    const raw =
        (rowValues && rowValues[dep] != null && rowValues[dep] !== '' ? rowValues[dep] : undefined) ??
        (formValues ? formValues[dep] : undefined)
    if (raw == null || raw === '') return ''
    return String(raw)
}

/**
 * Normalizes an upload field's config, tolerating both the camelCase authored
 * SDK shape and the snake_case the kernel serves (`max_size`, `storage_path`).
 * Pure — shared by both field renderers and unit tests.
 */
export function getUploadConfig(field: ActionFieldDef): {
    accept?: string
    maxSize?: number
    storagePath?: string
} {
    const accept = field.accept
    const maxSizeRaw = field.maxSize ?? field.max_size
    const maxSize =
        typeof maxSizeRaw === 'number' && Number.isFinite(maxSizeRaw) && maxSizeRaw > 0
            ? maxSizeRaw
            : undefined
    const storagePath = field.storagePath ?? field.storage_path
    return {
        accept: accept || undefined,
        maxSize,
        storagePath: storagePath || undefined,
    }
}
