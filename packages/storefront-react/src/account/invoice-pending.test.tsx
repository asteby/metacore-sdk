// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import type { InvoiceDoc } from '@asteby/storefront'
import { InvoiceList } from './index.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const AXE = { iframes: false, rules: { 'color-contrast': { enabled: false } } }
const doc: InvoiceDoc = { id: 'i1', status: 'issued', kind: 'invoice', series: 'A', folio_number: '10', folio: 'UUID-1', issued_at: '2026-08-13T10:00:00Z' }
const fileHref = (d: InvoiceDoc, kind: string) => `/cuenta/pedidos/o1/facturas/${d.id}/${kind}`

function slowFetch() {
  let release!: (r: Response) => void
  const f = vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        release = resolve
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('a'), { name: 'AbortError' })))
      }),
  )
  vi.stubGlobal('fetch', f)
  return { f, release: (r: Response) => release(r) }
}
const pdf = () => new Response(new Blob(['%PDF-1.4 x']), { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="f.pdf"' } })

describe('invoice downloads while pending', () => {
  it('five rapid clicks on «Descargar PDF» send ONE request; the three file buttons lock together and show progress', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const { f, release } = slowFetch()
    const user = userEvent.setup()
    const { container } = render(<InvoiceList invoices={[doc]} fileHref={fileHref} />)
    const pdfLink = container.querySelector('[data-sf-invoice-download="pdf"]') as HTMLAnchorElement
    for (let i = 0; i < 5; i++) await user.click(pdfLink)
    expect(f).toHaveBeenCalledTimes(1)
    const pdfNow = container.querySelector('[data-sf-invoice-download="pdf"]') as HTMLAnchorElement
    expect(pdfNow.getAttribute('aria-busy')).toBe('true')
    expect(pdfNow.getAttribute('aria-disabled')).toBe('true')
    expect(pdfNow.textContent).toContain('Descargando')
    const xml = container.querySelector('[data-sf-invoice-download="xml"]') as HTMLAnchorElement
    expect(xml.getAttribute('aria-disabled')).toBe('true') // locked, but no spinner (it is not the one running)
    expect(xml.getAttribute('aria-busy')).toBeNull()
    await user.click(xml)
    expect(f).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[data-sf-invoice-preview]')!.getAttribute('aria-disabled')).toBe('true')
    expect((await axe.run(container, AXE)).violations).toEqual([])
    await act(async () => release(pdf()))
    await waitFor(() => expect((container.querySelector('[data-sf-invoice-download="pdf"]') as HTMLElement).getAttribute('aria-busy')).toBeNull())
  })

  it('a 429 from the server reads as «estamos preparando tu factura» and offers a retry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429, headers: { 'Content-Type': 'application/json' } })))
    const user = userEvent.setup()
    const { container } = render(<InvoiceList invoices={[doc]} fileHref={fileHref} />)
    await user.click(container.querySelector('[data-sf-invoice-download="xml"]')!)
    await waitFor(() => expect(container.querySelector('[data-sf-invoice-file-notice="rate_limited"]')).not.toBeNull())
    expect(container.textContent).toContain('Estamos preparando tu factura')
  })
})
