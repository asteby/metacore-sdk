// @vitest-environment happy-dom
// Integration: useLiveDelivery + PaymentMethodSection with a fixed rate that keeps its id across quotes. The server
// refuses the first save (quote expired), the shop quotes again (same id, new price) and the section must save once
// more on its own, without the buyer touching the address, and without sending the refused save twice.
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import type { DeliveryOptions as Delivery, PaymentClient, PaymentMethod } from '@asteby/storefront'
import { AddressFields, DeliveryOptions, useLiveDelivery } from '../checkout/index.js'
import { PaymentMethodSection, buildPayChoices, type PaymentFormAdapter } from './index.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const client: PaymentClient = { kind: 'fake', sdk_url: 'https://sdk.example.com/js', public_key: 'pk' }
const method: PaymentMethod = { key: 'prov', kind: 'provider', default: true, client, options: [{ key: 'card', redirect: false }] }
const adapter: PaymentFormAdapter = {
  kind: 'fake',
  async load() {},
  async mount(o) {
    queueMicrotask(() => o.onReady())
    return { collect: async () => ({ provider_data: { token: 't' } }), unmount() {} }
  },
}
const quote = (cost: string): Delivery => ({ rates: [{ id: 'shipping_flat:std', title: 'Estándar', cost: { amount: cost, currency_code: 'MXN' } } as never], pickup: [] })
const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))

function Shop({ syncDelivery }: { syncDelivery: (d: string, requote: () => void) => Promise<boolean | 'requote'> }) {
  const ref = useRef<HTMLFormElement>(null)
  const saved = { address: { zip: '44100', province: 'Jalisco', city: 'Guadalajara', country_code: 'MX' } }
  const live = useLiveDelivery({ formRef: ref, delivery: { rates: [], pickup: [] }, enabled: true, quoteUrl: '/pagar/envio', saved })
  return (
    <form ref={ref} onChange={live.onFormChange} onSubmit={(e) => e.preventDefault()}>
      <input name="email" aria-label="Correo" defaultValue="a@b.co" />
      <AddressFields countryCode="MX" defaults={{ zip: '44100', province: 'Jalisco', city: 'Guadalajara', neighborhood: 'Centro', address1: 'Av. Vallarta 100' }} />
      <DeliveryOptions {...live.optionsProps} />
      <output data-testid="version">{live.quoteVersion}</output>
      <PaymentMethodSection
        choices={buildPayChoices([method])}
        amount={{ amount: '1000.00', currency_code: 'MXN' }}
        scope="cart_1"
        formRef={ref}
        payUrl="/p"
        delivery={live.deliveryValue}
        deliveryReady={live.deliveryReady}
        syncVersion={live.quoteVersion}
        syncDelivery={(d) => syncDelivery(d, live.requote)}
        onDone={() => {}}
        brickProps={{ adapter, storage: null }}
      />
    </form>
  )
}

it('a fixed rate re-quoted with the same id is saved again once, with no address edit', async () => {
  let n = 0
  vi.stubGlobal('fetch', vi.fn(() => json(quote(++n === 1 ? '99.00' : '120.00'))))
  const saves: string[] = []
  const syncDelivery = vi.fn(async (d: string, requote: () => void) => {
    saves.push(d)
    if (saves.length === 1) {
      requote() // the shop's 'requote' path: quote again, then report it
      return 'requote' as const
    }
    return true
  })
  render(<Shop syncDelivery={syncDelivery} />)
  await waitFor(() => expect(Number(screen.getByTestId('version').textContent)).toBeGreaterThanOrEqual(2), { timeout: 5000 })
  await waitFor(() => expect(syncDelivery).toHaveBeenCalledTimes(2), { timeout: 5000 })
  await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
  expect(saves).toEqual(['rate:shipping_flat:std', 'rate:shipping_flat:std'])
  await waitFor(() => expect(screen.queryByText(/tarifas de envío se actualizaron/)).toBeNull())
})
