// @vitest-environment happy-dom
// The voucher is per method: what each one prints, what it never prints, in both languages, and that the page is accessible.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import axe from 'axe-core'
import type { PendingPayment } from '@asteby/storefront'
import { PendingPaymentCard } from './index.js'
import { voucherOf, type VoucherView } from './voucher.js'
import { renderVoucherDocument } from './voucher-document.js'

afterEach(cleanup)
const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }
const money = { amount: '1512.50', currency_code: 'MXN' }
const pay = (payment: Record<string, unknown>): PendingPayment =>
  ({ id: 'chk_1', number: null, status: 'pending_payment', created_at: '2026-10-20T10:00:00Z', total: money, expires_at: '2026-10-27T18:00:00Z', payment: { method: 'oxxo', reference: null, barcode: null, clabe: null, expires_at: '2026-10-27T18:00:00Z', amount: money, ...payment } }) as PendingPayment
const view = (payment: Record<string, unknown>): VoucherView => voucherOf(pay(payment))!

const OXXO = { method: 'oxxo', reference: '9300123456789012', barcode: { format: 'code128', value: '93001234567890123456' } }
// What the complaint looked like: SPEI whose "reference" is the CLABE itself.
const SPEI_BAD = { method: 'spei', reference: '646010349362032012', clabe: '646010349362032012' }
const SPEI = { method: 'spei', reference: 'PA-4412', clabe: '646010349362032012', beneficiary: 'ProtekAuto SA de CV', bank: 'STP' }

/** The document as the buyer reads it: no style, no script, tags collapsed. */
const readable = (html: string) =>
  html
    .replace(/<style>[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '[barcode]')
    .replace(/<\/(p|h\d|li|section|figure|header|div|ol|figcaption)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\n\s*\n+/g, '\n')
    .trim()

const opts = { shopName: 'ProtekAuto', number: 'PA-1', timeZone: 'America/Mexico_City', printButton: true, pdfHref: '?formato=pdf' } as const

describe('printable document per method', () => {
  it('OXXO: reference, barcode (when the server sent one), store steps', () => {
    const html = renderVoucherDocument(view(OXXO), opts)
    expect(readable(html)).toMatchSnapshot()
    expect(html).toContain('<svg')
    expect(html).toContain('93001234567890123456')
    expect(html).toContain('tienda OXXO')
  })
  it('OXXO without a barcode from the server: the reference only, no invented bars', () => {
    const html = renderVoucherDocument(view({ ...OXXO, barcode: null }), opts)
    expect(html).not.toContain('<svg')
    expect(html).toContain('9300123456789012')
    expect(html).toContain('Dicta la referencia en caja')
    expect(html).not.toContain('Muestra el código de barras')
  })
  it('Code 39 from the server is drawn as Code 39', () => {
    const html = renderVoucherDocument(view({ ...OXXO, barcode: { format: 'code39', value: 'OXXO-123' } }), opts)
    expect(html).toContain('<svg')
    expect(html).toContain('OXXO-123')
  })
  it('SPEI: beneficiary, bank, CLABE, a reference different from the CLABE, transfer steps, no store anywhere', () => {
    const html = renderVoucherDocument(view(SPEI), opts)
    expect(readable(html)).toMatchSnapshot()
    for (const needle of ['ProtekAuto SA de CV', 'STP', '646010349362032012', 'PA-4412', 'transferencia SPEI a la CLABE']) expect(html).toContain(needle)
    expect(html).not.toMatch(/OXXO|tienda|caja|<svg/i)
    // order: who, where, CLABE, reference
    const order = ['data-field="beneficiary"', 'data-field="bank"', 'data-field="clabe"', 'data-field="reference"'].map((k) => html.indexOf(k))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
  it('SPEI whose reference is the CLABE prints the number once, as the CLABE', () => {
    const html = renderVoucherDocument(view(SPEI_BAD), opts)
    expect(html.match(/646010349362032012/g)).toHaveLength(1)
    expect(html).toContain('data-field="clabe"')
    expect(html).not.toContain('data-field="reference"')
    expect(html).not.toMatch(/OXXO|tienda/i)
  })
  it('instructions_key picks the steps; an unknown key falls back to the kind, never to another brand', () => {
    expect(renderVoucherDocument(view({ ...OXXO, method: 'paynet', instructions_key: 'oxxo' }), opts)).toContain('tienda OXXO')
    const cash = renderVoucherDocument(view({ ...OXXO, method: 'paynet', instructions_key: 'zzz' }), opts)
    expect(cash).toContain('tienda o comercio indicado')
    expect(cash).not.toContain('OXXO')
    const transfer = renderVoucherDocument(view({ ...SPEI, method: 'wire', instructions_key: 'zzz' }), opts)
    expect(transfer).toContain('banca en línea')
    expect(transfer).not.toMatch(/OXXO|tienda/)
  })
  it('an unknown method gets the generic voucher: no brand, no store, no bank', () => {
    const html = renderVoucherDocument(view({ method: 'crypto_pay', reference: 'ABC-1' }), opts)
    expect(html).toContain('Realiza el pago con los datos de esta ficha')
    expect(html).not.toMatch(/OXXO|SPEI|tienda|banca/)
  })
  it('English', () => {
    const cash = renderVoucherDocument(view(OXXO), { ...opts, locale: 'en-US' })
    expect(readable(cash)).toMatchSnapshot()
    const bank = renderVoucherDocument(view(SPEI), { ...opts, locale: 'en-US' })
    expect(bank).toContain('Make a SPEI transfer')
    expect(bank).toContain('Beneficiary')
    expect(bank).not.toMatch(/OXXO|store/i)
  })
})

describe('print and PDF actions', () => {
  it('"Descargar PDF" is a plain link (works without JS); "Imprimir" is hidden until the script shows it, with a no-JS hint', () => {
    const html = renderVoucherDocument(view(OXXO), { ...opts, nonce: 'n1' })
    expect(html).toContain('<a class="btn" href="?formato=pdf" download="ficha-de-pago.pdf" data-voucher-pdf>Descargar PDF</a>')
    expect(html).toContain('<button type="button" class="btn alt" id="print" hidden>Imprimir</button>')
    expect(html).toContain('<noscript>')
    expect(html).toContain('b.hidden=false')
    expect(html).toContain('@media print { .actions { display: none; }')
  })
  it('the file download carries no actions and no script', () => {
    const html = renderVoucherDocument(view(OXXO), {})
    expect(html).not.toMatch(/class="actions"|<script/)
  })
  it('escapes the PDF link', () => {
    expect(renderVoucherDocument(view(OXXO), { pdfHref: '"><script>x</script>' })).not.toContain('<script>x')
  })
})

describe('accessibility', () => {
  const mount = (html: string) => {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const host = document.createElement('div')
    host.innerHTML = doc.body.innerHTML
    document.body.appendChild(host)
    return host
  }
  it('every document variant passes axe and has a single h1, labelled main, list of steps and figure with text alternative', async () => {
    for (const [payment, locale] of [[OXXO, 'es-MX'], [SPEI, 'es-MX'], [SPEI_BAD, 'en-US'], [{ method: 'x', reference: '1' }, 'en']] as const) {
      const host = mount(renderVoucherDocument(view(payment), { ...opts, locale }))
      expect((await axe.run(host, AXE)).violations).toEqual([])
      expect(host.querySelectorAll('h1')).toHaveLength(1)
      expect(host.querySelector('main')!.getAttribute('aria-labelledby')).toBe('t')
      expect(host.querySelector('svg[role="img"]')?.getAttribute('aria-label') ?? 'none').toMatch(/barras|Barcode|none/)
      host.remove()
    }
  })
  it('html has the document language', () => {
    expect(renderVoucherDocument(view(OXXO), { locale: 'en-US' })).toContain('<html lang="en-US">')
  })
})

describe('<PendingPaymentCard /> per method', () => {
  it('SPEI shows beneficiary, bank and CLABE, a distinct reference, and no barcode', () => {
    const { container } = render(<PendingPaymentCard payment={pay(SPEI)} />)
    expect(container.querySelector('[data-sf-voucher-beneficiary]')!.textContent).toContain('ProtekAuto SA de CV')
    expect(container.querySelector('[data-sf-voucher-bank]')!.textContent).toContain('STP')
    expect(container.querySelector('[data-sf-voucher-clabe]')!.textContent).toContain('646010349362032012')
    expect(container.querySelector('[data-sf-voucher-reference]')!.textContent).toContain('PA-4412')
    expect(container.querySelector('[data-sf-voucher-barcode]')).toBeNull()
  })
  it('a reference equal to the CLABE is shown once', () => {
    const { container } = render(<PendingPaymentCard payment={pay(SPEI_BAD)} />)
    expect(container.querySelector('[data-sf-voucher-reference]')).toBeNull()
    expect(container.querySelectorAll('[data-sf-voucher-value]')).toHaveLength(1)
  })
  it('OXXO draws the server barcode; without one it shows only the reference', () => {
    expect(render(<PendingPaymentCard payment={pay(OXXO)} />).container.querySelector('[data-sf-voucher-barcode] svg')).not.toBeNull()
    cleanup()
    const c = render(<PendingPaymentCard payment={pay({ ...OXXO, barcode: null })} />).container
    expect(c.querySelector('[data-sf-voucher-barcode]')).toBeNull()
    expect(c.querySelector('[data-sf-voucher-reference]')!.textContent).toContain('9300123456789012')
  })
  it('asks the store route for the HTML to print and the PDF to download', () => {
    const calls: string[] = []
    const { container } = render(<PendingPaymentCard payment={pay(OXXO)} voucherHref={(p, o) => (calls.push(`${o.format}:${o.download}`), `/f/${p.id}?formato=${o.format}`)} />)
    expect(calls).toEqual(['html:false', 'pdf:true'])
    expect(container.querySelector('[data-sf-voucher-download]')!.textContent).toBe('Descargar PDF')
    expect(container.querySelector('[data-sf-voucher-download]')!.getAttribute('href')).toBe('/f/chk_1?formato=pdf')
  })
  it('has no accessibility violations for SPEI, in both languages', async () => {
    for (const locale of ['es', 'en']) {
      const r = render(<main><PendingPaymentCard payment={pay(SPEI)} locale={locale} voucherHref={() => '/x'} /></main>)
      expect((await axe.run(r.container, AXE)).violations).toEqual([])
      r.unmount()
    }
  })
})
