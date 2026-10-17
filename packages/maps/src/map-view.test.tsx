// @vitest-environment happy-dom
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { configureMaps, resetMapsConfig } from './config'
import { fakeMaplibre, instances, markers, popups, protocols, resetFakes } from './fake-maplibre'
import { ClusterLayer, Geofence, Marker, Polyline, Route } from './layers'
import { MapView } from './map-view'
import type { MapPointItem } from './types'

const pts: MapPointItem[] = [
    { key: 'a', lat: 19.43, lng: -99.13, label: 'TRK-1', status: 'in_transit', statusLabel: 'En tránsito', details: [{ label: 'Carrier', value: 'DHL' }] },
    { key: 'b', lat: 20.67, lng: -103.35, label: 'TRK-2', status: 'delivered', statusLabel: 'Entregado' },
]

beforeEach(() => {
    resetMapsConfig()
    resetFakes()
    configureMaps({ loadMaplibre: async () => fakeMaplibre, supportsWebGL: () => true })
})
afterEach(() => {
    cleanup()
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme')
})

const ready = () => waitFor(() => expect(screen.getByTestId('metacore-map').getAttribute('data-status')).toBe('ready'))

describe('<MapView>', () => {
    it('loads MapLibre lazily, shows a status while loading, then draws one focusable marker per point', async () => {
        render(<MapView points={pts} />)
        expect(screen.getByTestId('metacore-map').getAttribute('data-status')).toBe('loading')
        await ready()
        expect(instances).toHaveLength(1)
        const labels = screen.getAllByRole('button', { pressed: false }).map((b) => b.getAttribute('aria-label'))
        expect(labels).toContain('TRK-1, En tránsito')
        expect(labels).toContain('TRK-2, Entregado')
        expect(markers.map((m) => m.lngLat)).toEqual([[-99.13, 19.43], [-103.35, 20.67]])
    })

    it('fits the viewport to the data (instant under reduced motion)', async () => {
        render(<MapView points={pts} />)
        await ready()
        await waitFor(() => expect(instances[0]?.calls.some((c) => c[0] === 'fitBounds')).toBe(true))
        const fit = instances[0]?.calls.find((c) => c[0] === 'fitBounds')
        expect(fit?.[1]).toEqual([[-103.35, 19.43], [-99.13, 20.67]])
    })

    it('needs no API key and no style: draws on a themed blank background', async () => {
        render(<MapView points={pts} />)
        await ready()
        const style = instances[0]?.options.style
        expect(style.version).toBe(8)
        expect(style.sources).toEqual({})
        expect(style.layers[0].type).toBe('background')
    })

    it('uses the style URL the host configured, per colour scheme', async () => {
        configureMaps({ style: { light: 'https://cdn.example.com/light.json', dark: 'https://cdn.example.com/dark.json' } })
        document.documentElement.classList.add('dark')
        render(<MapView points={pts} />)
        await ready()
        expect(instances[0]?.options.style).toBe('https://cdn.example.com/dark.json')
        expect(screen.getByTestId('metacore-map').getAttribute('data-scheme')).toBe('dark')
    })

    it('swaps the base style when the host theme changes and layers re-add themselves', async () => {
        configureMaps({ style: { light: 'https://cdn.example.com/light.json', dark: 'https://cdn.example.com/dark.json' } })
        render(
            <MapView points={[]}>
                <Polyline path={[{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]} />
            </MapView>,
        )
        await ready()
        const map = instances[0]!
        expect(map.layers.has('mcm-line')).toBe(true)
        await act(async () => {
            document.documentElement.classList.add('dark')
            await Promise.resolve()
        })
        await waitFor(() => expect(map.calls.find((c) => c[0] === 'setStyle')?.[1]).toBe('https://cdn.example.com/dark.json'))
        // setStyle wiped the layers; `style.load` makes the Polyline add itself again.
        await waitFor(() => expect(map.layers.has('mcm-line')).toBe(true))
    })

    it('registers the pmtiles protocol only when the style needs it and the host provided it', async () => {
        class Protocol {
            tile = () => undefined
        }
        configureMaps({ style: { light: 'pmtiles://https://cdn.example.com/mx.pmtiles' }, pmtiles: async () => ({ Protocol }) })
        render(<MapView points={pts} />)
        await ready()
        expect(protocols).toEqual(['pmtiles'])
    })

    it('falls back to the list with a message when WebGL is missing', () => {
        configureMaps({ supportsWebGL: () => false })
        render(<MapView points={pts} />)
        expect(screen.getByTestId('map-unavailable')).toBeTruthy()
        expect(instances).toHaveLength(0)
        expect(screen.getByTestId('map-list').querySelectorAll('li')).toHaveLength(2)
    })

    it('falls back to the list when MapLibre fails to load', async () => {
        configureMaps({
            loadMaplibre: async () => {
                throw new Error('chunk failed')
            },
        })
        render(<MapView points={pts} />)
        await waitFor(() => expect(screen.getByTestId('map-unavailable')).toBeTruthy())
        expect(screen.getByTestId('map-list')).toBeTruthy()
    })

    it('offers the equivalent list: status written out, open-in-map link, select centres the map', async () => {
        const onSelect = vi.fn()
        render(<MapView points={pts} onSelect={onSelect} />)
        await ready()
        const toggle = screen.getByRole('button', { name: 'Ver lista' })
        expect(toggle.getAttribute('aria-expanded')).toBe('false')
        fireEvent.click(toggle)
        expect(toggle.getAttribute('aria-expanded')).toBe('true')
        const list = screen.getByTestId('map-list')
        expect(list.textContent).toContain('En tránsito')
        expect(list.textContent).toContain('Carrier: DHL')
        const link = screen.getByRole('link', { name: 'Abrir en mapa: TRK-1' })
        expect(link.getAttribute('href')).toContain('openstreetmap.org')
        expect(link.getAttribute('rel')).toContain('noopener')
        fireEvent.click(screen.getByRole('button', { name: 'TRK-2' }))
        expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ key: 'b' }))
        expect(instances[0]?.calls.filter((c) => c[0] === 'easeTo').pop()?.[1]).toMatchObject({ center: [-103.35, 20.67] })
    })

    it('shows an empty state without points', () => {
        configureMaps({ supportsWebGL: () => false })
        render(<MapView points={[]} />)
        expect(screen.getByTestId('map-empty').textContent).toContain('No hay ubicaciones')
    })

    it('marker click opens a popup built from data as text (no HTML injection)', async () => {
        const evil: MapPointItem[] = [{ key: 'x', lat: 1, lng: 1, label: '<img src=x onerror=alert(1)>' }]
        render(<MapView points={evil} />)
        await ready()
        expect(markers).toHaveLength(1)
        await waitFor(() => expect(popups.length).toBeGreaterThan(0))
        expect(document.querySelector('img')).toBeNull()
        expect(popups[0]?.node?.textContent).toContain('<img src=x')
    })

    it('clusters above the threshold with a GeoJSON source instead of a DOM marker per point', async () => {
        const many = Array.from({ length: 300 }, (_, i): MapPointItem => ({ key: String(i), lat: 19 + i / 1000, lng: -99 - i / 1000, label: `P${i}` }))
        render(<MapView points={many} />)
        await ready()
        const map = instances[0]!
        await waitFor(() => expect(map.sources.get('mcm-points')?.cluster).toBe(true))
        expect(map.sources.get('mcm-points').data.features).toHaveLength(300)
        expect(markers).toHaveLength(0)
        expect([...map.layers.keys()]).toEqual(expect.arrayContaining(['mcm-points-clusters', 'mcm-points-points']))
        // No glyphs in the blank style → no symbol layer for counts.
        expect(map.layers.has('mcm-points-count')).toBe(false)
    })

    it('removes the map on unmount', async () => {
        const { unmount } = render(<MapView points={pts} />)
        await ready()
        unmount()
        expect(instances[0]?.removed).toBe(true)
        expect(markers.every((m) => m.removed)).toBe(true)
    })
})

describe('layers', () => {
    it('ClusterLayer updates its source when the points change', async () => {
        function Host({ n }: { n: number }) {
            return (
                <MapView points={[]}>
                    <ClusterLayer points={pts.slice(0, n)} />
                </MapView>
            )
        }
        const { rerender } = render(<Host n={2} />)
        await ready()
        const map = instances[0]!
        expect(map.sources.get('mcm-points').data.features).toHaveLength(2)
        rerender(<Host n={1} />)
        await waitFor(() => expect(map.sources.get('mcm-points').data.features).toHaveLength(1))
    })

    it('Route draws the line and numbered, labelled stops', async () => {
        render(
            <MapView points={[]}>
                <Route path={[{ lat: 19, lng: -99 }, { lat: 20, lng: -100 }, { lat: 21, lng: -101 }]} color="#D55E00" />
            </MapView>,
        )
        await ready()
        const map = instances[0]!
        expect(map.layers.get('mcm-line').paint['line-color']).toBe('#D55E00')
        expect(map.sources.get('mcm-line').data.features[0].geometry.coordinates).toHaveLength(3)
        expect(screen.getAllByRole('button', { name: /^Parada \d$/ })).toHaveLength(3)
        expect(markers.map((m) => m.el.textContent)).toEqual(['1', '2', '3'])
    })

    it('Geofence turns circles and polygons into fill + outline layers', async () => {
        render(
            <MapView points={[]}>
                <Geofence zones={[{ key: 'z1', label: 'Zona 1', center: { lat: 19.4, lng: -99.1 }, radiusM: 3000 }]} fit />
            </MapView>,
        )
        await ready()
        const map = instances[0]!
        expect(map.layers.has('mcm-zones-fill')).toBe(true)
        expect(map.layers.has('mcm-zones-line')).toBe(true)
        expect(map.sources.get('mcm-zones').data.features[0].geometry.type).toBe('Polygon')
        await waitFor(() => expect(map.calls.some((c) => c[0] === 'fitBounds')).toBe(true))
    })

    it('Marker reports a finished drag', async () => {
        const onDragEnd = vi.fn()
        render(
            <MapView points={[]}>
                <Marker lat={1} lng={1} label="Pin" draggable onDragEnd={onDragEnd} />
            </MapView>,
        )
        await ready()
        markers[0]!.dragTo(-99.5, 19.5)
        expect(onDragEnd).toHaveBeenCalledWith({ lat: 19.5, lng: -99.5 })
    })

    it('Marker outside a MapView is a programming error with a clear message', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        expect(() => render(<Marker lat={1} lng={1} label="x" />)).toThrow(/inside <MapView>/)
        spy.mockRestore()
    })
})
