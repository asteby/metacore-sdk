// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { createMockStorefront, MOCK_CUSTOMER_EMAIL } from '@asteby/storefront/mock'
import { createStorefrontClient, listApiParams, listHref, readListQuery, type PageInfo } from '@asteby/storefront'
import { InvoiceHistory, ListFilters, OrderList, Pager, ShipmentSummaryCard, invoiceEntries, shipmentNodeOrder, useListFocus } from './index.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const href = (q: Parameters<typeof listHref>[1]) => listHref('/cuenta/pedidos', q)
const info = (over: Partial<PageInfo> = {}): PageInfo => ({ has_next_page: true, end_cursor: 'e1', has_previous_page: false, start_cursor: 's1', ...over })

describe('<Pager />', () => {
  it('shows where you are and links to the next page, with a disabled Previous on the first', async () => {
    const { container } = render(<Pager query={{}} pageInfo={info()} count={10} total={300} first={10} hrefFor={href} timeZone="UTC" />)
    expect(container.querySelector('[data-sf-pager-status]')!.textContent).toBe('Mostrando 1–10 de 300')
    const next = container.querySelector('a[data-sf-pager-link=next]')!
    expect(next.getAttribute('href')).toBe('/cuenta/pedidos?despues=e1&pos=11')
    expect(next.getAttribute('rel')).toBe('next')
    expect(container.querySelector('[data-sf-pager-disabled=previous]')!.getAttribute('aria-disabled')).toBe('true')
    expect(container.querySelector('a[data-sf-pager-link=previous]')).toBeNull()
    const results = await axe.run(container, AXE)
    expect(results.violations).toEqual([])
  })

  it('goes back with the start cursor and keeps the filters in every link', () => {
    const q = { after: 'e1', pos: 11, status: 'delivered', from: '2026-01-01' }
    const { container } = render(<Pager query={q} pageInfo={info({ has_previous_page: true, start_cursor: 's2', end_cursor: 'e2' })} count={10} total={42} first={10} hrefFor={href} />)
    expect(container.querySelector('[data-sf-pager-status]')!.textContent).toBe('Mostrando 11–20 de 42')
    // position 11: the page before is the first one, so the link is the plain first page
    expect(container.querySelector('a[rel=prev]')!.getAttribute('href')).toBe('/cuenta/pedidos?estado=delivered&desde=2026-01-01')
    expect(container.querySelector('a[rel=next]')!.getAttribute('href')).toBe('/cuenta/pedidos?despues=e2&pos=21&estado=delivered&desde=2026-01-01')
  })

  it('goes back with the start cursor when the page before is not the first', () => {
    const { container } = render(<Pager query={{ after: 'e2', pos: 21 }} pageInfo={info({ has_previous_page: true, start_cursor: 's3', end_cursor: 'e3' })} count={10} total={300} first={10} hrefFor={href} />)
    expect(container.querySelector('a[rel=prev]')!.getAttribute('href')).toBe('/cuenta/pedidos?antes=s3&pos=11')
  })

  it('has no Next at the end, and says «Mostrando» without a total when the server gave none', () => {
    const { container } = render(<Pager query={{ after: 'x', pos: 21 }} pageInfo={info({ has_next_page: false, end_cursor: null, has_previous_page: true })} count={4} first={10} hrefFor={href} />)
    expect(container.querySelector('[data-sf-pager-status]')!.textContent).toBe('Mostrando 21–24')
    expect(container.querySelector('[data-sf-pager-disabled=next]')).not.toBeNull()
  })

  it('renders only the status when there is a single page', () => {
    const { container } = render(<Pager query={{}} pageInfo={info({ has_next_page: false, end_cursor: null })} count={3} total={3} first={10} hrefFor={href} />)
    expect(container.querySelector('[data-sf-pager-status]')!.textContent).toBe('Mostrando 1–3 de 3')
    expect(container.querySelector('[data-sf-pager-links]')).toBeNull()
  })

  it('announces politely, is busy while loading and keeps its size', () => {
    const { container } = render(<Pager query={{}} pageInfo={info()} count={10} first={10} hrefFor={href} status="loading" />)
    const nav = container.querySelector('nav')!
    expect(nav.getAttribute('aria-busy')).toBe('true')
    const live = container.querySelector('[data-sf-pager-status]')!
    expect(live.getAttribute('role')).toBe('status')
    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.textContent).toBe('Cargando…')
    expect(container.querySelector('a[rel=next]')).not.toBeNull()
  })

  it('shows an error with a retry link, not a dead end', async () => {
    const { container } = render(<Pager query={{ after: 'x', pos: 11 }} pageInfo={null} count={0} first={10} hrefFor={href} status="error" />)
    const alert = container.querySelector('[role=alert]')!
    expect(alert.textContent).toContain('No pudimos cargar esta página')
    expect(alert.querySelector('a')!.getAttribute('href')).toBe('/cuenta/pedidos?despues=x&pos=11')
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('«Load more» follows the link without JavaScript and loads in place with a handler', () => {
    const onLoadMore = vi.fn()
    const { container, rerender } = render(<Pager query={{}} pageInfo={info()} count={10} first={10} hrefFor={href} variant="more" />)
    expect(container.querySelector('a[data-sf-pager-link=more]')!.getAttribute('href')).toBe('/cuenta/pedidos?despues=e1&pos=11')
    expect(container.querySelector('a[rel=prev]')).toBeNull()
    rerender(<Pager query={{}} pageInfo={info()} count={10} first={10} hrefFor={href} variant="more" onLoadMore={onLoadMore} />)
    fireEvent.click(container.querySelector('a[data-sf-pager-link=more]')!)
    expect(onLoadMore).toHaveBeenCalledWith({ after: 'e1', pos: 11 })
    // a modified click still opens in a new tab
    fireEvent.click(container.querySelector('a[data-sf-pager-link=more]')!, { ctrlKey: true })
    expect(onLoadMore).toHaveBeenCalledTimes(1)
  })

  it('explains a short filtered page that still has a next one', () => {
    const { container } = render(<Pager query={{ status: 'cancelled' }} pageInfo={info()} count={0} first={10} hrefFor={href} filtered />)
    expect(container.querySelector('[data-sf-pager-note]')!.textContent).toContain('Seguimos buscando')
  })

  it('speaks English and lets a router render the links', () => {
    const Link = (p: { href: string; children: React.ReactNode; rel: string }) => (
      <a href={p.href} rel={p.rel} data-router>
        {p.children}
      </a>
    )
    const { container } = render(
      <Pager locale="en-US" query={{}} pageInfo={info()} count={10} total={300} first={10} hrefFor={href} renderLink={(p) => <Link key={p['data-sf-pager-link']} href={p.href} rel={p.rel}>{p.children}</Link>} />,
    )
    expect(container.querySelector('[data-sf-pager-status]')!.textContent).toBe('Showing 1–10 of 300')
    expect(container.querySelector('a[data-router]')!.textContent).toBe('Next')
    expect(container.querySelector('nav')!.getAttribute('aria-label')).toBe('Pagination')
  })

  it('names the list it pages', () => {
    const { container } = render(<Pager query={{}} pageInfo={info()} count={10} first={10} hrefFor={href} label="pedidos" />)
    expect(container.querySelector('nav')!.getAttribute('aria-label')).toBe('Paginación de pedidos')
  })
})

describe('useListFocus', () => {
  function Probe({ pageKey }: { pageKey: string }) {
    const props = useListFocus<HTMLDivElement>(pageKey)
    return <div {...props}>list {pageKey}</div>
  }
  it('does not steal focus on the first render, moves it when the page changes, and not for the same page', () => {
    const { container, rerender } = render(<Probe pageKey="a" />)
    const el = container.querySelector('[data-sf-list-focus]') as HTMLElement
    expect(document.activeElement).not.toBe(el)
    rerender(<Probe pageKey="a" />)
    expect(document.activeElement).not.toBe(el)
    act(() => {
      rerender(<Probe pageKey="b" />)
    })
    expect(document.activeElement).toBe(el)
    expect(el.getAttribute('tabindex')).toBe('-1')
  })
})

describe('<ListFilters />', () => {
  const statuses = [
    { value: 'delivered', label: 'Entregado' },
    { value: 'cancelled', label: 'Cancelado' },
  ]
  it('is a GET form whose fields carry the current values, with no cursor', async () => {
    const { container } = render(<ListFilters values={{ status: 'delivered', from: '2026-01-01', q: '1042' }} fields={['q', 'status', 'delivery', 'invoice', 'dates']} statusOptions={statuses} action="/cuenta/pedidos" clearHref="/cuenta/pedidos" />)
    const form = container.querySelector('form')!
    expect(form.getAttribute('method')).toBe('get')
    expect(form.getAttribute('action')).toBe('/cuenta/pedidos')
    expect((container.querySelector('[name=q]') as HTMLInputElement).value).toBe('1042')
    expect((container.querySelector('[name=estado]') as HTMLSelectElement).value).toBe('delivered')
    expect((container.querySelector('[name=desde]') as HTMLInputElement).value).toBe('2026-01-01')
    expect(container.querySelector('[name=despues]')).toBeNull()
    expect(container.querySelector('a[data-sf-filters-clear]')!.getAttribute('href')).toBe('/cuenta/pedidos')
    expect(screen.getByLabelText('Número de pedido')).toBeTruthy()
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('has no «clear» link when nothing is filtered, and what it submits reads back as the same query', () => {
    const { container } = render(<ListFilters locale="en-US" values={{}} fields={['status', 'invoice']} statusOptions={statuses} clearHref="/x" />)
    expect(container.querySelector('a[data-sf-filters-clear]')).toBeNull()
    expect(container.querySelector('button')!.textContent).toBe('Apply filters')
    const fd = new URLSearchParams()
    fd.set('estado', 'cancelled')
    fd.set('factura', 'si')
    expect(readListQuery(fd)).toEqual({ status: 'cancelled', invoice: true })
  })
})

describe('the lists against the mock', () => {
  async function me() {
    const mock = createMockStorefront({ syntheticOrders: 40 })
    const base = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    await base.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    const session = await base.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: mock.otpCode })
    return base.withCustomerToken(session.token)
  }

  it('pages orders with a Pager and an accessible OrderList', async () => {
    const client = await me()
    const query = readListQuery('?estado=delivered')
    const page = await client.customer.orders.list(listApiParams(query, 5))
    const { container } = render(
      <div>
        <OrderList orders={page.nodes} orderHref={(o) => `/cuenta/pedidos/${o.id}`} timeZone="UTC" />
        <Pager query={query} pageInfo={page.page_info} count={page.nodes.length} total={page.total_count} first={5} hrefFor={href} filtered />
      </div>,
    )
    expect(container.querySelectorAll('[data-sf-order]').length).toBe(5)
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('turns invoice nodes into history entries and shipment nodes into summary cards', async () => {
    const client = await me()
    const inv = await client.customer.invoices.list({ first: 5 })
    const entries = invoiceEntries(inv.nodes)
    expect(entries.length).toBeGreaterThanOrEqual(inv.nodes.length)
    const a = render(<InvoiceHistory entries={entries} compact timeZone="UTC" />)
    expect(a.container.querySelectorAll('[data-sf-invoice-history-item]').length).toBe(entries.length)
    expect((await axe.run(a.container, AXE)).violations).toEqual([])
    cleanup()
    const shp = await client.customer.shipments.list({ first: 5 })
    const b = render(
      <div>
        {shp.nodes.map((n) => (
          <ShipmentSummaryCard key={n.order.id} order={shipmentNodeOrder(n)} href={`/cuenta/pedidos/${n.order.id}/envio`} title={`Pedido ${n.order.number}`} />
        ))}
      </div>,
    )
    expect(b.container.querySelectorAll('[data-sf-summary-card=shipment]').length).toBe(shp.nodes.length)
    expect((await axe.run(b.container, AXE)).violations).toEqual([])
  })
})
