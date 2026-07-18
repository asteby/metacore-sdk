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
 * even though the user left the picker empty. This is generic — it keys off the
 * field metadata (`getFieldRef` / dynamic_select / search), so every addon's
 * optional relations benefit, not just products. Non-reference fields are left
 * untouched (an empty text field is a legitimate `""`). Does not mutate `values`.
 */
export function normalizeRefFieldsForSubmit(
    values: Record<string, any>,
    fields: RefFieldMeta[] | undefined,
): Record<string, any> {
    const refKeys = new Set(
        (fields ?? [])
            .filter(
                (f) =>
                    !!getFieldRef(f as unknown as ActionFieldDef) ||
                    f.type === 'dynamic_select' ||
                    f.widget === 'dynamic_select' ||
                    f.type === 'search',
            )
            .map((f) => f.key),
    )
    const out: Record<string, any> = { ...values }
    for (const [k, v] of Object.entries(out)) {
        // A nil UUID is never a real target row — null it out on any field.
        if (isNilUuid(v)) {
            out[k] = null
            continue
        }
        // An empty reference picker means "no relation" → null (not "").
        if (refKeys.has(k) && (v === '' || v == null)) out[k] = null
    }
    return out
}
