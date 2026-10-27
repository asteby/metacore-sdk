// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import type { InvoiceDoc } from '@asteby/storefront'
import { InvoiceList } from './index.js'
import { filenameFromDisposition, inlineHref, fetchInvoiceFile } from './invoice-fetch.js'
import { parseCfdi } from './invoice-preview.js'
import { accountMessages } from './orders-messages.js'
import { InvoicePreviewDialog } from './invoice-preview-lazy.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const AXE = { iframes: false, rules: { 'color-contrast': { enabled: false } } }
const doc = (d: Partial<InvoiceDoc> = {}): InvoiceDoc => ({ id: 'i1', status: 'issued', kind: 'invoice', series: '61445', folio_number: '1168', folio: 'UUID-1', issued_at: '2026-08-13T10:00:00Z', ...d })
const fileHref = (d: InvoiceDoc, kind: string) => `/cuenta/pedidos/o1/facturas/${d.id}/${kind}`
const m = accountMessages('es')
const XML = '<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Serie="61445" Folio="1168" Total="116.00" SubTotal="100.00" Moneda="MXN" Fecha="2026-10-27T10:00:00"><cfdi:Emisor Rfc="AAA010101AAA" Nombre="Tienda"/><cfdi:Receptor Rfc="XAXX010101000" Nombre="Ana"/><cfdi:Conceptos><cfdi:Concepto Cantidad="1" Descripcion="Balata" Importe="100.00"/></cfdi:Conceptos><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="ABC-1"/></cfdi:Complemento></cfdi:Comprobante>'

function route(map: Record<string, () => Response>) {
  const f = vi.fn(async (url: string) => {
    for (const [k, v] of Object.entries(map)) if (url.includes(k)) return v()
    return new Response('x', { status: 404 })
  })
  vi.stubGlobal('fetch', f)
  return f
}
const pdf = () => new Response(new Blob(['%PDF-1.4 x'], { type: 'application/pdf' }), { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="factura-61445-1168.pdf"` } })
const notReady = () => new Response(JSON.stringify({ error: { code: 'not_ready', message: 'x' } }), { status: 409, headers: { 'Content-Type': 'application/json' } })
const xml = () => new Response(XML, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8' } })

describe('helpers', () => {
  it('reads the file name of a Content-Disposition and adds inline=1', () => {
    expect(filenameFromDisposition(`attachment; filename="factura-61445-1168.pdf"; filename*=UTF-8''factura-61445-1168.pdf`)).toBe('factura-61445-1168.pdf')
    expect(filenameFromDisposition('attachment; filename="../../x.pdf"')).toBe('x.pdf')
    expect(filenameFromDisposition(null)).toBeNull()
    expect(inlineHref('/a/b/pdf')).toBe('/a/b/pdf?inline=1')
    expect(inlineHref('/a/b/pdf?x=1')).toBe('/a/b/pdf?x=1&inline=1')
  })
  it('codes the errors and refuses a 200 that is not a file', async () => {
    route({ '/nr': notReady, '/html': () => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }) })
    expect(await fetchInvoiceFile('/nr')).toMatchObject({ ok: false, code: 'not_ready' })
    expect(await fetchInvoiceFile('/html')).toMatchObject({ ok: false, code: 'unavailable' })
    expect(await fetchInvoiceFile('/none')).toMatchObject({ ok: false, code: 'not_found' })
  })
  it('summarises a CFDI from its XML', () => {
    const c = parseCfdi(XML)!
    expect([c.serie, c.folio, c.total, c.uuid, c.issuer.name, c.concepts[0]!.description]).toEqual(['61445', '1168', '116.00', 'ABC-1', 'Tienda', 'Balata'])
    expect(parseCfdi('<nope')).toBeNull()
  })
})

describe('invoice buttons', () => {
  it('shows View invoice, Download PDF and Download XML with a download name', () => {
    const { container } = render(<InvoiceList invoices={[doc()]} fileHref={fileHref} timeZone="UTC" />)
    expect(screen.getByRole('button', { name: /vista previa/i }).textContent).toBe('Ver factura')
    const a = container.querySelector<HTMLAnchorElement>('[data-sf-invoice-download=pdf]')!
    expect(a.getAttribute('download')).toBe('factura-61445-1168.pdf')
    expect(container.querySelector<HTMLAnchorElement>('[data-sf-invoice-download=xml]')!.getAttribute('download')).toBe('factura-61445-1168.xml')
  })

  it('a download that is still being generated is a notice in the page, never a saved file', async () => {
    route({ '/pdf': notReady })
    const { container } = render(<InvoiceList invoices={[doc()]} fileHref={fileHref} />)
    fireEvent.click(container.querySelector('[data-sf-invoice-download=pdf]')!)
    const note = await waitFor(() => {
      const n = container.querySelector('[data-sf-invoice-file-notice=not_ready]')
      expect(n).toBeTruthy()
      return n!
    })
    expect(note.getAttribute('role')).toBe('status')
    expect(note.textContent).toContain('El PDF todavía se está generando')
  })

  it('a good download saves the bytes under the server name', async () => {
    route({ '/pdf': pdf })
    const create = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }))
    const clicked: string[] = []
    const orig = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push(this.download)
    }
    const { container } = render(<InvoiceList invoices={[doc()]} fileHref={fileHref} />)
    fireEvent.click(container.querySelector('[data-sf-invoice-download=pdf]')!)
    await waitFor(() => expect(clicked).toEqual(['factura-61445-1168.pdf']))
    HTMLAnchorElement.prototype.click = orig
  })
})

describe('<InvoicePreviewDialog />', () => {
  const props = { open: true, onClose: () => {}, title: 'Vista previa de la factura 61445-1168', pdfHref: '/p/pdf', xmlHref: '/p/xml', m }

  it('embeds the PDF, has an accessible title, closes with Esc and passes axe', async () => {
    const f = route({ '/p/pdf': pdf })
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:pdf', revokeObjectURL: vi.fn() }))
    const onClose = vi.fn()
    const { container } = render(<InvoicePreviewDialog {...props} onClose={onClose} />)
    const frame = await waitFor(() => {
      const el = container.querySelector('iframe')
      expect(el).toBeTruthy()
      return el!
    })
    expect(frame.getAttribute('src')).toBe('blob:pdf')
    expect(f.mock.calls[0]![0]).toBe('/p/pdf?inline=1')
    const dlg = screen.getByRole('dialog', { hidden: true })
    expect(dlg.getAttribute('aria-labelledby')).toBeTruthy()
    expect(document.getElementById(dlg.getAttribute('aria-labelledby')!)!.textContent).toBe('Vista previa de la factura 61445-1168')
    fireEvent(dlg, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalled()
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('while the PDF is not there it says so, retries, and draws the CFDI from the XML (never a 404)', async () => {
    let ready = false
    route({ '/p/pdf': () => (ready ? pdf() : notReady()), '/p/xml': xml })
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:pdf', revokeObjectURL: vi.fn() }))
    const { container } = render(<InvoicePreviewDialog {...props} />)
    await waitFor(() => expect(container.querySelector('[data-sf-invoice-preview-generating]')).toBeTruthy())
    expect(container.textContent).toContain('El PDF se está generando')
    await waitFor(() => expect(container.querySelector('[data-sf-invoice-cfdi]')).toBeTruthy())
    expect(container.textContent).toContain('Balata')
    expect(container.textContent).toContain('ABC-1')
    expect((await axe.run(container, AXE)).violations).toEqual([])
    ready = true
    fireEvent.click(container.querySelector('[data-sf-invoice-preview-retry]')!)
    await waitFor(() => expect(container.querySelector('iframe')).toBeTruthy())
  })

  it('a session that expired is an alert with a retry', async () => {
    route({ '/p/pdf': () => new Response('{}', { status: 401, headers: { 'Content-Type': 'application/json' } }) })
    const { container } = render(<InvoicePreviewDialog {...props} xmlHref={null} />)
    await waitFor(() => expect(container.querySelector('[data-sf-invoice-preview-error=unauthorized]')).toBeTruthy())
    expect(screen.getByRole('alert', { hidden: true }).textContent).toContain('sesión venció')
  })
})
