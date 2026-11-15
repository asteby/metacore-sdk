import { describe, expect, it } from 'vitest'
import { getInitials } from './get-initials'

describe('getInitials', () => {
    it('takes the first letter of each word', () => {
        expect(getInitials('Alice Johnson')).toBe('AJ')
    })
    it('skips separator tokens like "·"', () => {
        expect(getInitials('local · c967abad')).toBe('LC')
        expect(getInitials('trial - 5b700d69')).toBe('T5')
    })
    it('falls back when nothing usable remains', () => {
        expect(getInitials('· -')).toBe('?')
        expect(getInitials('')).toBe('?')
    })
})