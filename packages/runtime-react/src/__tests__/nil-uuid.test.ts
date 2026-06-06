// Locks the nil-UUID guard shared by the table cell renderer and the detail
// view. The all-zeros UUID is the sentinel a backend emits for an unset
// nullable FK; the UI must read it as "no value", never as a string of zeros.
import { describe, it, expect } from 'vitest'
import { NIL_UUID, isNilUuid, normalizeNilUuid } from '../nil-uuid'

describe('isNilUuid', () => {
    it('matches the canonical nil UUID', () => {
        expect(isNilUuid(NIL_UUID)).toBe(true)
        expect(isNilUuid('00000000-0000-0000-0000-000000000000')).toBe(true)
    })

    it('is tolerant of whitespace and case', () => {
        expect(isNilUuid('  00000000-0000-0000-0000-000000000000  ')).toBe(true)
        expect(isNilUuid('00000000-0000-0000-0000-000000000000'.toUpperCase())).toBe(true)
    })

    it('does not match a real UUID', () => {
        expect(isNilUuid('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(false)
    })

    it('does not match non-string values', () => {
        expect(isNilUuid(null)).toBe(false)
        expect(isNilUuid(undefined)).toBe(false)
        expect(isNilUuid(0)).toBe(false)
        expect(isNilUuid('')).toBe(false)
        expect(isNilUuid({ value: NIL_UUID })).toBe(false)
    })
})

describe('normalizeNilUuid', () => {
    it('maps the nil UUID to undefined', () => {
        expect(normalizeNilUuid(NIL_UUID)).toBeUndefined()
    })

    it('passes through real values unchanged', () => {
        expect(normalizeNilUuid('real-id')).toBe('real-id')
        expect(normalizeNilUuid(42)).toBe(42)
        expect(normalizeNilUuid(null)).toBeNull()
        expect(normalizeNilUuid('')).toBe('')
    })
})
