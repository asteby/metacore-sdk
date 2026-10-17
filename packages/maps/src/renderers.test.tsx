// @vitest-environment happy-dom
// The kernel's declarative contract end to end: register the renderers with
// the runtime registry, then render a `map` view and `map`/`timeline` panels
// from manifest fragments (the `shipping` example of the kernel) against an
// in-memory ViewDataSource. MapLibre is the recording fake.
import * as React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DeclarativeView, DetailPanels, hasPanelRenderer, hasViewRenderer, type ViewDataSource } from '@asteby/metacore-runtime-react'
import type { DetailPanel, NavView } from '@asteby/metacore-sdk'
import { configureMaps, resetMapsConfig } from './config'
import { fakeMaplibre, instances, markers, resetFakes } from './fake-maplibre'
import { registerMapRenderers } from './register'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, d?: unknown) => (typeof d === 'string' ? d : k),
    }),
}))

const shipments = [
    { id: 's1', tracking_number: 'TRK-1', carrier: 'dhl', status: 'in_transit', dest_lat: 19.43, dest_lng: -99.13 },
    { id: 's2', tracking_number: 'TRK-2', carrier: 'fedex', status: 'delivered', dest_lat: '20.67', dest_lng: '-103.35' },
    { id: 's3', tracking_number: 'TRK-3', carrier: 'dhl', status: 'created', dest_lat: null, dest_lng: null },
]
const branches = [{ id: 'b1', name: 'Sucursal Centro', lat: 19.4, lng: -99.15 }]
const zones = [{ id: 'z1', name: 'Zona Centro', area: { type: 'Polygon', coordinates: [[[-99.2, 19.4], [-99.1, 19.4], [-99.1, 19.5], [-99.2, 19.4]]] } }]
const stops = [
    { id: 'p2', shipment_id: 's1', seq: 2, lat: 19.9, lng: -100.2 },
    { id: 'p1', shipment_id: 's1', seq: 1, lat: 19.4, lng: -99.1 },
]
const trackEvents = [
    { id: 'e1', at: '2026-10-16T10:00:00Z', status: 'picked_up', description: 'Recolectado', city: 'CDMX', lat: 19.4, lng: -99.1 },
    { id: 'e2', at: '2026-10-17T09:00:00Z', status: 'in_transit', description: 'En tránsito', city: 'Querétaro', lat: 20.59, lng: -100.39 },
]

function source(over: Partial<ViewDataSource> = {}) {
    const list = vi.fn(async (model: string) => {
        const rows: Record<string, Record<string, unknown>[]> = { Shipment: shipments, Branch: branches, Zone: zones, ShipmentStop: stops }
        return { rows: rows[model] ?? [], total: rows[model]?.length ?? 0 }
    })
    const ds: ViewDataSource = {
        list,
        record: async () => null,
        chart: async () => ({}),
        capability: vi.fn(async () => ({ events: trackEvents })),
        ...over,
    }
    return Object.assign(ds, { list: over.list ?? list })
}

const metadata = {
    columns: [
        {
            key: 'status',
            label: 'Estado',
            type: 'select',
            options: [
                { value: 'in_transit', label: 'En tránsito', color: '#0072B2' },
                { value: 'delivered', label: 'Entregado', color: 'emerald' },
            ],
        },
        { key: 'carrier', label: 'Paquetería', type: 'text' },
    ],
    relations: [{ name: 'stops', through: 'ShipmentStop', foreign_key: 'shipment_id' }],
} as never

let restore: () => void
beforeEach(() => {
    resetMapsConfig()
    resetFakes()
    configureMaps({ loadMaplibre: async () => fakeMaplibre, supportsWebGL: () => true })
})
afterEach(() => {
    cleanup()
    restore?.()
})

describe('registerMapRenderers', () => {
    it('registers the map view and the map/timeline panels, and restores on undo', () => {
        restore = registerMapRenderers()
        expect(hasViewRenderer('map')).toBe(true)
        expect(hasPanelRenderer('map')).toBe(true)
        expect(hasPanelRenderer('timeline')).toBe(true)
    })

    it('can leave the built-in timeline panel alone', async () => {
        restore = registerMapRenderers({ timeline: false })
        const panel: DetailPanel = {
            key: 'events',
            kind: 'timeline',
            title: 'x',
            timeline: { date_field: 'at', title_field: 'description', source: { capability: 'c', items: 'events' } },
        }
        render(<DetailPanels panels={[panel]} model="Shipment" record={shipments[0]!} metadata={metadata} data={source()} />)
        expect(await screen.findByTestId('timeline')).toBeTruthy() // the runtime's own
        expect(screen.queryByTestId('tracking-timeline')).toBeNull()
    })

    it('accepts host configuration', async () => {
        restore = registerMapRenderers({ config: { style: { light: 'https://cdn.example.com/l.json' } } })
        render(<DeclarativeView viewType="map" view={{ map: { point: { lat: 'dest_lat', lng: 'dest_lng' } } }} model="Shipment" data={source()} />)
        await waitFor(() => expect(instances).toHaveLength(1))
        expect(instances[0]?.options.style).toBe('https://cdn.example.com/l.json')
    })
})

describe('view_type: map', () => {
    const view: NavView = {
        map: {
            point: { lat: 'dest_lat', lng: 'dest_lng' },
            color_by: 'status',
            popup: ['tracking_number', 'carrier', 'status'],
            layers: [
                { kind: 'points', model: 'Branch', point: { lat: 'lat', lng: 'lng' }, label: 'name' },
                { kind: 'zones', model: 'Zone', geometry: 'area', label: 'name' },
            ],
        },
    }

    it('draws shipments, branches and zones; skips rows without coordinates', async () => {
        restore = registerMapRenderers()
        render(<DeclarativeView viewType="map" view={view} model="Shipment" metadata={metadata} data={source()} />)
        await waitFor(() => expect(screen.getByTestId('metacore-map').getAttribute('data-status')).toBe('ready'))
        const names = await waitFor(() => {
            const n = screen.getAllByRole('button', { pressed: false }).map((b) => b.getAttribute('aria-label'))
            expect(n.length).toBeGreaterThanOrEqual(3)
            return n
        })
        // Status is spelled with the model's option label, not the key.
        expect(names).toContain('TRK-1, En tránsito')
        expect(names).toContain('Sucursal Centro, Branch')
        expect(markers).toHaveLength(3)
        await waitFor(() => expect(instances[0]?.layers.has('mcm-zones-fill')).toBe(true))
    })

    it('lists the same features for non-visual users, with popup columns by their labels', async () => {
        restore = registerMapRenderers()
        render(<DeclarativeView viewType="map" view={view} model="Shipment" metadata={metadata} data={source()} />)
        await waitFor(() => expect(screen.getByRole('button', { name: 'Ver lista' })).toBeTruthy())
        fireEvent.click(screen.getByRole('button', { name: 'Ver lista' }))
        const list = screen.getByTestId('map-list')
        expect(list.textContent).toContain('Paquetería: dhl')
        expect(list.textContent).toContain('Entregado')
        expect(screen.getByLabelText('Zona').textContent).toContain('Zona Centro')
    })

    it('opens the record the user selected', async () => {
        restore = registerMapRenderers()
        const onOpenRecord = vi.fn()
        render(<DeclarativeView viewType="map" view={view} model="Shipment" metadata={metadata} data={source()} onOpenRecord={onOpenRecord} />)
        await waitFor(() => expect(markers.length).toBeGreaterThan(0))
        fireEvent.click(markers.find((m) => m.el.getAttribute('aria-label')?.startsWith('TRK-1'))!.el)
        fireEvent.click(await screen.findByRole('button', { name: 'TRK-1' }))
        expect(onOpenRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }))
    })

    it('shows an error state when the data cannot be read', async () => {
        restore = registerMapRenderers()
        render(<DeclarativeView viewType="map" view={view} model="Shipment" data={source({ list: async () => Promise.reject(new Error('x')) })} />)
        expect(await screen.findByRole('alert')).toBeTruthy()
    })

    it('without WebGL the registered renderer degrades to the list', async () => {
        configureMaps({ supportsWebGL: () => false })
        restore = registerMapRenderers()
        render(<DeclarativeView viewType="map" view={view} model="Shipment" metadata={metadata} data={source()} />)
        expect(await screen.findByTestId('map-unavailable')).toBeTruthy()
        expect(screen.getByTestId('map-list').querySelectorAll('li').length).toBeGreaterThanOrEqual(3)
    })
})

describe('detail panels', () => {
    const mapPanel: DetailPanel = {
        key: 'route',
        kind: 'map',
        title: 'shipping.panels.route',
        map: { point: { lat: 'dest_lat', lng: 'dest_lng' }, popup: ['tracking_number'], route: { relation: 'stops', point: { lat: 'lat', lng: 'lng' }, order_by: 'seq' } },
    }
    const timelinePanel: DetailPanel = {
        key: 'events',
        kind: 'timeline',
        title: 'shipping.panels.events',
        timeline: {
            date_field: 'at',
            title_field: 'description',
            status_field: 'status',
            source: { capability: 'commerce.shipping.track', input: { tracking_number: 'record.tracking_number' }, items: 'events' },
        },
    }

    it('map panel: the record plus its ordered route as a line with numbered stops', async () => {
        restore = registerMapRenderers()
        render(<DetailPanels panels={[mapPanel]} model="Shipment" record={shipments[0]!} metadata={metadata} data={source()} />)
        await waitFor(() => expect(instances[0]?.sources.get('mcm-line')).toBeTruthy())
        // seq order, not row order: stop 1 is p1 (19.4, -99.1).
        expect(instances[0]?.sources.get('mcm-line').data.features[0].geometry.coordinates[0]).toEqual([-99.1, 19.4])
        await waitFor(() => expect(markers.map((m) => m.el.textContent)).toEqual(expect.arrayContaining(['1', '2'])))
    })

    it('timeline panel: capability events as a tracking timeline with place links', async () => {
        restore = registerMapRenderers()
        const data = source()
        render(<DetailPanels panels={[timelinePanel]} model="Shipment" record={shipments[0]!} metadata={metadata} data={data} />)
        const tl = await screen.findByTestId('tracking-timeline')
        expect(data.capability).toHaveBeenCalledWith('commerce.shipping.track', { tracking_number: 'TRK-1' })
        const items = tl.querySelectorAll('li')
        expect(items).toHaveLength(2)
        expect(items[0]?.textContent).toContain('in_transit')
        expect(items[0]?.textContent).toContain('Querétaro')
        expect(items[0]?.getAttribute('aria-current')).toBe('step')
        expect(screen.getAllByRole('link', { name: 'Ver en mapa' })).toHaveLength(2)
    })

    it('timeline panel: an error is announced, not swallowed', async () => {
        restore = registerMapRenderers()
        render(<DetailPanels panels={[timelinePanel]} model="Shipment" record={shipments[0]!} metadata={metadata} data={source({ capability: async () => Promise.reject(new Error('down')) })} />)
        expect(await screen.findByRole('alert')).toBeTruthy()
    })
})
