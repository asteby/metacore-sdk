// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { configureMaps, resetMapsConfig } from './config'
import { fakeMaplibre, instances, markers, popups, resetFakes } from './fake-maplibre'
import { DEFAULT_PRECISION_ZOOM, fitMaxZoom, pointsToAreas, selectZoomFor, spiderOffsets } from './geometry'
import { MapView } from './map-view'
import { rowTitle } from './renderers/shared'
import type { MapPointItem } from './types'

const C = { lat: 14.6, lng: -90.5 }
const country = (i: number, extra: Partial<MapPointItem> = {}): MapPointItem => ({ key: `ca${i}`, ...C, label: `Instancia ${i}`, status: 'online', statusLabel: 'En línea', precision: 'country', area: 'CA', ...extra })
const eight = Array.from({ length: 8 }, (_, i) => country(i))
const exactOne: MapPointItem = { key: 'mx', lat: 19.4, lng: -99.1, label: 'CDMX' }

beforeEach(() => {
    resetMapsConfig()
    resetFakes()
    configureMaps({ loadMaplibre: async () => fakeMaplibre, supportsWebGL: () => true })
})
afterEach(() => {
    cleanup()
    document.documentElement.className = ''
})

async function mount(points: MapPointItem[], props: Partial<React.ComponentProps<typeof MapView>> = {}) {
    render(<MapView points={points} {...props} />)
    await waitFor(() => expect(screen.getByTestId('metacore-map').getAttribute('data-status')).toBe('ready'))
    const map = instances[0]!
    if (points.some((p) => p.precision)) await waitFor(() => expect(map.layers.has('mcm-points-areas')).toBe(true))
    return map
}
const areaFeature = (map: { sources: Map<string, any> }) => ({ properties: map.sources.get('mcm-points-areas').data.features[0].properties, geometry: { coordinates: [C.lng, C.lat] } })
const easeZooms = (map: { calls: Array<[string, ...unknown[]]> }) => map.calls.filter((c) => c[0] === 'easeTo').map((c) => (c[1] as { zoom: number }).zoom)

describe('pure helpers', () => {
    it('spiderOffsets: a circle up to 8, a growing spiral beyond, never overlapping pins', () => {
        const ring = spiderOffsets(6)
        expect(new Set(ring.map(([x, y]) => Math.round(Math.hypot(x, y)))).size).toBe(1)
        const spiral = spiderOffsets(20)
        expect(spiral).toHaveLength(20)
        const radii = spiral.map(([x, y]) => Math.hypot(x, y))
        expect(radii[19]!).toBeGreaterThan(radii[0]!)
        for (let i = 0; i < spiral.length; i++)
            for (let j = i + 1; j < spiral.length; j++) expect(Math.hypot(spiral[i]![0] - spiral[j]![0], spiral[i]![1] - spiral[j]![1])).toBeGreaterThan(28)
        expect(spiderOffsets(0)).toEqual([])
    })

    it('selectZoomFor: caps by precision, never zooms out, crowded exact points only centre', () => {
        const a = country(1)
        const lone: MapPointItem = { key: 'x', lat: 1, lng: 1, label: 'x' }
        const twin: MapPointItem = { key: 'y', lat: 1, lng: 1, label: 'y' }
        expect(selectZoomFor(a, [a], 4, 13)).toBe(DEFAULT_PRECISION_ZOOM.country)
        expect(selectZoomFor({ ...a, precision: 'city' }, [a], 4, 13)).toBe(DEFAULT_PRECISION_ZOOM.city)
        expect(selectZoomFor(a, [a], 8, 13)).toBe(8)
        expect(selectZoomFor(a, [a], 4, 13, { country: 7 })).toBe(7)
        expect(selectZoomFor(lone, [lone], 4, 13)).toBe(13)
        expect(selectZoomFor(lone, [lone], 4, 9)).toBe(9)
        expect(selectZoomFor(lone, [lone, twin], 4, 13)).toBe(4)
    })

    it('fitMaxZoom: only approximate points lower the fit cap', () => {
        expect(fitMaxZoom([country(1)])).toBe(5)
        expect(fitMaxZoom([country(1), exactOne])).toBe(15)
        expect(fitMaxZoom([])).toBe(15)
    })

    it('pointsToAreas: one bubble per location with "AREA · N", growing radius', () => {
        const fc = pointsToAreas([...eight, country(9, { lat: 1, lng: 1, area: 'MX' }), exactOne])
        expect(fc.features).toHaveLength(2)
        const [big, small] = fc.features.map((f) => f.properties) as Array<{ text: string; r: number; count: number }>
        expect(big!.text).toBe('CA · 8')
        expect(small!.text).toBe('MX · 1')
        expect(big!.r).toBeGreaterThan(small!.r)
    })

    it('rowTitle: declared popup field, then name > title > label > host, then the id', () => {
        expect(rowTitle({ name: 'N' }, 'Declarado', 'id1')).toBe('Declarado')
        expect(rowTitle({ name: 'Nodo', title: 'T' }, undefined, 'id1')).toBe('Nodo')
        expect(rowTitle({ title: 'T', label: 'L' }, undefined, 'id1')).toBe('T')
        expect(rowTitle({ label: ' L ' }, undefined, 'id1')).toBe('L')
        expect(rowTitle({ host: 'h.example.com' }, undefined, 'id1')).toBe('h.example.com')
        expect(rowTitle({ name: '  ', other: 1 }, undefined, '0f8a-uuid')).toBe('0f8a-uuid')
    })
})

describe('approximate points are bubbles', () => {
    it('aggregate per location ("CA · 8") and stay out of the pin source', async () => {
        const map = await mount([...eight, exactOne], { cluster: false })
        const f = map.sources.get('mcm-points-areas').data.features
        expect(f).toHaveLength(1)
        expect(f[0].properties).toMatchObject({ text: 'CA · 8', count: 8 })
        expect(map.sources.get('mcm-points').data.features).toEqual([])
        // No stacked DOM markers for the 8 centroid points.
        expect(markers.map((m) => m.el.getAttribute('aria-label'))).toEqual(['CDMX'])
    })

    it('hover says "8 instancias" and the area', async () => {
        const map = await mount(eight)
        map.emit('mouseenter', { features: [areaFeature(map)] }, 'mcm-points-areas')
        expect(popups.at(-1)!.node?.textContent).toBe('8 instanciasCA')
    })

    it('click fans the members out; pins open a popup; Esc, outside click and zoom-out fold it', async () => {
        const onSelect = vi.fn()
        const map = await mount(eight, { onSelect })
        map.emit('click', { features: [areaFeature(map)] }, 'mcm-points-areas')
        expect(markers).toHaveLength(1)
        const pins = markers[0]!.el.querySelectorAll('button')
        expect(pins).toHaveLength(8)
        expect(document.activeElement).toBe(pins[0])
        fireEvent.click(pins[2]!)
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: 'ca2' }))
        // Country precision: selecting zooms at most to the country cap.
        expect(Math.max(...easeZooms(map))).toBeLessThanOrEqual(DEFAULT_PRECISION_ZOOM.country)
        // Esc folds.
        fireEvent.keyDown(document, { key: 'Escape' })
        expect(markers[0]!.removed).toBe(true)
        // Re-open, then an outside click folds (after the opening click settled).
        map.emit('click', { features: [areaFeature(map)] }, 'mcm-points-areas')
        await new Promise((r) => setTimeout(r, 5))
        map.emit('click', {})
        expect(markers[1]!.removed).toBe(true)
        // Re-open, then zooming out folds.
        map.emit('click', { features: [areaFeature(map)] }, 'mcm-points-areas')
        map.zoom = map.zoom - 2
        map.emit('zoom', {})
        expect(markers[2]!.removed).toBe(true)
    })

    it('a lone approximate point opens its popup directly', async () => {
        const map = await mount([country(1)])
        map.emit('click', { features: [areaFeature(map)] }, 'mcm-points-areas')
        expect(markers).toHaveLength(0)
        expect(popups.at(-1)!.node?.querySelector('strong')?.textContent).toBe('Instancia 1')
    })

    it('does not fly in to max zoom to fit centroids', async () => {
        const map = await mount([country(1)])
        await waitFor(() => expect(easeZooms(map).length).toBeGreaterThan(0))
        expect(easeZooms(map)[0]).toBe(DEFAULT_PRECISION_ZOOM.country)
    })
})

describe('selection zoom by precision', () => {
    const pick = (label: string) => {
        screen.queryByRole('button', { name: /Ver lista/ }) && fireEvent.click(screen.getByRole('button', { name: /Ver lista/ }))
        fireEvent.click(within(screen.getByTestId('map-list')).getByRole('button', { name: label }))
    }
    it('country ≤ 5, city ≤ 10, exact = selectZoom', async () => {
        const pts: MapPointItem[] = [country(1), { ...country(2), key: 'city', label: 'Ciudad', precision: 'city', lat: 5, lng: 5 }, exactOne]
        const map = await mount(pts, { fit: false })
        pick('Instancia 1')
        expect(easeZooms(map).at(-1)).toBe(5)
        pick('Ciudad')
        expect(easeZooms(map).at(-1)).toBe(10)
        pick('CDMX')
        expect(easeZooms(map).at(-1)).toBe(13)
    })
    it('precisionZoom and selectZoom are configurable', async () => {
        const map = await mount([country(1), exactOne], { fit: false, precisionZoom: { country: 3 }, selectZoom: 11 })
        pick('Instancia 1')
        expect(easeZooms(map).at(-1)).toBe(4)
        pick('CDMX')
        expect(easeZooms(map).at(-1)).toBe(11)
    })
})

describe('theme', () => {
    it('halos and bubbles get a lighter, ringed paint on the dark scheme', async () => {
        const light = await mount(eight)
        const lp = light.layers.get('mcm-points-areas').paint
        const lh = light.layers.get('mcm-points-areas-halo').paint['circle-color']
        cleanup()
        resetFakes()
        document.documentElement.classList.add('dark')
        const dark = await mount(eight)
        const dp = dark.layers.get('mcm-points-areas').paint
        expect(dp['circle-color']).not.toBe(lp['circle-color'])
        expect(dp['circle-stroke-color']).toBe('#ffffff')
        expect(dark.layers.get('mcm-points-areas-halo').paint['circle-color']).not.toBe(lh)
        expect(dark.layers.get('mcm-points-halo').paint['circle-color']).toBe('rgba(255,255,255,0.35)')
        // MapLibre rechaza ['zoom'] anidado (['+', ['interpolate', ..., ['zoom'], ...], 6]): el radio es un interpolate de nivel superior.
        for (const layer of ['mcm-points-halo', 'mcm-points-points']) {
            const r = dark.layers.get(layer).paint['circle-radius']
            expect(r[0]).toBe('interpolate')
            expect(JSON.stringify(r.slice(3))).not.toContain('zoom')
        }
    })

    it('the dark blank base is not black', async () => {
        document.documentElement.classList.add('dark')
        const map = await mount(eight)
        expect((map.options.style as any).layers[0].paint['background-color']).not.toBe('#000000')
        expect((map.options.style as any).layers[0].paint['background-color']).toBe('#252a35')
    })
})

describe('viewport limits', () => {
    const setWidth = (w: number) => Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => w })
    afterEach(() => {
        delete (HTMLElement.prototype as any).clientWidth
    })

    it('defaults: one world, capped zoom and pan, minZoom from the container', async () => {
        setWidth(1024)
        const map = await mount([exactOne])
        expect(map.options).toMatchObject({ renderWorldCopies: false, maxZoom: 18, maxBounds: [[-179.99, -84.99], [179.99, 84.99]], minZoom: 1 })
    })

    it('configureMaps overrides the defaults and props override the config', async () => {
        configureMaps({ maxZoom: 16, renderWorldCopies: true, maxBounds: [[-100, 10], [-80, 30]] })
        let map = await mount([exactOne])
        expect(map.options).toMatchObject({ maxZoom: 16, renderWorldCopies: true, maxBounds: [[-100, 10], [-80, 30]] })
        cleanup()
        resetFakes()
        map = await mount([exactOne], { maxZoom: 12, maxBounds: null, minZoom: 3, renderWorldCopies: false })
        expect(map.options.maxBounds).toBeUndefined()
        expect(map.options).toMatchObject({ maxZoom: 12, minZoom: 3, renderWorldCopies: false })
    })

    it('minZoom never exceeds maxZoom', async () => {
        const map = await mount([exactOne], { minZoom: 9, maxZoom: 6 })
        expect(map.options.minZoom).toBe(6)
    })

    it('auto minZoom follows a resize', async () => {
        setWidth(512)
        const map = await mount([exactOne])
        expect(map.options.minZoom).toBe(0)
        setWidth(2048)
        map.emit('resize')
        expect(map.calls.find((c) => c[0] === 'setMinZoom')?.[1]).toBe(2)
    })

    it('a fixed minZoom is not recomputed on resize', async () => {
        const map = await mount([exactOne], { minZoom: 2 })
        map.emit('resize')
        expect(map.calls.some((c) => c[0] === 'setMinZoom')).toBe(false)
    })

    it('fitting stays under the map maxZoom', async () => {
        const map = await mount([exactOne, { key: 'g', lat: 20.6, lng: -103.3, label: 'GDL' }])
        await waitFor(() => expect(map.calls.some((c) => c[0] === 'fitBounds')).toBe(true))
        const fit = map.calls.find((c) => c[0] === 'fitBounds')![2] as { maxZoom: number }
        expect(fit.maxZoom).toBeLessThanOrEqual(map.options.maxZoom)
    })
})
