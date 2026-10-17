import { describe, expect, it } from 'vitest'
import { distanceKm } from '@asteby/storefront/geo'
import { boundsOf, circlePolygon, lineToGeoJSON, pointsToGeoJSON, zonePoints, zonesToGeoJSON } from './geometry'
import { colorFor, safeColor } from './palette'

describe('geometry', () => {
    it('boundsOf ignores invalid points and returns west/south/east/north', () => {
        expect(boundsOf([{ lat: 19.4, lng: -99.1 }, { lat: 20.6, lng: -103.3 }, { lat: 999, lng: 0 }, null])).toEqual([[-103.3, 19.4], [-99.1, 20.6]])
        expect(boundsOf([])).toBeNull()
        expect(boundsOf([{ lat: Number.NaN, lng: 1 }])).toBeNull()
    })

    it('pointsToGeoJSON keeps lng,lat order, drops invalid points and resolves colours', () => {
        const fc = pointsToGeoJSON(
            [
                { key: 'a', lat: 19.4, lng: -99.1, label: 'A', status: 'late' },
                { key: 'b', lat: 200, lng: 0, label: 'B' },
                { key: 'c', lat: 1, lng: 2, label: 'C', color: '#123456' },
                { key: 'd', lat: 1, lng: 2, label: 'D', color: 'url(javascript:1)' },
            ],
            { late: '#ff0000' },
        )
        expect(fc.features.map((f) => f.properties.key)).toEqual(['a', 'c', 'd'])
        expect(fc.features[0]?.geometry.coordinates).toEqual([-99.1, 19.4])
        expect(fc.features[0]?.properties.color).toBe('#ff0000')
        expect(fc.features[1]?.properties.color).toBe('#123456')
        expect(fc.features[2]?.properties.color).not.toContain('url')
    })

    it('lineToGeoJSON needs two valid points', () => {
        expect(lineToGeoJSON([{ lat: 1, lng: 1 }]).features).toHaveLength(0)
        expect(lineToGeoJSON([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]).features[0]?.geometry.type).toBe('LineString')
    })

    it('circlePolygon is closed and every vertex lies at the radius (geodesic)', () => {
        const c = { lat: 19.4326, lng: -99.1332 }
        const ring = circlePolygon(c, 5000)[0] as number[][]
        expect(ring[0]).toEqual(ring[ring.length - 1])
        for (const v of ring) expect(distanceKm(c, { lng: v[0] as number, lat: v[1] as number }) * 1000).toBeGreaterThan(4950)
        for (const v of ring) expect(distanceKm(c, { lng: v[0] as number, lat: v[1] as number }) * 1000).toBeLessThan(5050)
    })

    it('zonesToGeoJSON accepts polygons and circles, skips empty zones', () => {
        const fc = zonesToGeoJSON([
            { key: 'p', label: 'P', polygon: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
            { key: 'c', center: { lat: 10, lng: 10 }, radiusM: 1000 },
            { key: 'x' },
            { key: 'zero', center: { lat: 10, lng: 10 }, radiusM: 0 },
        ])
        expect(fc.features.map((f) => f.properties.key)).toEqual(['p', 'c'])
        expect(zonePoints([{ key: 'p', polygon: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }])).toHaveLength(4)
    })

    it('colours are stable per key and only plain CSS colours are accepted', () => {
        expect(colorFor('in_transit')).toBe(colorFor('in_transit'))
        expect(colorFor('x', { x: '#000' })).toBe('#000')
        expect(safeColor('#0072B2')).toBe('#0072B2')
        expect(safeColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)')
        expect(safeColor('red; background:url(x)')).toBeUndefined()
        expect(safeColor('emerald')).toBeUndefined()
    })
})
