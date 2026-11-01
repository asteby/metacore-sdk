// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { LegacyTrackingView, Shipment, TrackingView } from '@asteby/storefront'
import { ShipmentTracker, TrackOrderLookup, TrackingResult, TrackingTimeline, parseTrackingForm, resolveTrackingLookup, trackingPlaces, trackingPoints } from './index.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const tz = 'America/Mexico_City'

// The deprecated flat shape: still rendered as one shipment (stores and fixtures built before 0.48).
const view = (extra: Partial<LegacyTrackingView> = {}): LegacyTrackingView => ({
  status: 'in_transit',
  carrier: 'paquetexpress',
  tracking_number: 'PX123456',
  tracking_url: 'https://rastreo.example.com/PX123456',
  eta: '2026-10-31',
  updated_at: '2026-10-29T18:00:00Z',
  events: [
    { id: 'e2', status: 'in_transit', description: 'Salió del centro', location: 'Monterrey, NL', occurred_at: '2026-10-29T18:00:00Z', lat: 25.67, lng: -100.31 },
    { id: 'e1', status: 'label_created', description: 'Guía generada', location: 'CDMX', occurred_at: '2026-10-28T15:00:00Z', lat: 19.43, lng: -99.13 },
  ],
  ...extra,
})

describe('<TrackingTimeline />', () => {
  it('lists scans newest first with <time>, flags the current step and passes axe', async () => {
    const { container } = render(<TrackingTimeline events={view().events} timeZone={tz} />)
    const items = container.querySelectorAll('ol[data-sf-tracking-timeline] > li')
    expect(items).toHaveLength(2)
    expect(items[0]!.getAttribute('aria-current')).toBe('step')
    expect(items[1]!.getAttribute('aria-current')).toBeNull()
    expect(items[0]!.textContent).toContain('En camino')
    expect(items[0]!.textContent).toContain('Monterrey, NL')
    expect(items[0]!.querySelector('time')!.getAttribute('datetime')).toBe('2026-10-29T18:00:00Z')
    expect(items[0]!.querySelector('time')!.textContent).toContain('12:00') // Mexico City, not UTC
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('shows its own empty text and never throws on hostile scans', () => {
    const { container } = render(<TrackingTimeline events={[{ id: 'x', status: 7 as never, description: { a: 1 } as never, location: null, occurred_at: 'nope' }]} />)
    expect(container.textContent).not.toContain('[object Object]')
    cleanup()
    const empty = render(<TrackingTimeline events={[]} />)
    expect(empty.container.querySelector('[data-sf-tracking-empty]')!.textContent).toContain('Aún no hay movimientos')
  })

  it('speaks English when asked', () => {
    const { container } = render(<TrackingTimeline events={view().events} locale="en-US" />)
    expect(container.textContent).toContain('On its way')
  })
})

describe('<ShipmentTracker />', () => {
  it('shows carrier, copyable guide, https link, ETA and the timeline, and passes axe', async () => {
    const { container } = render(<ShipmentTracker tracking={view()} timeZone={tz} />)
    expect(container.querySelector('[data-sf-tracker-title]')!.textContent).toBe('En camino')
    expect(container.querySelector('[data-sf-tracker-carrier]')!.textContent).toBe('Paquetexpress')
    expect(container.querySelector('[data-sf-tracker-guide]')!.textContent).toBe('PX123456')
    expect(container.querySelector('[data-sf-copy]')).not.toBeNull()
    const link = container.querySelector('a[data-sf-tracker-link]')!
    expect(link.getAttribute('href')).toBe('https://rastreo.example.com/PX123456')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(container.querySelector('[data-sf-tracker-eta]')!.textContent).toContain('31')
    expect(container.querySelectorAll('[data-sf-tracking-timeline] > li')).toHaveLength(2)
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('drops a non-https tracking link and never prints a label_url', () => {
    const t = { ...view({ tracking_url: 'javascript:alert(1)' }), label_url: 'https://labels.example.com/SECRET.pdf' } as LegacyTrackingView
    const { container } = render(<ShipmentTracker tracking={t} />)
    expect(container.querySelector('a[data-sf-tracker-link]')).toBeNull()
    expect(container.innerHTML).not.toContain('SECRET')
    expect(container.innerHTML).not.toContain('label_url')
  })

  it('announces an exception as a status, not as a failure', () => {
    const { container } = render(<ShipmentTracker tracking={view({ status: 'exception' })} />)
    const note = container.querySelector('[data-sf-tracker-exception]')!
    expect(note.getAttribute('role')).toBe('status')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('has loading, empty and error states (error offers a retry)', () => {
    const retry = vi.fn()
    const { container, rerender } = render(<ShipmentTracker state="loading" />)
    expect(container.querySelector('[data-sf-tracker-loading]')!.getAttribute('role')).toBe('status')
    rerender(<ShipmentTracker tracking={null} />)
    expect(container.querySelector('[data-sf-tracker-empty]')).not.toBeNull()
    rerender(<ShipmentTracker state="error" onRetry={retry} />)
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('draws no map and raises no error when nothing is passed or the maps package fails to load', async () => {
    const noCoords = view({ events: view().events.map(({ lat: _a, lng: _b, ...e }) => e) })
    const { container } = render(<ShipmentTracker tracking={noCoords} loadMaps={async () => { throw new Error('missing') }} />)
    expect(container.querySelector('[data-sf-tracking-map]')).toBeNull()
    cleanup()
    const failing = render(<ShipmentTracker tracking={view()} loadMaps={async () => { throw new Error('missing') }} />)
    await waitFor(() => expect(failing.container.querySelector('[data-sf-tracking-map-loading]')).toBeNull())
    expect(failing.container.querySelector('[data-sf-tracking-map]')).toBeNull()
    expect(failing.container.querySelectorAll('[data-sf-tracking-timeline] > li')).toHaveLength(2)
  })

  it('draws the route with the lazily loaded maps package when scans carry coordinates', async () => {
    const MapView = vi.fn(({ points, children }: { points: unknown[]; children: unknown }) => <div data-testid="map" data-n={points.length}>{children as never}</div>)
    const Route = vi.fn(() => <i data-testid="route" />)
    const { findByTestId } = render(<ShipmentTracker tracking={view()} loadMaps={async () => ({ MapView: MapView as never, Route: Route as never })} />)
    expect((await findByTestId('map')).getAttribute('data-n')).toBe('2')
    expect(await findByTestId('route')).toBeTruthy()
    const call = MapView.mock.calls[0]![0] as { points: Array<{ lat: number }> }
    expect(call.points[0]!.lat).toBe(19.43) // oldest first
  })

  it('geocodes the scans\' places when the carrier sends none', async () => {
    const noCoords = view({ events: view().events.map(({ lat: _a, lng: _b, ...e }) => e) })
    const geocode = vi.fn(async (p: string) => (p.startsWith('CDMX') ? { lat: 19.4, lng: -99.1 } : { lat: 25.6, lng: -100.3 }))
    const MapView = ({ points }: { points: unknown[] }) => <div data-testid="map" data-n={points.length} />
    const { findByTestId } = render(<ShipmentTracker tracking={noCoords} geocode={geocode} loadMaps={async () => ({ MapView: MapView as never, Route: (() => null) as never })} />)
    expect((await findByTestId('map')).getAttribute('data-n')).toBe('2')
    expect(geocode).toHaveBeenCalledTimes(2)
  })
})

describe('points', () => {
  it('prefers the server path, else scans with coordinates oldest first, dropping repeats and invalid points', () => {
    expect(trackingPoints(view()).map((p) => p.lat)).toEqual([19.43, 25.67])
    const dup = view({ events: [...view().events, { id: 'e0', status: 'pending', occurred_at: '2026-10-27T00:00:00Z', lat: 19.43, lng: -99.13 }] })
    expect(trackingPoints(dup)).toHaveLength(2)
    expect(trackingPoints(view({ events: [{ id: 'z', status: 'x', occurred_at: '2026-10-28T00:00:00Z', lat: 0, lng: 0 }] }))).toEqual([])
    const path = view({ map: { path: [{ label: 'A', lat: 20, lng: -99, precision: 'city' }, { label: 'B', lat: 21, lng: -100, precision: 'city' }] } })
    expect(trackingPoints(path).map((p) => p.label)).toEqual(['A', 'B'])
    expect(trackingPoints(null)).toEqual([])
    expect(trackingPlaces(view())).toEqual(['CDMX', 'Monterrey, NL'])
  })
})

describe('form helpers', () => {
  it('parses order+email first, else the guide, else null', () => {
    expect(parseTrackingForm({ order_number: ' SO-15 ', email: 'a@b.co' })).toEqual({ order_number: 'SO-15', email: 'a@b.co' })
    expect(parseTrackingForm({ order_number: 'SO-15', email: 'nope', tracking_number: 'PX 1 2' })).toEqual({ tracking_number: 'PX12' })
    expect(parseTrackingForm({})).toBeNull()
    const fd = new FormData()
    fd.set('tracking_number', 'G1')
    expect(parseTrackingForm(fd)).toEqual({ tracking_number: 'G1' })
  })

  it('folds every lookup outcome into render data and never throws', async () => {
    const mk = (r: unknown) => ({ tracking: { lookup: vi.fn(async () => r as never) } })
    expect(await resolveTrackingLookup(mk({ status: 'found', tracking: view() }), { tracking_number: 'G' })).toEqual({ tracking: view() })
    expect(await resolveTrackingLookup(mk({ status: 'rate_limited', retryAfter: 9 }), { tracking_number: 'G' })).toEqual({ error: 'rate_limited', retryAfter: 9 })
    expect(await resolveTrackingLookup(mk({ status: 'not_found' }), { tracking_number: 'G' })).toEqual({ error: 'not_found' })
    expect(await resolveTrackingLookup(mk(null), {})).toEqual({ error: 'incomplete' })
    const boom = { tracking: { lookup: async () => { throw new Error('x') } } }
    expect(await resolveTrackingLookup(boom, { tracking_number: 'G' })).toEqual({ error: 'unavailable' })
  })
})

describe('<TrackOrderLookup />', () => {
  it('is a plain POST form with both ways, labelled, and passes axe', async () => {
    const { container } = render(<TrackOrderLookup action="/rastreo" />)
    const form = container.querySelector('form')!
    expect(form.getAttribute('method')).toBe('post')
    expect(form.getAttribute('action')).toBe('/rastreo')
    expect(screen.getByLabelText('Número de pedido')).toBeTruthy()
    expect(screen.getByLabelText('Correo de la compra').getAttribute('type')).toBe('email')
    expect(screen.getByLabelText('Número de guía')).toBeTruthy()
    expect(container.querySelectorAll('input[required]')).toHaveLength(0) // both ways: the server decides
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('requires the fields of a single mode', () => {
    const { container } = render(<TrackOrderLookup action="/rastreo" mode="tracking" />)
    expect(container.querySelectorAll('input[required]')).toHaveLength(1)
    expect(container.querySelector('input[name="order_number"]')).toBeNull()
  })

  it('renders the result, announces politely and focuses it after an update', () => {
    const { container, rerender } = render(<TrackOrderLookup action="/rastreo" />)
    const region = container.querySelector('[data-sf-tracking-result]')!
    expect(region.getAttribute('aria-live')).toBe('polite')
    rerender(<TrackOrderLookup action="/rastreo" result={view()} />)
    expect(container.querySelector('[data-sf-tracker]')).not.toBeNull()
    expect(document.activeElement).toBe(region)
  })

  it('shows one uniform alert per failure, with the wait when rate limited', () => {
    const { container, rerender } = render(<TrackOrderLookup action="/rastreo" error="not_found" />)
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('No encontramos un envío')
    rerender(<TrackOrderLookup action="/rastreo" error="rate_limited" retryAfter={30} />)
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('30 s')
    rerender(<TrackOrderLookup action="/rastreo" error="unavailable" />)
    expect(container.querySelector('[role="alert"]')!.textContent).toContain('No pudimos consultar')
  })

  it('takes over the submit with onSubmit (no page reload) and sends the parsed input', () => {
    const onSubmit = vi.fn()
    const { container } = render(<TrackOrderLookup action="/rastreo" onSubmit={onSubmit} />)
    fireEvent.change(container.querySelector('input[name="tracking_number"]')!, { target: { value: 'PX1' } })
    fireEvent.submit(container.querySelector('form')!)
    expect(onSubmit).toHaveBeenCalledWith({ tracking_number: 'PX1' })
  })
})

// The contract shape storefront_customers answers (`TrackingView`).
const shipment = (extra: Partial<Shipment> = {}): Shipment => ({
  id: 'shp_1',
  kind: 'outbound',
  status: 'in_transit',
  environment: 'production',
  test_mode: false,
  carrier: 'Estafeta',
  tracking_number: '8012345678',
  tracking_url: 'https://rastreo.example.com/8012345678',
  promised_by: '2026-11-04',
  label_url: null,
  events: [
    { id: 'e2', status: 'in_transit', description: 'En tránsito', location: 'Querétaro, Qro.', occurred_at: '2026-11-01T15:00:00Z' },
    { id: 'e1', status: 'label_created', description: 'Guía generada', location: null, occurred_at: '2026-10-31T15:00:00Z' },
  ],
  map: { path: [{ label: 'CDMX', lat: 19.43, lng: -99.13, precision: 'city' }, { label: 'Querétaro', lat: 20.59, lng: -100.39, precision: 'city' }] },
  ...extra,
})
const order = (extra: Partial<TrackingView> = {}): TrackingView => ({ order_number: 'SO-00016', status: 'in_transit', shipments: [shipment()], ...extra })

describe('<TrackingResult /> (contract shape)', () => {
  it('order confirmed without a guide: a clear pending status, never the not-found alert, and passes axe', async () => {
    const { container } = render(<TrackingResult tracking={{ order_number: 'SO-00016', status: 'pending', shipments: [] }} />)
    const root = container.querySelector('[data-sf-tracking-order]')!
    expect(root.getAttribute('data-sf-tracking-order-state')).toBe('pending')
    expect(container.querySelector('[data-sf-tracking-order-title]')!.textContent).toBe('Pedido SO-00016')
    const note = container.querySelector('[data-sf-tracking-pending]')!
    expect(note.getAttribute('role')).toBe('status')
    expect(note.textContent).toBe('Tu pedido está confirmado; aún no tiene guía. Te avisaremos por correo cuando salga.')
    expect(container.textContent).not.toContain('No encontramos')
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('a cancelled order without parcels says so', () => {
    const { container } = render(<TrackingResult tracking={{ order_number: 'SO-2', status: 'cancelled', shipments: [] }} />)
    expect(container.querySelector('[data-sf-tracking-pending]')!.getAttribute('data-sf-tracking-pending')).toBe('cancelled')
    expect(container.textContent).toContain('cancelado')
  })

  it('one shipment: its tracker with guide, link and timeline, one level below the order title', () => {
    const { container } = render(<TrackingResult tracking={order()} headingLevel={2} timeZone={tz} />)
    expect(container.querySelector('h2')!.textContent).toBe('Pedido SO-00016')
    expect(container.querySelector('h3[data-sf-tracker-title]')!.textContent).toBe('En camino')
    expect(container.querySelector('[data-sf-tracker-guide]')!.textContent).toBe('8012345678')
    expect(container.querySelector('[data-sf-tracker-eta]')!.textContent).toContain('4')
    expect(container.querySelectorAll('[data-sf-tracking-timeline] > li')).toHaveLength(2)
  })

  it('several shipments: each with its own label, status and timeline; a test shipment is never shown', async () => {
    const tracking = order({
      shipments: [
        shipment(),
        shipment({ id: 'shp_2', status: 'delivered', tracking_number: 'D2', events: [{ id: 'x', status: 'delivered', occurred_at: '2026-11-01T18:00:00Z' }] }),
        shipment({ id: 'shp_test', test_mode: true, environment: 'sandbox', tracking_number: 'SANDBOX-1' }),
      ],
    })
    const { container } = render(<TrackingResult tracking={tracking} />)
    expect(container.querySelector('[data-sf-tracking-order]')!.getAttribute('data-sf-tracking-shipments')).toBe('2')
    expect(container.querySelector('[data-sf-tracking-count]')!.textContent).toContain('2 envíos')
    const items = container.querySelectorAll('[data-sf-tracking-item]')
    expect(items).toHaveLength(2)
    expect(items[0]!.querySelector('[data-sf-tracker-title]')!.textContent).toBe('Envío 1 de 2: En camino')
    expect(items[1]!.querySelector('[data-sf-tracker-title]')!.textContent).toBe('Envío 2 de 2: Entregado')
    expect(items[0]!.querySelectorAll('[data-sf-tracking-timeline] > li')).toHaveLength(2)
    expect(items[1]!.querySelectorAll('[data-sf-tracking-timeline] > li')).toHaveLength(1)
    expect(container.innerHTML).not.toContain('SANDBOX-1')
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('only test shipments: reads as pending', () => {
    const { container } = render(<TrackingResult tracking={order({ status: 'label_created', shipments: [shipment({ test_mode: true })] })} />)
    expect(container.querySelector('[data-sf-tracking-pending]')).not.toBeNull()
    expect(container.querySelector('[data-sf-tracker]')).toBeNull()
  })

  it('draws each shipment\'s map from the server path when a maps loader is given', async () => {
    const MapView = ({ points }: { points: unknown[] }) => <div data-testid="map" data-n={points.length} />
    const { findAllByTestId } = render(
      <TrackingResult tracking={order({ shipments: [shipment(), shipment({ id: 'shp_2' })] })} trackerProps={{ loadMaps: async () => ({ MapView: MapView as never, Route: (() => null) as never }) }} />,
    )
    const maps = await findAllByTestId('map')
    expect(maps).toHaveLength(2)
    expect(maps[0]!.getAttribute('data-n')).toBe('2')
  })

  it('ShipmentTracker given the whole lookup result renders the order view; the flat shape still works', () => {
    const { container } = render(<ShipmentTracker tracking={{ order_number: 'SO-1', status: 'pending', shipments: [] }} />)
    expect(container.querySelector('[data-sf-tracking-pending]')).not.toBeNull()
    cleanup()
    const flat = render(<TrackingResult tracking={view()} />)
    expect(flat.container.querySelector('[data-sf-tracker-guide]')!.textContent).toBe('PX123456')
    expect(flat.container.querySelector('[data-sf-tracking-order-title]')).toBeNull()
  })

  it('speaks English', () => {
    const { container } = render(<TrackingResult tracking={{ order_number: 'SO-1', status: 'pending', shipments: [] }} locale="en-US" />)
    expect(container.textContent).toContain('Order SO-1')
    expect(container.textContent).toContain('no tracking number yet')
  })
})

describe('<TrackOrderLookup /> with the contract shape', () => {
  it('a found order without a guide shows the pending status in the result region, not an error', () => {
    const { container } = render(<TrackOrderLookup action="/rastreo" result={{ order_number: 'SO-00016', status: 'pending', shipments: [] }} headingLevel={1} />)
    const region = container.querySelector('[data-sf-tracking-result]')!
    expect(region.querySelector('[data-sf-tracking-pending]')!.textContent).toContain('aún no tiene guía')
    expect(region.querySelector('h2')!.textContent).toBe('Pedido SO-00016')
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('renderTracker receives the normalised contract shape (also from a flat result)', () => {
    const renderTracker = vi.fn(() => <p>custom</p>)
    render(<TrackOrderLookup action="/rastreo" result={view()} renderTracker={renderTracker} />)
    const arg = (renderTracker.mock.calls[0] as unknown as [TrackingView])[0]
    expect(arg.shipments).toHaveLength(1)
    expect(arg.shipments[0]!.tracking_number).toBe('PX123456')
  })

  it('renderTracker never receives a test shipment; trackerProps.classNames reach every shipment', () => {
    const renderTracker = vi.fn(() => <p>custom</p>)
    render(<TrackOrderLookup action="/rastreo" result={order({ shipments: [shipment(), shipment({ id: 't', test_mode: true })] })} renderTracker={renderTracker} />)
    expect((renderTracker.mock.calls[0] as unknown as [TrackingView])[0].shipments.map((s) => s.id)).toEqual(['shp_1'])
    cleanup()
    const { container } = render(<TrackOrderLookup action="/rastreo" result={order({ shipments: [shipment(), shipment({ id: 'shp_2' })] })} trackerProps={{ classNames: { root: 'mi-envio' } }} />)
    expect(container.querySelectorAll('.mi-envio')).toHaveLength(2)
  })

  it('end to end with the client: the pending answer of the server renders the pending state', async () => {
    const pending = { order_number: 'SO-00016', status: 'pending', shipments: [] }
    const sf = { tracking: { lookup: async () => ({ status: 'found' as const, tracking: pending as TrackingView }) } }
    const data = await resolveTrackingLookup(sf, { order_number: 'SO-00016', email: 'a@b.co' })
    const { container } = render(<TrackOrderLookup action="/rastreo" result={data.tracking ?? null} error={data.error ?? null} />)
    expect(container.querySelector('[data-sf-tracking-pending]')).not.toBeNull()
  })
})
