import { describe, expect, it } from 'vitest'
import { normalizeHex, DEFAULT_ROLE_COLOR } from '../color-picker-field'

describe('normalizeHex', () => {
    it('accepts #rgb and expands', () => {
        expect(normalizeHex('#0af')).toBe('#00aaff')
    })
    it('lowercases #rrggbb', () => {
        expect(normalizeHex('#3B82F6')).toBe('#3b82f6')
    })
    it('rejects garbage', () => {
        expect(normalizeHex('blue')).toBe('')
        expect(normalizeHex('#gg0000')).toBe('')
    })
    it('default constant is valid', () => {
        expect(normalizeHex(DEFAULT_ROLE_COLOR)).toBe('#3b82f6')
    })
})
