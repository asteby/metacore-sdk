// Pure-logic coverage for the date/datetime cell formatter behind
// `defaultGetDynamicColumns`. Locks the contract the JSX cell relies on:
// `date` → day only (no tooltip), `datetime`/`timestamp(tz)` → day + time with
// a full-precision tooltip, and null/invalid/Go-zero-time → `null` (em-dash).
import { describe, it, expect } from 'vitest'
import { enUS } from 'date-fns/locale'
import { formatDateCell } from '../dynamic-columns'

describe('formatDateCell', () => {
    const iso = '2026-06-06T17:47:33.201Z'

    it('renders day only with no tooltip for `date`', () => {
        const out = formatDateCell(iso, 'date', enUS)
        expect(out).not.toBeNull()
        expect(out!.title).toBeUndefined()
        // `PPP` is the long day form — no time component.
        expect(out!.display).not.toMatch(/\d{1,2}:\d{2}/)
        expect(out!.display).toMatch(/2026/)
    })

    it('renders day + time and a full-precision tooltip for `datetime`', () => {
        const out = formatDateCell(iso, 'datetime', enUS)
        expect(out).not.toBeNull()
        expect(out!.display).toMatch(/\d{1,2}:\d{2}/)
        expect(out!.title).toBeDefined()
        expect(out!.title).toMatch(/\d{1,2}:\d{2}/)
    })

    it('treats timestamp/timestamptz like datetime (day + time + tooltip)', () => {
        for (const t of ['timestamp', 'timestamptz']) {
            const out = formatDateCell(iso, t, enUS)
            expect(out).not.toBeNull()
            expect(out!.display).toMatch(/\d{1,2}:\d{2}/)
            expect(out!.title).toBeDefined()
        }
    })

    it('returns null for null/undefined/empty (empty cell)', () => {
        expect(formatDateCell(null, 'datetime', enUS)).toBeNull()
        expect(formatDateCell(undefined, 'datetime', enUS)).toBeNull()
        expect(formatDateCell('', 'datetime', enUS)).toBeNull()
    })

    it('returns null for the Go zero-time (0001-01-01T00:00:00Z)', () => {
        expect(formatDateCell('0001-01-01T00:00:00Z', 'datetime', enUS)).toBeNull()
        expect(formatDateCell('0001-01-01T00:00:00Z', 'date', enUS)).toBeNull()
    })

    it('returns null for an unparseable value', () => {
        expect(formatDateCell('not-a-date', 'datetime', enUS)).toBeNull()
    })
})
