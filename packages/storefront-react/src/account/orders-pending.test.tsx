// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { PendingPayment } from '@asteby/storefront'
import { Barcode, PendingPaymentCard, PendingPaymentList, barcodeGeometry, code128Modules, voucherOf } from './index.js'
import { renderVoucherDocument, esc } from './voucher-document.js'
import { demo } from './orders-fixtures.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
const AXE = { rules: { 'color-contrast': { enabled: false } } }
const money = { amount: '1948.00', currency_code: 'MXN' }
const pay = (p: Partial<PendingPayment> = {}, voucher: Partial<PendingPayment['payment']> = {}): PendingPayment => ({
  id: 'chk_12345678abcdef',
  number: null,
  status: 'pending_payment',
  created_at: '2026-10-20T10:00:00Z',
  total: money,
  expires_at: '2026-10-27T18:00:00Z',
  payment: { method: 'oxxo', reference: '9300 1234 5678', barcode: '93001234567890', clabe: null, expires_at: '2026-10-27T18:00:00Z', amount: money, ...voucher },
  ...p,
})

describe('Code 128 (ported from the ProtekAuto store)', () => {
  // Reference values generated with JsBarcode (CODE128C "12345678" and CODE128B "AB9").
  it('uses set C for even digit strings and set B otherwise', () => {
    expect(code128Modules('12345678')).toBe('1101001110010110011100100010110001110001011011000010100100011101101100011101011')
    expect(code128Modules('AB9')).toBe('11010010000101000110001000101100011100101100100001100101100011101011')
  })
  it('has 11 modules per symbol and 13 in the stop', () => {
    expect((code128Modules('93001234567890')!.length - 13) % 11).toBe(0)
  })
  it('refuses empty, non-ASCII and too long values', () => {
    expect(code128Modules('')).toBeNull()
    expect(code128Modules('ñ')).toBeNull()
    expect(code128Modules('1'.repeat(81))).toBeNull()
    expect(barcodeGeometry('ñ')).toBeNull()
    expect(render(<Barcode value="ñ" label="x" />).container.innerHTML).toBe('')
  })
  it('draws only rects and no HTML from the value', () => {
    const { container } = render(<Barcode value="93001234567890" label="Código de barras 93001234567890" />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('role')).toBe('img')
    expect(svg.getAttribute('aria-label')).toBe('Código de barras 93001234567890')
    expect(svg.querySelectorAll('rect').length).toBeGreaterThan(10)
  })
})

describe('voucherOf', () => {
  it('normalizes and requires something to pay with', () => {
    expect(voucherOf(pay())).toMatchObject({ method: 'oxxo', reference: '9300 1234 5678', amount: money })
    expect(voucherOf(pay({}, { reference: null, barcode: null, clabe: null }))).toBeNull()
    expect(voucherOf(null)).toBeNull()
    expect(voucherOf({ payment: { reference: 'x'.repeat(999) } } as never)!.reference).toHaveLength(256)
  })
})

describe('<PendingPaymentCard />', () => {
  it('shows method, reference, barcode, expiry and total', () => {
    const { container } = render(<PendingPaymentCard payment={pay()} timeZone="America/Mexico_City" />)
    expect(container.querySelector('h3')!.textContent).toBe('OXXO')
    expect(container.querySelector('[data-sf-voucher-badge]')!.textContent).toBe('Esperando pago')
    expect(container.querySelector('[data-sf-voucher-reference] [data-sf-voucher-value]')!.textContent).toBe('9300 1234 5678')
    expect(container.querySelector('[data-sf-voucher-barcode] svg')!.getAttribute('aria-label')).toBe('Código de barras 93001234567890')
    expect(container.querySelector('[data-sf-voucher-expiry]')!.textContent).toMatch(/^Vence el 27 de octubre de 2026\b.*12:00/)
    expect(container.querySelector('time')!.getAttribute('datetime')).toBe('2026-10-27T18:00:00Z')
    expect(container.querySelector('[data-sf-voucher-total]')!.textContent).toContain('$1,948.00')
  })

  it('shows the CLABE of a SPEI voucher without barcode', () => {
    const { container } = render(<PendingPaymentCard payment={pay({}, { method: 'spei', reference: null, barcode: null, clabe: '646180110400000007' })} />)
    expect(container.querySelector('h3')!.textContent).toBe('Transferencia SPEI')
    expect(container.querySelector('[data-sf-voucher-clabe]')!.textContent).toContain('646180110400000007')
    expect(container.querySelector('[data-sf-voucher-barcode]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Copiar CLABE' })).toBeTruthy()
  })

  it('an expired voucher offers nothing to pay with and says so', () => {
    const { container } = render(<PendingPaymentCard payment={pay({ status: 'expired' })} />)
    expect(container.querySelector('[data-sf-voucher-badge]')!.textContent).toBe('Vencida')
    expect(container.querySelector('[data-sf-voucher-expired-note]')!.textContent).toContain('ya no es válida')
    expect(container.querySelector('[data-sf-voucher-actions]')).toBeNull()
    expect(container.querySelector('[data-sf-voucher-barcode]')).toBeNull()
    expect(container.querySelector('[data-sf-voucher-expiry]')!.textContent).toContain('Venció el')
  })

  it('serves print / download from the store route when given one', () => {
    const { container } = render(<PendingPaymentCard payment={pay()} voucherHref={(p, o) => `/cuenta/pendientes/${p.id}/ficha${o.download ? '?descargar=1' : ''}`} />)
    const print = container.querySelector('[data-sf-voucher-print]')!
    expect(print.getAttribute('href')).toBe('/cuenta/pendientes/chk_12345678abcdef/ficha')
    expect(print.getAttribute('rel')).toBe('noopener')
    expect(container.querySelector('[data-sf-voucher-download]')!.getAttribute('href')).toContain('descargar=1')
  })

  it('builds the printable document in the browser on demand, loading its code only then', async () => {
    const created: Blob[] = []
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => (created.push(b), 'blob:x'), revokeObjectURL: () => {} }))
    const open = vi.spyOn(window, 'open').mockReturnValue({ opener: 'me' } as unknown as Window)
    render(<PendingPaymentCard payment={pay()} shopName="Tienda" />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver e imprimir ficha' }))
    await waitFor(() => expect(open).toHaveBeenCalledWith('blob:x', '_blank'))
    const html = await created[0]!.text()
    expect(html).toContain('Ficha de pago')
    expect(html).toContain('Tienda')
    expect(html).toContain('9300 1234 5678')
    expect(html).toContain('window.print()')
    expect(open.mock.results[0]!.value.opener).toBeNull()
  })

  it('falls back to a download when the browser blocks the pop-up', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
    vi.spyOn(window, 'open').mockReturnValue(null)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<PendingPaymentCard payment={pay()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver e imprimir ficha' }))
    await waitFor(() => expect(click).toHaveBeenCalled())
  })

  it('copies the reference', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<PendingPaymentCard payment={pay()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar referencia' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Copiada'))
    expect(writeText).toHaveBeenCalledWith('9300 1234 5678')
  })

  it('renders nothing for a payment with nothing to pay with', () => {
    expect(render(<PendingPaymentCard payment={pay({}, { reference: null, barcode: null })} />).container.innerHTML).toBe('')
  })

  it('shows an unknown method as cash, never the raw code', () => {
    const c = render(<PendingPaymentCard payment={pay({}, { method: 'crypto_pay' })} />).container
    expect(c.querySelector('h3')!.textContent).toBe('Pago en efectivo')
  })

  it('speaks English', () => {
    const c = render(<PendingPaymentCard payment={pay()} locale="en" timeZone="UTC" />).container
    expect(c.querySelector('[data-sf-voucher-badge]')!.textContent).toBe('Waiting for payment')
    expect(c.querySelector('[data-sf-voucher-expiry]')!.textContent).toMatch(/^Expires on October 27, 2026\b.*6:00/)
  })
})

describe('<PendingPaymentList />', () => {
  it('lists valid vouchers first and renders nothing when empty', () => {
    const { container } = render(<PendingPaymentList payments={[pay({ id: 'old', status: 'expired' }), pay({ id: 'new' })]} />)
    expect([...container.querySelectorAll('[data-sf-voucher]')].map((n) => n.getAttribute('data-sf-voucher-status'))).toEqual(['pending_payment', 'expired'])
    expect(container.querySelector('h2')!.textContent).toBe('Pendientes de pago')
    expect(container.querySelectorAll('h3')).toHaveLength(2)
    cleanup()
    expect(render(<PendingPaymentList payments={[]} />).container.innerHTML).toBe('')
  })

  it('has no accessibility violations with the demo vouchers', async () => {
    const { pending } = await demo()
    const views = [<PendingPaymentList key="a" payments={pending} voucherHref={(p) => `/f/${p.id}`} />, <PendingPaymentList key="b" payments={pending} locale="en" />]
    for (const ui of views) {
      const r = render(<main>{ui}</main>)
      expect((await axe.run(r.container, AXE)).violations).toEqual([])
      r.unmount()
    }
  })
})

describe('printable document', () => {
  const v = voucherOf(pay())!
  it('is A4 HTML with reference, barcode, amount and expiry, and nothing from a gateway', () => {
    const html = renderVoucherDocument(v, { printButton: true, number: 'SO-1', shopName: 'Tienda', timeZone: 'America/Mexico_City' })
    expect(html).toContain('@page { size: A4')
    expect(html).toContain('9300 1234 5678')
    expect(html).toContain('<svg')
    expect(html).toContain('$1,948.00')
    expect(html).toContain('Pedido SO-1')
    expect(html).toContain('Vence:')
    expect(html).not.toMatch(/mercadopago|voucher_url|https?:\/\//)
  })
  it('escapes everything external', () => {
    const evil = voucherOf(pay({}, { method: '<img onerror=x>', reference: '"><script>alert(1)</script>', instructions: '<b>x</b>' }))!
    const html = renderVoucherDocument(evil, { number: '<i>', shopName: '<u>' })
    for (const bad of ['<script>alert', '<img onerror', '<b>x</b>', '<i>', '<u>']) expect(html).not.toContain(bad)
    expect(esc(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
  it('SPEI: CLABE and transfer steps, English on request', () => {
    const spei = voucherOf(pay({}, { method: 'spei', reference: null, barcode: null, clabe: '646180110400000007' }))!
    const html = renderVoucherDocument(spei, { locale: 'en-US' })
    expect(html).toContain('646180110400000007')
    expect(html).toContain('SPEI transfer')
    expect(html).toContain('lang="en-US"')
    expect(html).not.toContain('<svg')
  })
  it('puts the nonce on the script and leaves it out when printing is off', () => {
    expect(renderVoucherDocument(v, { printButton: true, nonce: 'abc"def' })).toContain('<script nonce="abc&quot;def">')
    expect(renderVoucherDocument(v, {})).not.toContain('<script')
  })
})
