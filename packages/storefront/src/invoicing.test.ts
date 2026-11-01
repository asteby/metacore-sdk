import { describe, expect, it } from 'vitest'
import { createStorefrontClient } from './client.js'
import { MOCK_CUSTOMER_EMAIL, createMockStorefront } from './mock/index.js'
import { invoicingDisabled, invoicingEnabled } from './invoicing.js'

const base = { countries: [], checkout: 'off' as const, post_purchase: false, identity_documents: [], online_verify: false }

describe('invoicingDisabled', () => {
  it('is true only for an explicit disabled', () => {
    expect(invoicingDisabled({ invoicing: { ...base, available: false, unavailable_reason: 'disabled' } })).toBe(true)
    expect(invoicingEnabled({ invoicing: { ...base, available: false, unavailable_reason: 'disabled' } })).toBe(false)
  })
  it.each(['no_provider', 'not_configured', 'no_issuer'])('keeps today for %s', (reason) => {
    expect(invoicingDisabled({ invoicing: { ...base, available: false, unavailable_reason: reason } })).toBe(false)
  })
  it('keeps today when it is on, absent or unknown', () => {
    expect(invoicingDisabled({ invoicing: { ...base, available: true } })).toBe(false)
    expect(invoicingDisabled({})).toBe(false)
    expect(invoicingDisabled(null)).toBe(false)
    expect(invoicingDisabled(undefined)).toBe(false)
  })
})

describe('mock with invoicing off', () => {
  const signedIn = async (opts: Parameters<typeof createMockStorefront>[0]) => {
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: createMockStorefront(opts).fetch })
    await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
    const session = await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: '000000' })
    return sf.withCustomerToken(session.token)
  }
  const notFound = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ status: 404 })

  it('publishes disabled, hides fiscal profiles and answers 404 on the invoice routes', async () => {
    const sf = await signedIn({ invoicingDisabled: true })
    const caps = await sf.customer.capabilities()
    expect(invoicingDisabled(caps)).toBe(true)
    expect(caps.fiscal_profiles).toBeUndefined()
    // The list route is a 404, which the client reads as an older server and answers from the orders: nothing to show.
    expect((await sf.customer.invoices.list()).nodes).toEqual([])
    await notFound(sf.customer.fiscalProfiles.list())
    await notFound(sf.customer.requestInvoice('so_1', { tax_id: 'XAXX010101000' } as never))
    const orders = await sf.customer.orders.list()
    expect(orders.nodes.length).toBeGreaterThan(0)
    for (const o of orders.nodes) {
      expect(o.invoice?.can_request).toBe(false)
      expect(o.next_action?.kind).not.toMatch(/invoice/)
    }
  })

  it('stays exactly as today when on', async () => {
    const sf = await signedIn({})
    const caps = await sf.customer.capabilities()
    expect(invoicingDisabled(caps)).toBe(false)
    expect(caps.invoicing?.available).toBe(true)
    expect(caps.fiscal_profiles).toEqual({ max: 10 })
    expect((await sf.customer.invoices.list()).nodes).toBeDefined()
  })
})
