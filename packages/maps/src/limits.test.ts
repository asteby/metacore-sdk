import { describe, expect, it } from 'vitest'
import { DEFAULT_MAP_LIMITS, MAP_EDGE, normalizeBounds, resolveMapLimits } from './limits'

// MapLibre 6 lanza TypeError cuando los limites tocan exactamente +-180 de longitud (verificado con 6.14 real):
// ningun limite que salga de resolveMapLimits puede llegar a ese extremo.
describe('limites del mapa', () => {
    it('el valor por defecto no toca +-180 ni +-85', () => {
        const [[w, s], [e, n]] = DEFAULT_MAP_LIMITS.maxBounds as [[number, number], [number, number]]
        expect([w, e].every((v) => Math.abs(v) < 180)).toBe(true)
        expect([s, n].every((v) => Math.abs(v) < 85)).toBe(true)
    })

    it('normalizeBounds recorta al margen seguro', () => {
        expect(normalizeBounds([[-180, -85], [180, 85]])).toEqual([[-MAP_EDGE.lng, -MAP_EDGE.lat], [MAP_EDGE.lng, MAP_EDGE.lat]])
        expect(normalizeBounds([[-360, -90], [360, 90]])).toEqual([[-MAP_EDGE.lng, -MAP_EDGE.lat], [MAP_EDGE.lng, MAP_EDGE.lat]])
    })

    it('deja intactos los limites validos y descarta los invalidos', () => {
        expect(normalizeBounds([[-100, 10], [-80, 30]])).toEqual([[-100, 10], [-80, 30]])
        expect(normalizeBounds(null)).toBeUndefined()
        expect(normalizeBounds(undefined)).toBeUndefined()
        expect(normalizeBounds([[Number.NaN, 0], [1, 1]])).toBeUndefined()
    })

    it('resolveMapLimits normaliza tambien los limites del host y del propio mapa', () => {
        const size = { width: 1264, height: 560 }
        expect(resolveMapLimits({ maxBounds: [[-180, -85], [180, 85]] }, {}, size).maxBounds).toEqual([[-MAP_EDGE.lng, -MAP_EDGE.lat], [MAP_EDGE.lng, MAP_EDGE.lat]])
        expect(resolveMapLimits({}, { maxBounds: [[-180, -90], [180, 90]] }, size).maxBounds).toEqual([[-MAP_EDGE.lng, -MAP_EDGE.lat], [MAP_EDGE.lng, MAP_EDGE.lat]])
        expect(resolveMapLimits({}, { maxBounds: null }, size).maxBounds).toBeUndefined()
    })
})
