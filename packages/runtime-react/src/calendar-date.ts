// A `date` column is a calendar day, not an instant. The backend often serves
// it as UTC midnight ("2026-09-27T00:00:00Z"), which a plain Date parse turns
// into the previous evening west of UTC (QA Pitsline PIT-025: picked the 27th,
// the form showed the 26th). Read the YYYY-MM-DD prefix as a LOCAL day instead.

/** Parse a calendar day ("YYYY-MM-DD…" or any Date-parseable value) into a
 *  local Date at noon, or undefined when empty/invalid. */
export function parseCalendarDate(v: unknown): Date | undefined {
    if (v === null || v === undefined || v === '') return undefined
    if (v instanceof Date) return isNaN(v.getTime()) ? undefined : v
    const s = String(v)
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
    const d = new Date(s)
    return isNaN(d.getTime()) ? undefined : d
}

/**
 * True when a serialized value is a pure CALENDAR DAY: `YYYY-MM-DD`, or that day at
 * exactly UTC midnight (how the backend serves a `date` column). Anything with a
 * real time of day is an INSTANT: a `timestamptz` shown with a day-only renderer
 * must be read in the organization's zone, or an evening invoice (29 Sep 19:41 in
 * Mexico City = 30 Sep 00:41Z) shows as the 30th (PIT-025).
 */
export function isCalendarDayValue(v: unknown): boolean {
    if (typeof v !== 'string') return false
    return /^\d{4}-\d{2}-\d{2}(?:[T ]00:00:00(?:\.0+)?(?:Z|\+00:00)?)?$/.test(v.trim())
}
