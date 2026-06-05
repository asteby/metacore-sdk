// Determinism + spread coverage for the curated option-color palette that
// makes option/relation badges "alive" instead of dead gray. These utilities
// live in @asteby/metacore-ui/lib and are consumed by the OptionBadge and
// RelationCell renderers in dynamic-columns.tsx.
import { describe, it, expect } from 'vitest'
import { optionColor, OPTION_PALETTE } from '@asteby/metacore-ui/lib'

describe('optionColor', () => {
    it('is deterministic — same input always yields the same color', () => {
        const a = optionColor('storable')
        const b = optionColor('storable')
        expect(a).toBe(b)
        // Stable across many repeats (no Math.random / time dependence).
        for (let i = 0; i < 50; i++) {
            expect(optionColor('in_progress')).toBe(optionColor('in_progress'))
        }
    })

    it('normalizes case/whitespace so equal words collapse to one color', () => {
        expect(optionColor('Active')).toBe(optionColor('active'))
        expect(optionColor('  active  ')).toBe(optionColor('active'))
    })

    it('always returns a color from the curated palette', () => {
        const keys = [
            'storable', 'consumable', 'service', 'active', 'inactive', 'pending',
            'frenos', 'llantas', 'suspension', 'aceite', 'filtros', 'baterias',
            'uuid-1234', 'category', 'brand', 'supplier', 'warehouse', '',
        ]
        for (const key of keys) {
            expect(OPTION_PALETTE).toContain(optionColor(key))
        }
    })

    it('returns a 6-digit hex with no leading #', () => {
        expect(optionColor('anything')).toMatch(/^[0-9a-f]{6}$/)
    })

    it('falls back to a stable palette color for empty/nullish input', () => {
        expect(optionColor('')).toBe(OPTION_PALETTE[0])
        // @ts-expect-error exercising the nullish guard
        expect(optionColor(undefined)).toBe(OPTION_PALETTE[0])
    })

    it('spreads distinct inputs across the palette (not one color for all)', () => {
        const inputs = Array.from({ length: 200 }, (_, i) => `option_${i}`)
        const used = new Set(inputs.map(optionColor))
        // With 16 hues and 200 distinct keys we expect broad coverage; require
        // at least half the palette to be exercised so a degenerate hash that
        // collapses everything is caught.
        expect(used.size).toBeGreaterThanOrEqual(OPTION_PALETTE.length / 2)
    })

    it('different similar inputs do not all collide to one hue', () => {
        const c1 = optionColor('red')
        const c2 = optionColor('blue')
        const c3 = optionColor('green')
        const distinct = new Set([c1, c2, c3])
        expect(distinct.size).toBeGreaterThan(1)
    })
})
