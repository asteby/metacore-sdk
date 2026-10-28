import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MOCK_REGION_MX } from '@asteby/storefront/mock'
import { FiscalIdentityFields, IdentityDocumentReader, InvoiceStatusCard, InvoiceToggle } from './index.js'

const CAPS = { available: true, countries: ['MX'], checkout: 'optional' as const, post_purchase: true, identity_documents: ['MX:csf'], online_verify: false }
const PROFILE = { country_code: 'MX', tax_id: 'PEPJ800101AB3', legal_name: 'JUAN CARLOS PEREZ PEREZ', tax_regime: '612', postal_code: '06600', invoice_use: 'G03' }

describe('server rendering (what a browser without JavaScript gets)', () => {
  it('the toggle is collapsed, and offers a link that opens it', () => {
    const html = renderToString(<InvoiceToggle region={MOCK_REGION_MX} capabilities={CAPS} noJsHref="?invoice=1" />)
    expect(html).toContain('Necesito factura (CFDI)')
    expect(html).not.toContain('data-sf-invoice-body')
    expect(html).toContain('<noscript>')
    expect(html).toContain('href="?invoice=1"')
  })

  it('opened (defaultRequested) with the upload enabled: a named file input and a submit that posts it as multipart', () => {
    const html = renderToString(<InvoiceToggle region={MOCK_REGION_MX} capabilities={CAPS} defaultRequested serverUpload />)
    expect(html).toMatch(/<input[^>]*type="file"[^>]*name="document"|<input[^>]*name="document"[^>]*type="file"/)
    expect(html).toContain('La procesamos y la descartamos al terminar')
    expect(html).not.toContain('La leemos en tu dispositivo')
    expect(html).toContain('name="intent"')
    expect(html).toContain('value="extract-document"')
    expect(html).toMatch(/formEncType="multipart\/form-data"|formenctype="multipart\/form-data"/i)
    expect(html).toContain('Captura tus datos a mano')
  })

  it('without the server upload, the reader promises on-device reading and has no unnamed-form trap', () => {
    const html = renderToString(<IdentityDocumentReader region={MOCK_REGION_MX} onConfirm={() => {}} />)
    expect(html).toContain('La leemos en tu dispositivo')
    expect(html).not.toContain('name="document"')
    expect(html).not.toContain('extract-document')
  })

  it('manual capture works as plain HTML fields in a form: names, required, autofill tokens', () => {
    const html = renderToString(<FiscalIdentityFields region={MOCK_REGION_MX} />)
    for (const n of ['tax_id', 'legal_name', 'postal_code', 'tax_regime', 'use']) expect(html).toContain(`name="invoice.${n}"`)
    expect(html.match(/required/g)!.length).toBeGreaterThanOrEqual(5)
    // HTML attribute names are case-insensitive.
    expect(html).toMatch(/autocapitalize="characters"/i)
    expect(html).toMatch(/autocomplete="postal-code"/i)
    expect(html).toMatch(/inputmode="numeric"/i)
    expect(html).toContain('RFC')
  })

  it('a saved profile renders masked and also as hidden fields so the form posts it', () => {
    const html = renderToString(<InvoiceToggle region={MOCK_REGION_MX} capabilities={CAPS} profile={PROFILE} defaultRequested />)
    expect(html).toContain('PE********AB3')
    expect(html).toContain('type="hidden" name="invoice.tax_id" value="PEPJ800101AB3"')
    expect(html).toContain('name="invoice.requested"')
  })

  it('the review sent back by the server renders prefilled, marked and with the evidence', () => {
    const evidence = { kind: 'MX:csf', source: 'pdf_server' as const, sha256: 'ab'.repeat(32), extractor: 'rules@1', qr_match: null }
    const html = renderToString(
      <InvoiceToggle
        region={MOCK_REGION_MX}
        capabilities={CAPS}
        defaultRequested
        serverUpload
        data={{ ok: true, step: 'review', extraction: { kind: 'MX:csf', values: { tax_id: 'ABC010203AB1', legal_name: 'EMPRESA SA', postal_code: '44100', tax_regime: '601' }, regime_candidates: ['601'], from_document: ['tax_id', 'legal_name', 'postal_code', 'tax_regime'], qr_match: null, stale: false, age_days: 3, missing: [], evidence } }}
      />,
    )
    expect(html).toContain('Revisa tus datos')
    expect(html).toContain('value="ABC010203AB1"')
    expect(html).toContain('Datos leídos de tu constancia de situación fiscal')
    expect(html).toContain('name="invoice.document"')
  })

  it('server errors by field render inline in the HTML', () => {
    const html = renderToString(
      <InvoiceToggle region={MOCK_REGION_MX} capabilities={{ ...CAPS, identity_documents: [] }} defaultRequested data={{ ok: false, error: { code: 'validation', field: 'invoice.use' }, fieldErrors: { 'invoice.use': 'El régimen 626 no admite el uso G03' } }} />,
    )
    expect(html).toContain('El régimen 626 no admite el uso G03')
    expect(html).toContain('aria-invalid="true"')
  })

  it('the status card renders every state without JavaScript', () => {
    for (const stage of ['awaiting_payment', 'issuing', 'issued', 'needs_data', 'needs_review', 'window_closed']) {
      const html = renderToString(<InvoiceStatusCard invoice={{ status: stage, stage, url: 'https://f.test/a.pdf' }} />)
      expect(html).toContain(`data-stage="${stage}"`)
    }
  })

  it('renders the same on the server and the client first pass (no hydration surprises from ids)', () => {
    const a = renderToString(<InvoiceToggle region={MOCK_REGION_MX} capabilities={CAPS} defaultRequested serverUpload />)
    const b = renderToString(<InvoiceToggle region={MOCK_REGION_MX} capabilities={CAPS} defaultRequested serverUpload />)
    expect(a).toBe(b)
  })
})
