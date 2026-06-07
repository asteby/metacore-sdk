import { describe, it, expect } from 'vitest'
import { humanizeToken } from '../dynamic-columns-helpers'

describe('humanizeToken', () => {
    it('title-cases snake_case tokens', () => {
        expect(humanizeToken('in_progress')).toBe('In Progress')
        expect(humanizeToken('out_of_stock')).toBe('Out Of Stock')
    })

    it('title-cases kebab-case tokens', () => {
        expect(humanizeToken('out-of-stock')).toBe('Out Of Stock')
        expect(humanizeToken('draft-pending')).toBe('Draft Pending')
    })

    it('handles dotted tokens', () => {
        expect(humanizeToken('payment.failed')).toBe('Payment Failed')
    })

    it('title-cases a single word', () => {
        expect(humanizeToken('sale')).toBe('Sale')
        expect(humanizeToken('completed')).toBe('Completed')
    })

    it('uppercases known acronyms (case-insensitive)', () => {
        expect(humanizeToken('pos')).toBe('POS')
        expect(humanizeToken('SKU')).toBe('SKU')
        expect(humanizeToken('sku_count')).toBe('SKU Count')
        expect(humanizeToken('api_url')).toBe('API URL')
        expect(humanizeToken('rfc')).toBe('RFC')
        expect(humanizeToken('id')).toBe('ID')
    })

    it('leaves already-humanized text untouched', () => {
        expect(humanizeToken('In Progress')).toBe('In Progress')
        expect(humanizeToken('Some free form note')).toBe('Some free form note')
    })

    it('leaves long free text untouched', () => {
        const long = 'this is a fairly long sentence describing the order status today'
        expect(humanizeToken(long)).toBe(long)
    })

    it('leaves UUIDs untouched', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000'
        expect(humanizeToken(uuid)).toBe(uuid)
    })

    it('coerces non-string values without transforming them', () => {
        expect(humanizeToken(42 as unknown as string)).toBe('42')
        expect(humanizeToken(null)).toBe('')
        expect(humanizeToken(undefined)).toBe('')
    })

    it('returns empty/whitespace input unchanged', () => {
        expect(humanizeToken('')).toBe('')
        expect(humanizeToken('   ')).toBe('   ')
    })
})
