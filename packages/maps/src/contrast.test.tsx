// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { contrastRatio } from '@asteby/metacore-theme/contrast'
import { AreaPanel } from './area-panel'
import { BACKING_UNKNOWN, logoBacking } from './avatar'
import { applyLabelContrast } from './label-contrast'
import { readableOn } from './palette'
import { pointsToAreas } from './geometry'
import { pointsPaint } from './theme'
import type { MapPointItem } from './types'

describe('text on data colours', () => {
    it.each(['#ec4899', '#e8a317', '#2f7fd6', '#0072B2', '#56B4E9', '#808080'])('readableOn(%s) reaches 4.5:1', (bg) => {
        expect(contrastRatio(readableOn(bg), bg)).toBeGreaterThanOrEqual(4.5)
    })
    it('pink and amber get dark text (white was 3.5:1 and 2.1:1)', () => {
        expect(readableOn('#ec4899')).toBe('#000000')
        expect(readableOn('#e8a317')).toBe('#000000')
    })
    it('cluster text is computed from the cluster colour in both schemes', () => {
        for (const s of ['light', 'dark'] as const) {
            const p = pointsPaint(s)
            expect(contrastRatio(p.clusterText, p.clusterColor)).toBeGreaterThanOrEqual(4.5)
        }
    })
    it('area bubbles precompute `tc` (the MapLibre text-color) from their tone', () => {
        const pts: MapPointItem[] = [
            { key: 'a', lat: 1, lng: 1, label: 'A', status: 's', color: '#ec4899', precision: 'country', area: 'US' },
            { key: 'b', lat: 1, lng: 1, label: 'B', status: 's', color: '#ec4899', precision: 'country', area: 'US' },
        ]
        const f = pointsToAreas(pts).features[0]
        expect(f?.properties.color).toBe('#ec4899')
        expect(contrastRatio(f?.properties.tc as string, '#ec4899')).toBeGreaterThanOrEqual(4.5)
    })
})

describe('logo backing', () => {
    const brand = '#2f7fd6'
    it("God's Nutrition: a white logo sits on the brand blue, not on a white disc", () => {
        expect(logoBacking({ color: '#ffffff', luminance: 1, tone: 'light', coverage: 0.3, aspect: 4.69 }, brand)).toBe(brand)
    })
    it('a black logo is also visible on the brand blue (5.1:1)', () => {
        expect(logoBacking({ color: '#000000', luminance: 0, tone: 'dark', coverage: 0.3, aspect: 1 }, brand)).toBe(brand)
    })
    it('a logo of the brand colour moves to a neutral; no brand colour: neutral', () => {
        expect(logoBacking({ color: brand, luminance: 0.2, tone: 'mid', coverage: 1, aspect: 1 }, brand)).not.toBe(brand)
        expect(logoBacking({ color: '#ffffff', luminance: 1, tone: 'light', coverage: 1, aspect: 1 })).toBe('#1f2937')
    })
    it('unmeasurable (no CORS): the mid grey that shows white and black logos; not measured yet: keep', () => {
        expect(logoBacking('unknown', brand)).toBe(BACKING_UNKNOWN)
        expect(contrastRatio('#ffffff', BACKING_UNKNOWN)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio('#000000', BACKING_UNKNOWN)).toBeGreaterThanOrEqual(4.5)
        expect(logoBacking(undefined, brand)).toBeUndefined()
    })
})

describe('base-map label contrast', () => {
    const style = (text: string, bg = 'rgb(12,12,12)') => ({
        layers: [
            { id: 'background', type: 'background', paint: { 'background-color': bg } },
            { id: 'place_city', type: 'symbol', layout: { 'text-field': '{name}' }, paint: { 'text-color': text, 'text-halo-color': 'rgba(0,0,0,0.7)', 'text-halo-width': 1 } },
            { id: 'data_driven', type: 'symbol', layout: { 'text-field': '{name}' }, paint: { 'text-color': ['get', 'c'] } },
        ],
    })
    const fake = (s: ReturnType<typeof style>) => {
        const calls: Array<[string, string, unknown]> = []
        return { map: { getStyle: () => s, setPaintProperty: (id: string, p: string, v: unknown) => calls.push([id, p, v]) } as never, calls }
    }
    it('lifts the OpenFreeMap dark grey (3.3:1) to >= 4.5:1 and leaves expressions alone', () => {
        const { map, calls } = fake(style('rgb(101,101,101)'))
        applyLabelContrast(map)
        const text = calls.find((c) => c[0] === 'place_city' && c[1] === 'text-color')?.[2] as string
        expect(contrastRatio(text, 'rgb(12,12,12)')).toBeGreaterThanOrEqual(4.5)
        expect(calls.some((c) => c[0] === 'data_driven')).toBe(false)
    })
    it('does not touch a style that already reads', () => {
        const { map, calls } = fake(style('#ffffff'))
        applyLabelContrast(map)
        expect(calls).toEqual([])
    })
})

describe('area panel layout', () => {
    afterEach(cleanup)
    const members: MapPointItem[] = Array.from({ length: 8 }, (_, i) => ({ key: `k${i}`, lat: 1, lng: 1, label: `Instancia ${i}`, status: 'ok' }))
    const props = { title: 'Canadá', count: '8', members, listLabel: 'lista', closeLabel: 'cerrar', onPick: () => undefined, onClose: () => undefined }
    it('the list has no fixed max-height: it is a flex child that fills the panel and scrolls only when needed', () => {
        const { getByRole, getByTestId } = render(<AreaPanel {...props} />)
        const ul = getByRole('list')
        expect(ul.style.maxHeight).toBe('')
        expect(ul.style.flex).toContain('1')
        expect(ul.style.minHeight).toMatch(/^0(px)?$/)
        expect(ul.style.overflowY).toBe('auto')
        const panel = getByTestId('map-area-panel')
        expect(panel.style.display).toBe('flex')
        expect(panel.style.flexDirection).toBe('column')
    })
    it('the host can make the panel as tall as the map (contain: size) without a height constant', () => {
        const { getByTestId } = render(<AreaPanel {...props} style={{ contain: 'size' }} />)
        expect(getByTestId('map-area-panel').style.contain).toBe('size')
    })
})
