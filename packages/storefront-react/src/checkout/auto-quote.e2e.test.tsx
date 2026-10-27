// @vitest-environment happy-dom
/**
 * End to end against the SDK mock server: the buyer fills the address and the rates, the default rate and the payment
 * step are ready by themselves (no "continue" click, no choosing again); past the free-shipping minimum there is no
 * carrier selector at all. The client, the cart and the rates are the real ones; only the HTTP is the mock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { createStorefrontClient, deliveryInput, parseDelivery } from '@asteby/storefront'
import { createMockStorefront } from '@asteby/storefront/mock'
import { AddressFields, DeliveryOptions, useAutoQuote, type QuoteAddress } from './index.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function setup(mode: 'carriers' | 'fixed_when_free', qty: 'one' | 'many') {
  const mock = createMockStorefront({ shippingQuoteMode: mode })
  const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
  const variants = (await sf.products.list({ first: 50 })).nodes.flatMap((p) => p.variants).sort((a, b) => Number(a.price.amount) - Number(b.price.amount))
  const v = qty === 'one' ? variants[0]! : variants[variants.length - 1]!
  const quantity = qty === 'one' ? 1 : Math.ceil(1000 / Number(v.price.amount))
  const cart = await sf.carts.create({ lines: [{ variant_id: v.id, quantity }] })
  const quote = vi.fn(async (a: QuoteAddress) => {
    await sf.carts.setShippingAddress(cart.id, { first_name: 'Ana', last_name: 'López', address1: a.address1, city: a.city, province: a.province, zip: a.zip, country_code: a.country_code, neighborhood: a.neighborhood })
    return sf.carts.deliveryOptions(cart.id)
  })
  return { sf, cart, quote }
}

function Checkout({ quote, lookup }: { lookup?: (zip: string) => Promise<import('./index.js').PostalCodeInfo | null>; quote: (a: QuoteAddress, s: AbortSignal) => ReturnType<typeof Promise.resolve<never>> | Promise<any> }) {
  const ref = useRef<HTMLFormElement>(null)
  const q = useAutoQuote({ formRef: ref, quote })
  return (
    <form ref={ref} onSubmit={(e) => e.preventDefault()}>
      <AddressFields countryCode="MX" {...(lookup ? { lookupPostalCode: lookup } : {})} />
      <fieldset>
        <legend>Entrega</legend>
        <DeliveryOptions rates={q.delivery?.rates ?? []} pickup={[]} defaultValue={q.defaultValue} loading={q.status === 'loading'} error={q.status === 'error'} onRetry={q.retry} free={q.delivery?.free ?? false} announceReady required />
      </fieldset>
      <button type="submit" data-testid="pay" disabled={q.status !== 'ready'}>
        Pagar
      </button>
    </form>
  )
}

const type = (label: RegExp, value: string) => fireEvent.input(screen.getByLabelText(label), { target: { value } })
const fill = async () => {
  type(/c[oó]digo postal/i, '44100')
  type(/estado/i, 'Jalisco')
  type(/ciudad|municipio/i, 'Guadalajara')
  type(/colonia/i, 'Centro')
  type(/calle|direcci[oó]n/i, 'Av. Vallarta 100')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700)
  })
}

describe('checkout in one step (mock server)', () => {
  it('under the free-shipping minimum: rates load by themselves, the cheapest is selected, payment is enabled', async () => {
    const { quote } = await setup('fixed_when_free', 'one')
    render(<Checkout quote={quote} />)
    expect((screen.getByTestId('pay') as HTMLButtonElement).disabled).toBe(true)
    await fill()
    expect(quote).toHaveBeenCalledTimes(1)
    const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="delivery_choice"]')]
    expect(radios.length).toBeGreaterThan(1)
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual(['rate:flat'])
    expect((screen.getByTestId('pay') as HTMLButtonElement).disabled).toBe(false)
    // The form already carries the delivery the server will accept.
    const choice = parseDelivery(String(new FormData(document.querySelector('form')!).get('delivery_choice')))
    expect(deliveryInput(choice)).toEqual({ method: 'shipping', rate_id: 'flat' })
  })

  it('past the free-shipping minimum: no carrier selector, "Envío gratis" and payment ready', async () => {
    const { quote } = await setup('fixed_when_free', 'many')
    render(<Checkout quote={quote} />)
    await fill()
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(0)
    expect(document.querySelector('[data-sf-delivery-free-banner]')?.textContent).toMatch(/Envío gratis/)
    expect(String(new FormData(document.querySelector('form')!).get('delivery_choice'))).toBe('rate:flat')
    expect((screen.getByTestId('pay') as HTMLButtonElement).disabled).toBe(false)
  })

  it('editing the street number or the reference does not ask for a new quote', async () => {
    const { quote } = await setup('fixed_when_free', 'one')
    render(<Checkout quote={quote} />)
    await fill()
    type(/calle|direcci[oó]n/i, 'Av. Vallarta 1000')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(quote).toHaveBeenCalledTimes(1)
  })

  it('with the state and city hidden by the postal code, the quote still carries them and payment is ready', async () => {
    const { quote } = await setup('fixed_when_free', 'one')
    const lookup = async () => ({ province: 'Jalisco', city: 'Guadalajara', neighborhoods: [] })
    render(<Checkout quote={quote} lookup={lookup} />)
    type(/c[oó]digo postal/i, '44100')
    fireEvent.blur(screen.getByLabelText(/c[oó]digo postal/i))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(document.querySelector('[data-sf-resolved-place]')?.textContent).toBe('Guadalajara, Jalisco')
    expect(screen.queryByLabelText(/estado/i)).toBeNull()
    type(/colonia/i, 'Centro')
    type(/calle|direcci[oó]n/i, 'Av. Vallarta 100')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    expect(quote).toHaveBeenCalledTimes(1)
    expect(quote.mock.calls[0]![0]).toMatchObject({ zip: '44100', province: 'Jalisco', city: 'Guadalajara' })
    expect((screen.getByTestId('pay') as HTMLButtonElement).disabled).toBe(false)
  })
})
