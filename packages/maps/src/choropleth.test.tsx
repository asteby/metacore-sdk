// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { configureMaps, resetMapsConfig } from './config'
import { fakeMaplibre, instances, resetFakes } from './fake-maplibre'
import { ChoroplethLayer, ChoroplethList, useChoropleth } from './layers'
import { MapView } from './map-view'
import { buildChoropleth, toRegionCollection, type RegionCollection } from './choropleth'

const sq = (x: number) => [[[x, 0], [x + 1, 0], [x + 1, 1], [x, 1], [x, 0]]]
const geo: RegionCollection = {
    type: 'FeatureCollection',
    features: [
        { type: 'Feature', properties: { key: 'A', name: 'Alfa' }, geometry: { type: 'Polygon', coordinates: sq(0) } },
        { type: 'Feature', properties: { key: 'B', name: 'Beta' }, geometry: { type: 'Polygon', coordinates: sq(2) } },
        { type: 'Feature', properties: { key: 'C', name: 'Gamma' }, geometry: { type: 'Polygon', coordinates: sq(4) } },
    ],
}
const values = { A: 10, B: 100 }

beforeEach(() => {
    resetMapsConfig()
    resetFakes()
    configureMaps({ loadMaplibre: async () => fakeMaplibre, supportsWebGL: () => true })
})
afterEach(cleanup)

describe('<ChoroplethLayer>', () => {
    it('loads the geometry only on mount, then adds source + layers and removes them on unmount', async () => {
        const loader = vi.fn(async () => ({ default: geo }))
        const { unmount } = render(
            <MapView points={[]}>
                <ChoroplethLayer loader={loader} values={values} />
            </MapView>,
        )
        await waitFor(() => expect(screen.getByTestId('metacore-map').getAttribute('data-status')).toBe('ready'))
        await waitFor(() => expect(instances[0]!.layers.has('mcm-choropleth-fill')).toBe(true))
        expect(loader).toHaveBeenCalledTimes(1)
        const map = instances[0]!
        expect(map.sources.get('mcm-choropleth').data.features).toHaveLength(3)
        expect(map.layers.get('mcm-choropleth-line')).toBeTruthy()
        unmount()
        expect(map.layers.size).toBe(0)
        expect(map.sources.size).toBe(0)
    })

    it('does not call the loader until something mounts (dynamic import)', async () => {
        const loader = vi.fn(() => import('./choropleth').then(() => geo))
        expect(loader).not.toHaveBeenCalled()
        render(
            <MapView points={[]}>
                <ChoroplethLayer loader={loader} values={values} />
            </MapView>,
        )
        await waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    })

    it('feeds the accessible list with every region and its value', async () => {
        function Both() {
            const s = useChoropleth({ loader: async () => geo, values })
            return <ChoroplethList regions={s.regions} label="Ventas" noData="Sin datos" formatValue={(v) => `${v} u.`} />
        }
        render(<Both />)
        await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3))
        const rows = screen.getAllByRole('row').map((r) => r.textContent)
        expect(rows).toEqual(['Alfa10 u.', 'Beta100 u.', 'GammaSin datos'])
        expect(screen.getByRole('table', { name: 'Ventas' })).toBeTruthy()
    })
})

describe('buildChoropleth / toRegionCollection', () => {
    it('bins values on a ramp and greys regions without data', () => {
        const r = buildChoropleth(geo, values, { steps: 4 })
        expect(r.regions.map((x) => x.step)).toEqual([0, 3, -1])
        expect(r.steps).toHaveLength(4)
        expect(r.regions[2]!.color).toBe('#D1D5DB')
        expect(r.regions[0]!.color).not.toBe(r.regions[1]!.color)
    })

    it('decodes TopoJSON (quantised arcs) into polygons', () => {
        const topo = {
            type: 'Topology' as const,
            transform: { scale: [1, 1] as [number, number], translate: [10, 20] as [number, number] },
            arcs: [[[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]],
            objects: { r: { type: 'GeometryCollection', geometries: [{ type: 'Polygon', id: 'X', properties: { name: 'Equis' }, arcs: [[0]] }] } },
        }
        const c = toRegionCollection(topo as never)
        expect(c.features[0]!.geometry!.coordinates).toEqual([[[10, 20], [11, 20], [11, 21], [10, 21], [10, 20]]])
        expect(buildChoropleth(c, { X: 1 }, { keyProperty: 'nope' }).regions[0]!.key).toBe('X')
    })
})
