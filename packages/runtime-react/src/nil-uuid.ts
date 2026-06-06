// Shared guard for the "nil UUID" — the all-zeros UUID Postgres/Go emit for a
// nullable FK that was never set (`00000000-0000-0000-0000-000000000000`).
// Backends sometimes serialize an unset `uuid` column as this sentinel instead
// of `null`, which then leaks into the UI as a long string of zeros. Treat it
// as "no value" so cell/detail renderers fall through to their existing empty
// markers ("-" / "—"). Cosmetic defense-in-depth — the backend should emit null.

/** The canonical nil/zero UUID sentinel. */
export const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/**
 * True when `value` is the nil UUID string. Tolerant of surrounding whitespace
 * and letter-case (UUIDs are conventionally lowercase, but be defensive). Only
 * matches strings — numeric/object values are never the nil UUID.
 */
export const isNilUuid = (value: unknown): boolean =>
    typeof value === 'string' && value.trim().toLowerCase() === NIL_UUID

/**
 * Normalizes a raw cell value: returns `undefined` when it is the nil UUID so
 * downstream renderers hit their existing nullish/empty branches; otherwise the
 * value is passed through unchanged.
 */
export const normalizeNilUuid = <T>(value: T): T | undefined =>
    isNilUuid(value) ? undefined : value
