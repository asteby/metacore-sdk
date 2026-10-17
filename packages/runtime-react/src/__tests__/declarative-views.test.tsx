// @vitest-environment happy-dom
//
// Declarative views (view_type map/timeline/calendar/chart/split) and detail
// panels: registry by type (lazy), pure mappers each renderer uses, and real
// renders against an in-memory ViewDataSource. Manifest fragments come from the
// kernel example (docs/spec/v3/examples/addon-ui-example.json, shipping).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { DetailPanel, NavView } from '@asteby/metacore-sdk'

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, d?: unknown, o?: Record<string, unknown>) => {
            const s = typeof d === 'string' ? d : k
            const vars = (typeof d === 'object' ? d : o) as Record<string, unknown> | undefined
            return s.replace(/\{\{(\w+)\}\}/g, (_, v) => String(vars?.[v] ?? ''))
        },
    }),
}))

class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
}
;(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? ResizeObserverStub

import {
    DeclarativeView,
    DetailPanels,
    hasViewRenderer,
    isDeclarativeViewType,
    preloadViewRenderer,
    registerPanelRenderer,
    registerViewRenderer,
} from '../views/registry'
import { createApiViewDataSource, pickItems, resolveCapabilityInput } from '../views/data-source'
import type { ViewDataSource, ViewRendererProps } from '../views/types'
import { toTimelineEntries } from '../views/timeline-view'
import { bucketByDay, monthRange, toCalendarEntries } from '../views/calendar-view'
import { openInMapHref, rowCoordinates, toMapFeatures, toRoutePoints } from '../views/map-view'
import { formatStat } from '../views/panels'
import { hiddenColumnsFor } from '../views/split-view'
import { resolveViewKind } from '../dynamic-view'
import type { TableMetadata } from '../types'

afterEach(cleanup)

const shipments = [
    { id: 's1', tracking_number: 'TRK-1', carrier: 'dhl', status: 'in_transit', eta: '2026-10-20', dest_lat: 19.43, dest_lng: -99.13 },
    { id: 's2', tracking_number: 'TRK-2', carrier: 'fedex', status: 'delivered', eta: '2026-10-18', dest_lat: '20.67', dest_lng: '-103.35' },
    { id: 's3', tracking_number: 'TRK-3', carrier: 'dhl', status: 'created', eta: null, dest_lat: null, dest_lng: null },
]
const events = [
    { id: 'e1', shipment_id: 's1', at: '2026-10-16T10:00:00Z', status: 'picked_up', description: 'Recolectado', lat: 19.4, lng: -99.1 },
    { id: 'e2', shipment_id: 's1', at: '2026-10-17T09:00:00Z', status: 'in_transit', description: 'En tránsito', lat: 19.9, lng: -100.2 },
]

function memorySource(over: Partial<ViewDataSource> = {}): ViewDataSource & { list: ReturnType<typeof vi.fn> } {
    const list = vi.fn(async (model: string) => {
        if (model === 'ShipmentEvent') return { rows: events, total: events.length }
        return { rows: shipments, total: shipments.length }
    })
    return {
        list,
        record: vi.fn(async (_m: string, id: string) => shipments.find((s) => s.id === id) ?? null),
        chart: vi.fn(async () => ({ series: [{ key: 'dhl', label: 'DHL', value: 2 }] })),
        capability: vi.fn(async () => ({ status: 'in_transit', events })),
        ...over,
    } as ViewDataSource & { list: ReturnType<typeof vi.fn> }
}

const metadata = {
    title: 'Envíos',
    columns: [
        { key: 'tracking_number', label: 'Guía' },
        { key: 'carrier', label: 'Paquetería' },
        { key: 'status', label: 'Estado' },
        { key: 'eta', label: 'ETA' },
        { key: 'cost', label: 'Costo' },
    ],
    relations: [{ name: 'events', kind: 'one_to_many', through: 'ShipmentEvent', foreign_key: 'shipment_id' }],
} as unknown as TableMetadata

describe('registry', () => {
    it('knows the declarative types; table/kanban stay with DynamicView', () => {
        for (const t of ['map', 'timeline', 'calendar', 'chart', 'split']) {
            expect(isDeclarativeViewType(t)).toBe(true)
            expect(hasViewRenderer(t)).toBe(true)
        }
        expect(isDeclarativeViewType('table')).toBe(false)
        expect(isDeclarativeViewType('kanban')).toBe(false)
    })

    it('resolveViewKind needs the view block (hosts that do not serve it keep the table)', () => {
        expect(resolveViewKind('map', { view: { map: { point: { lat: 'a', lng: 'b' } } } })).toBe('declarative')
        expect(resolveViewKind('map', {})).toBe('table')
        expect(resolveViewKind('kanban', null)).toBe('kanban')
        expect(resolveViewKind(undefined, null)).toBe('table')
    })

    it('preloads a renderer chunk by type and reports unknown ones', async () => {
        await expect(preloadViewRenderer('timeline')).resolves.toBe(true)
        await expect(preloadViewRenderer('gantt')).resolves.toBe(false)
    })

    it('a maps package can replace the map renderer; restore brings the fallback back', async () => {
        function FakeMap(p: ViewRendererProps<'map'>) {
            return <div data-testid="real-map">{p.model}</div>
        }
        const restore = registerViewRenderer('map', async () => ({ default: FakeMap }))
        const view: NavView = { map: { point: { lat: 'dest_lat', lng: 'dest_lng' } } }
        render(<DeclarativeView viewType="map" view={view} model="Shipment" data={memorySource()} />)
        await waitFor(() => expect(screen.getByTestId('real-map').textContent).toBe('Shipment'))
        restore()
        cleanup()
        render(<DeclarativeView viewType="map" view={view} model="Shipment" data={memorySource()} />)
        await waitFor(() => expect(screen.getByTestId('map-view-fallback')).toBeTruthy())
    })

    it('unknown type or missing block renders the fallback', () => {
        render(
            <DeclarativeView
                viewType="gantt"
                view={{}}
                model="Shipment"
                data={memorySource()}
                fallback={<p data-testid="table">table</p>}
            />,
        )
        expect(screen.getByTestId('table')).toBeTruthy()
    })
})

describe('data source helpers', () => {
    it('maps capability input from the record (record.<col> | const:<lit>)', () => {
        expect(
            resolveCapabilityInput({ tracking_number: 'record.tracking_number', carrier: 'const:dhl' }, shipments[0]),
        ).toEqual({ tracking_number: 'TRK-1', carrier: 'dhl' })
        expect(() => resolveCapabilityInput({ x: '$record.y' }, {})).toThrow(/unsupported reference/)
    })

    it('picks the items array by dot path', () => {
        expect(pickItems({ data: { events } }, 'data.events')).toHaveLength(2)
        expect(pickItems({ events: 'nope' }, 'events')).toEqual([])
    })

    it('default api source speaks the kernel list syntax and the host chart endpoint', async () => {
        const api = {
            get: vi.fn(async () => ({ data: { success: true, data: shipments, meta: { total: 3 } } })),
            post: vi.fn(async () => ({ data: { success: true, data: { value: 3 } } })),
            put: vi.fn(),
            delete: vi.fn(),
        }
        const ds = createApiViewDataSource(api)
        await expect(ds.list('Shipment', { per_page: 5 })).resolves.toEqual({ rows: shipments, total: 3 })
        expect(api.get).toHaveBeenCalledWith('/data/Shipment', { params: { per_page: 5 } })
        await ds.chart({ model: 'Shipment', query: { model: 'Shipment', group_by: 'carrier' } })
        expect(api.post).toHaveBeenCalledWith('/views/chart', expect.objectContaining({ model: 'Shipment' }))
    })
})

describe('pure mappers', () => {
    it('timeline: newest first, status/description/group', () => {
        const entries = toTimelineEntries(events, {
            date_field: 'at',
            title_field: 'description',
            status_field: 'status',
            group_by: 'shipment_id',
        })
        expect(entries.map((e) => e.title)).toEqual(['En tránsito', 'Recolectado'])
        expect(entries[0].status).toBe('in_transit')
        expect(entries[0].group).toBe('s1')
    })

    it('calendar: month range, entries without start dropped, multi-day spans', () => {
        expect(monthRange(new Date(2026, 1, 10))).toEqual({ first: '2026-02-01', last: '2026-02-28' })
        const entries = toCalendarEntries(
            [...shipments, { id: 'x', tracking_number: 'TRK-X', eta: '2026-10-21', end: '2026-10-23' }],
            { start_field: 'eta', end_field: 'end', title_field: 'tracking_number', color_by: 'status' },
        )
        expect(entries.map((e) => e.title)).toEqual(['TRK-1', 'TRK-2', 'TRK-X'])
        expect(entries[0].allDay).toBe(true)
        const days = bucketByDay(entries)
        expect(days.get('2026-10-22')?.map((e) => e.title)).toEqual(['TRK-X'])
        expect(days.get('2026-10-20')?.[0].color).toBe('in_transit')
    })

    it('map: numeric/string coords, invalid rows skipped, GeoJSON points, routes in order', () => {
        const features = toMapFeatures(shipments, {
            point: { lat: 'dest_lat', lng: 'dest_lng' },
            color_by: 'status',
            popup: ['tracking_number', 'carrier'],
        })
        expect(features.map((f) => f.key)).toEqual(['s1', 's2'])
        expect(features[1]).toMatchObject({ lat: 20.67, lng: -103.35, color: 'delivered' })
        expect(features[0].popup).toEqual([
            { field: 'tracking_number', value: 'TRK-1' },
            { field: 'carrier', value: 'dhl' },
        ])
        expect(rowCoordinates({ g: '{"type":"Point","coordinates":[-99.1,19.4]}' }, undefined, 'g')).toEqual({ lat: 19.4, lng: -99.1 })
        expect(rowCoordinates({ a: 95, b: 0 }, { lat: 'a', lng: 'b' }, undefined)).toBeNull()
        expect(
            toRoutePoints([events[1], events[0]], { relation: 'events', point: { lat: 'lat', lng: 'lng' }, order_by: 'at' }),
        ).toEqual([{ lat: 19.4, lng: -99.1 }, { lat: 19.9, lng: -100.2 }])
        expect(openInMapHref(19.4, -99.1)).toContain('mlat=19.4&mlon=-99.1')
    })

    it('stats: format without computing business values', () => {
        const now = new Date('2026-10-17T12:00:00Z')
        expect(formatStat(1234.5, 'currency', { locale: 'es-MX', currency: 'MXN' })).toMatch(/1,234\.50/)
        expect(formatStat(0.25, 'percent', { locale: 'en-US' })).toBe('25%')
        expect(formatStat('2026-10-20T12:00:00Z', 'relative_date', { locale: 'en-US', now })).toBe('in 3 days')
        expect(formatStat(null, 'number')).toBe('—')
        expect(formatStat('abc', 'number')).toBe('abc')
    })

    it('split: hides every metadata column not listed', () => {
        expect(hiddenColumnsFor(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
        expect(hiddenColumnsFor(['a', 'b'], undefined)).toEqual([])
    })
})

describe('renderers', () => {
    it('timeline view lists the model rows newest first', async () => {
        const data = memorySource()
        render(
            <DeclarativeView
                viewType="timeline"
                view={{ timeline: { date_field: 'at', title_field: 'description', status_field: 'status' } }}
                model="ShipmentEvent"
                data={data}
                locale="es-MX"
            />,
        )
        await waitFor(() => expect(screen.getByTestId('timeline')).toBeTruthy())
        expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
            expect.stringContaining('En tránsito'),
            expect.stringContaining('Recolectado'),
        ])
        expect(data.list).toHaveBeenCalledWith('ShipmentEvent', expect.objectContaining({ sortBy: 'at', order: 'desc' }))
    })

    it('calendar view requests one month with the RANGE filter', async () => {
        const data = memorySource()
        render(
            <DeclarativeView
                viewType="calendar"
                view={{ calendar: { start_field: 'eta', title_field: 'tracking_number' } }}
                model="Shipment"
                data={data}
            />,
        )
        await waitFor(() => expect(screen.getByRole('grid')).toBeTruthy())
        const params = data.list.mock.calls[0][1] as Record<string, string>
        expect(params.f_eta).toMatch(/^RANGE:\d{4}-\d{2}-01,\d{4}-\d{2}-\d{2}$/)
    })

    it('chart view asks the host for the declared query and paints the widget card', async () => {
        const data = memorySource()
        render(
            <DeclarativeView
                viewType="chart"
                view={{ chart: { kind: 'bar', query: { model: 'Shipment', group_by: 'carrier', range: 'last_30_days' } } }}
                model="Shipment"
                metadata={metadata}
                data={data}
            />,
        )
        await waitFor(() => expect(screen.getByTestId('chart-view').getAttribute('data-kind')).toBe('bar'))
        expect(data.chart).toHaveBeenCalledWith({
            model: 'Shipment',
            query: { model: 'Shipment', group_by: 'carrier', range: 'last_30_days' },
        })
        expect(screen.getByText('Envíos')).toBeTruthy()
    })

    it('detail panels: stats, relation and capability timeline, each lazy and isolated', async () => {
        const data = memorySource()
        const panels: DetailPanel[] = [
            { key: 'figures', kind: 'stats', title: 'shipping.panel.figures', stats: { items: [{ field: 'carrier' }, { field: 'cost', format: 'currency' }] } },
            { key: 'history', kind: 'relation', title: 'shipping.panel.history', relation: { name: 'events', columns: ['status'], limit: 5 } },
            {
                key: 'tracking',
                kind: 'timeline',
                title: 'shipping.panel.tracking',
                span: 'half',
                timeline: {
                    date_field: 'at',
                    title_field: 'description',
                    source: {
                        capability: 'commerce.shipping.track',
                        input: { tracking_number: 'record.tracking_number', carrier: 'record.carrier' },
                        items: 'events',
                    },
                },
            },
            { key: 'mystery', kind: 'custom', title: 'x', expose: './panels/x' },
        ]
        render(<DetailPanels model="Shipment" panels={panels} record={shipments[0]} metadata={metadata} data={data} />)
        await waitFor(() => expect(screen.getByTestId('stats-panel')).toBeTruthy())
        await waitFor(() => expect(screen.getByTestId('relation-panel')).toBeTruthy())
        await waitFor(() => expect(screen.getByTestId('timeline')).toBeTruthy())
        expect(screen.getByText('Paquetería')).toBeTruthy()
        expect(data.capability).toHaveBeenCalledWith('commerce.shipping.track', { tracking_number: 'TRK-1', carrier: 'dhl' })
        expect(data.list).toHaveBeenCalledWith('ShipmentEvent', { f_shipment_id: 'eq:s1', per_page: 5 })
        // `custom` has no built-in renderer until the host registers one.
        expect(screen.getByTestId('panel-unsupported').textContent).toBe('custom')
    })

    it('a host-registered custom panel renders; a crashing panel stays contained', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const restoreCustom = registerPanelRenderer('custom', async () => ({
            default: ({ panel }) => <p data-testid="custom-panel">{panel.expose}</p>,
        }))
        const restoreStats = registerPanelRenderer('stats', async () => ({
            default: () => {
                throw new Error('boom')
            },
        }))
        render(
            <DetailPanels
                model="Shipment"
                panels={[
                    { key: 'c', kind: 'custom', title: 'c', expose: './panels/route-planner' },
                    { key: 's', kind: 'stats', title: 's', stats: { items: [{ field: 'cost' }] } },
                ]}
                record={shipments[0]}
                data={memorySource()}
            />,
        )
        await waitFor(() => expect(screen.getByTestId('custom-panel').textContent).toBe('./panels/route-planner'))
        await waitFor(() => expect(screen.getByTestId('federated-error')).toBeTruthy())
        restoreCustom()
        restoreStats()
        spy.mockRestore()
    })

    it('panel permission hides the panel', () => {
        render(
            <DetailPanels
                model="Shipment"
                panels={[{ key: 's', kind: 'stats', title: 'secret', permission: 'shipping.cost.read', stats: { items: [{ field: 'cost' }] } }]}
                record={shipments[0]}
                data={memorySource()}
                can={() => false}
            />,
        )
        expect(screen.queryByText('secret')).toBeNull()
    })
})
