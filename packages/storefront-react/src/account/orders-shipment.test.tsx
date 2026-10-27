// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { Shipment } from '@asteby/storefront'
import { ShipmentCard } from './index.js'
import { demo } from './orders-fixtures.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const ev = (id: string, at: string, extra = {}) => ({ id, status: 'in_transit', occurred_at: at, ...extra })
const ship = (s: Partial<Shipment> = {}): Shipment => ({
  id: 's1',
  kind: 'outbound',
  status: 'in_transit',
  carrier: 'Estafeta',
  tracking_number: '8012345678',
  tracking_url: 'https://rastreo.example.com/8012345678',
  promised_by: '2026-08-16',
  events: [],
  ...s,
})

describe('<ShipmentCard />', () => {
  it('shows carrier, status, number, https link and promised day (a calendar day, in any zone)', () => {
    const { container } = render(<ShipmentCard shipment={ship()} timeZone="Pacific/Kiritimati" />)
    expect(container.querySelector('h3')!.textContent).toBe('Paquetería: Estafeta')
    expect(container.querySelector('[data-sf-shipment-eyebrow]')!.textContent).toContain('Paquetería')
    expect(container.querySelector('[data-sf-shipment-state]')!.textContent).toBe('En camino')
    expect(container.querySelector('code')!.textContent).toBe('8012345678')
    const a = container.querySelector('[data-sf-shipment-track]') as HTMLAnchorElement
    expect(a.getAttribute('href')).toBe('https://rastreo.example.com/8012345678')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    expect(a.textContent).toContain('Rastrear con Estafeta')
    expect(container.querySelector('[data-sf-shipment-dates]')!.textContent).toBe('Llega a más tardar el 16 de agosto de 2026')
  })

  it('lists events newest first, collapses past 3 and expands with a toggle', () => {
    const events = Array.from({ length: 5 }, (_, i) => ev(`e${i}`, `2026-08-1${i}T10:00:00Z`, { description: `Paso ${i}`, location: 'Querétaro, Qro.' }))
    const { container } = render(<ShipmentCard shipment={ship({ events })} />)
    const items = () => [...container.querySelectorAll('[data-sf-shipment-events] li')]
    expect(items().map((li) => li.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Paso 4')]))
    expect(items()).toHaveLength(3)
    expect(items()[0]!.textContent).toContain('Paso 4')
    const toggle = screen.getByRole('button', { name: 'Ver todo (5)' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(items()).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Ver menos' }).getAttribute('aria-expanded')).toBe('true')
  })

  it('says what to expect when the carrier has no events yet', () => {
    const { container } = render(<ShipmentCard shipment={ship({ events: [] })} />)
    expect(container.querySelector('[data-sf-shipment-empty]')!.textContent).toContain('24 horas')
  })

  it('hides a sandbox shipment by default and, when marked, never shows number, link or events', () => {
    const test = ship({ test_mode: true, environment: 'sandbox', events: [ev('e1', '2026-08-10T10:00:00Z')] })
    expect(render(<ShipmentCard shipment={test} />).container.innerHTML).toBe('')
    cleanup()
    const { container } = render(<ShipmentCard shipment={test} testMode="mark" />)
    expect(container.querySelector('[data-sf-shipment-test]')!.textContent).toBe('De prueba')
    expect(container.textContent).toContain('no es un envío real')
    expect(container.querySelector('code')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('[data-sf-shipment-events]')).toBeNull()
    expect(container.textContent).not.toContain('8012345678')
  })

  it('only trusts https links and only a RETURN shipment shows its label', () => {
    const http = render(<ShipmentCard shipment={ship({ tracking_url: 'http://x.example.com/1' })} />).container
    expect(http.querySelector('[data-sf-shipment-track]')).toBeNull()
    expect(http.querySelector('code')!.textContent).toBe('8012345678')
    cleanup()
    const js = render(<ShipmentCard shipment={ship({ tracking_url: 'javascript:alert(1)' })} />).container
    expect(js.querySelector('a')).toBeNull()
    cleanup()
    const out = render(<ShipmentCard shipment={ship({ label_url: 'https://pac.example.com/label.pdf' })} />).container
    expect(out.innerHTML).not.toContain('label.pdf')
    cleanup()
    const ret = render(<ShipmentCard shipment={ship({ kind: 'return', label_url: 'https://carrier.example.com/label.pdf' })} />).container
    expect(ret.querySelector('[data-sf-shipment-label]')!.getAttribute('href')).toBe('https://carrier.example.com/label.pdf')
    expect(ret.querySelector('h3')!.textContent).toContain('Devolución')
    cleanup()
    expect(render(<ShipmentCard shipment={ship({ kind: 'return', label_url: 'http://x.example.com/l.pdf' })} />).container.querySelector('[data-sf-shipment-label]')).toBeNull()
  })

  it('leaves the map slot to the map: called with the points, only when there is a map, text events stay', () => {
    const renderMap = vi.fn(() => <div data-testid="map" />)
    const map = { origin: { label: 'CDMX', lat: 19.43, lng: -99.13, precision: 'city' }, destination: null, path: [] }
    const { container } = render(<ShipmentCard shipment={ship({ map, events: [ev('e1', '2026-08-10T10:00:00Z')] })} renderMap={renderMap} />)
    expect(screen.getByTestId('map')).toBeTruthy()
    expect(renderMap).toHaveBeenCalledWith(expect.objectContaining({ map }))
    expect(container.querySelector('[data-sf-shipment-events]')).toBeTruthy()
    cleanup()
    render(<ShipmentCard shipment={ship({ map: null })} renderMap={renderMap} />)
    expect(screen.queryByTestId('map')).toBeNull()
  })

  it('renders the carrier mark through the slot, so logos stay out of this bundle', () => {
    render(<ShipmentCard shipment={ship()} renderCarrierMark={(s) => <i data-testid="mark">{s.carrier_logo_key}</i>} />)
    expect(screen.getByTestId('mark')).toBeTruthy()
  })

  it('survives an unknown status, kind and garbage events', () => {
    const odd = ship({ status: 'quantum', kind: 'teleport', events: [{ id: 'x', status: 'weird', occurred_at: 'not a date' }, null as never] })
    const { container } = render(<ShipmentCard shipment={odd} />)
    expect(container.textContent).not.toMatch(/quantum|weird|teleport/)
    expect(container.querySelector('[data-sf-shipment-state]')!.textContent).toBe('En proceso')
  })

  it('copies the tracking number and announces it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ShipmentCard shipment={ship()} />)
    fireEvent.click(screen.getByRole('button', { name: /Copiar Número de guía/ }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Copiado'))
    expect(writeText).toHaveBeenCalledWith('8012345678')
  })

  it('tells the buyer to select the text when the browser refuses to copy', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    render(<ShipmentCard shipment={ship()} />)
    fireEvent.click(screen.getByRole('button', { name: /Copiar/ }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('selecciona el texto'))
  })

  it('has no accessibility violations with the demo shipments (real and test)', async () => {
    const { detail } = await demo()
    const real = (await detail('ord_seed_shipped')).shipments![0]!
    const test = (await detail('ord_seed_sandbox')).shipments![0]!
    const r = render(
      <main>
        <ShipmentCard shipment={real} />
        <ShipmentCard shipment={real} locale="en" />
        <ShipmentCard shipment={test} testMode="mark" />
        <ShipmentCard shipment={ship({ kind: 'return', label_url: 'https://c.example.com/l' })} />
      </main>,
    )
    expect((await axe.run(r.container, AXE)).violations).toEqual([])
  })
})
