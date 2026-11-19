import { describe, expect, it } from 'vitest'
import { POINT_RADIUS_STOPS, zoomRadius } from './layers'

describe('expresiones de radio por zoom', () => {
    it('son un interpolate de nivel superior sobre ["zoom"] (MapLibre no admite zoom anidado)', () => {
        for (const extra of [0, 6]) {
            const e = zoomRadius(extra) as unknown[]
            expect(e.slice(0, 3)).toEqual(['interpolate', ['linear'], ['zoom']])
            expect(JSON.stringify(e.slice(3))).not.toContain('zoom')
        }
    })

    it('el margen del halo se suma a cada parada, sin tocar los zooms', () => {
        const base = zoomRadius(0) as unknown[]
        const halo = zoomRadius(6) as unknown[]
        const stops = (e: unknown[]) => e.slice(3) as number[]
        expect(stops(base)).toEqual(POINT_RADIUS_STOPS.flatMap(([z, r]) => [z, r]))
        expect(stops(halo)).toEqual(POINT_RADIUS_STOPS.flatMap(([z, r]) => [z, r + 6]))
    })
})
