// Zero-overlap invariant for the reflowing empty-state mockup.
//
// The animation reflows through four layouts (A→B→C→D→A). The hard requirement
// is that NO two tiles overlap at ANY frame — including mid-transition, where
// CSS interpolates each tile's rect (left/top/width/height) linearly. This test
// reproduces that linear interpolation and asserts non-overlap across every
// transition at fine time steps, so a future layout edit that would introduce a
// crossing fails here instead of in production.

import { describe, expect, it } from 'vitest'
import {
    MockupRect,
    mockupLayoutRects,
} from '../dashboard-empty-mockup'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpRect = (a: MockupRect, b: MockupRect, t: number): MockupRect => ({
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    w: lerp(a.w, b.w, t),
    h: lerp(a.h, b.h, t),
})

// Overlap area with a tiny epsilon so exact edge-adjacency (gap = 0 would-be
// touching) does not count; here tiles are separated by a real gap anyway.
const EPS = 1e-6
function overlapArea(a: MockupRect, b: MockupRect): number {
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
    const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
    if (ox <= EPS || oy <= EPS) return 0
    return ox * oy
}

describe('dashboard empty mockup — zero-overlap invariant', () => {
    const layouts = mockupLayoutRects()

    it('has 6 tiles in every layout, all within bounds', () => {
        for (const rects of layouts) {
            expect(rects).toHaveLength(6)
            for (const r of rects) {
                expect(r.x).toBeGreaterThanOrEqual(-EPS)
                expect(r.y).toBeGreaterThanOrEqual(-EPS)
                expect(r.x + r.w).toBeLessThanOrEqual(100 + EPS)
                expect(r.y + r.h).toBeLessThanOrEqual(100 + EPS)
                expect(r.w).toBeGreaterThan(0)
                expect(r.h).toBeGreaterThan(0)
            }
        }
    })

    it('no two tiles overlap in any static layout', () => {
        for (let l = 0; l < layouts.length; l++) {
            const rects = layouts[l]
            for (let i = 0; i < rects.length; i++)
                for (let j = i + 1; j < rects.length; j++)
                    expect(overlapArea(rects[i], rects[j]), `layout ${l}, tiles ${i}&${j}`).toBe(0)
        }
    })

    it('no two tiles overlap at any frame of any transition (A→B→C→D→A)', () => {
        // The loop is cyclic: transition k goes layout k → (k+1) mod 4.
        const n = layouts.length
        let worst = 0
        for (let k = 0; k < n; k++) {
            const from = layouts[k]
            const to = layouts[(k + 1) % n]
            for (let step = 0; step <= 20; step++) {
                const t = step / 20 // 0, 0.05, … , 1
                const frame = from.map((r, idx) => lerpRect(r, to[idx], t))
                for (let i = 0; i < frame.length; i++)
                    for (let j = i + 1; j < frame.length; j++) {
                        const area = overlapArea(frame[i], frame[j])
                        worst = Math.max(worst, area)
                        expect(
                            area,
                            `transition ${k}→${(k + 1) % n} t=${t.toFixed(2)} tiles ${i}&${j}`,
                        ).toBe(0)
                    }
            }
        }
        expect(worst).toBe(0)
    })
})
