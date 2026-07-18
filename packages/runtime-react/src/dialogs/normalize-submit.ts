// Pure submit-payload normalization for dynamic record forms. Kept in its own
// module (no React / UI imports) so it is unit-testable in isolation and
// reusable by any caller that builds a create/update payload.
import { isNilUuid } from '../nil-uuid'
import { getFieldRef } from '../dynamic-form-schema'
import type { ActionFieldDef } from '../types'

/** Minimal field-metadata shape the normalizer reads. Kept permissive so any
 *  caller's field type (e.g. the dialog's `FieldDef[]`) is accepted. */
type RefFieldMeta = Record<string, any>

/**
 * Normalize a submit payload so that EMPTY reference fields go to the server as
 * `null` rather than as `""` or the nil UUID ("00000000-…"). A dynamic FK column
 * (e.g. products.category_id, a nullable `ref`) rejects a non-null value that
 * points at no row: sending `""`/nil-UUID triggers
 *   insert ... violates foreign key constraint "fk_products_category" (23503)
 * even though the user left the picker empty.
 *
 * Nullability decision (Fase 4): prefer the EXPLICIT `nullable` flag the kernel
 * (v0.77.1+) now serves per field (`modelbase.FieldDef.Nullable`, `!Required`).
 * When `field.nullable === true` an empty value is submitted as `null`; when
 * `field.nullable === false` the value is respected. When the flag is absent
 * (undefined — older hosts that don't serve it yet) we fall back to the legacy
 * type-based heuristic (`getFieldRef` / dynamic_select / search). This keeps
 * backward-compat while letting the contract, not a guess, drive the decision.
 *
 * The explicit flag also lets us null an empty OPTIONAL ref whose column is NOT
 * a uuid (which the uuid-only heuristic never covered). To avoid nulling a plain
 * optional text field — where `""` is a legitimate value, not "no relation" — we
 * gate the explicit path on the field ALSO looking like a reference/relation
 * (`getFieldRef` / dynamic_select / search). A nullable non-ref scalar keeps its
 * `""`. This is generic — every addon's optional relations benefit. Does not
 * mutate `values`.
 */
export function normalizeRefFieldsForSubmit(
    values: Record<string, any>,
    fields: RefFieldMeta[] | undefined,
): Record<string, any> {
    const isRefField = (f: RefFieldMeta): boolean =>
        !!getFieldRef(f as unknown as ActionFieldDef) ||
        f.type === 'dynamic_select' ||
        f.widget === 'dynamic_select' ||
        f.type === 'search'

    // Index fields by key so we can consult the explicit `nullable` flag.
    const fieldByKey = new Map<string, RefFieldMeta>()
    for (const f of fields ?? []) {
        if (f && typeof f.key === 'string') fieldByKey.set(f.key, f)
    }

    const out: Record<string, any> = { ...values }
    for (const [k, v] of Object.entries(out)) {
        // A nil UUID is never a real target row — null it out on any field.
        if (isNilUuid(v)) {
            out[k] = null
            continue
        }
        const isEmpty = v === '' || v == null
        if (!isEmpty) continue

        const f = fieldByKey.get(k)
        const nullable = f?.nullable
        if (nullable === true) {
            // Explicit contract flag wins. Only null a reference/relation so a
            // legitimately-empty optional plain-text field keeps its `""`.
            if (f && isRefField(f)) out[k] = null
            continue
        }
        if (nullable === false) {
            // Explicitly non-nullable → respect the empty value as-is.
            continue
        }
        // No explicit flag (older host): fall back to the type-based heuristic.
        if (f && isRefField(f)) out[k] = null
    }
    return out
}
