// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import type { DeliveryOptions as Delivery } from '@asteby/storefront'
import { AddressFields, DeliveryOptions, DeliveryStatus, useLiveDelivery } from './index.js'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
const flush = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const rates: Delivery = { rates: [{ id: 'a', title: 'a', cost: { amount: '99.00', currency_code: 'MXN' } } as never], pickup: [] }
const empty: Delivery = { rates: [], pickup: [] }
const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))

function Shop({ page, lookup }: { page: Delivery; lookup?: boolean }) {
  const ref = useRef<HTMLFormElement>(null)
  const saved = { address: { zip: '44100', province: 'Jalisco', city: 'Guadalajara', country_code: 'MX' } }
  const live = useLiveDelivery({ formRef: ref, delivery: page, enabled: true, quoteUrl: '/pagar/envio', saved })
  return (
    <form ref={ref} onChange={live.onFormChange}>
      <AddressFields
        countryCode="MX"
        defaults={{ zip: '44100', province: 'Jalisco', city: 'Guadalajara', neighborhood: 'Centro', address1: 'Av. Vallarta 100' }}
        {...(lookup ? { lookupPostalCode: async () => ({ zip: '44100', province: 'Jalisco', city: 'Guadalajara', colonias: ['Centro'] }) as never } : {})}
      />
      <fieldset>
        <DeliveryStatus {...live.statusProps} />
        <DeliveryOptions {...live.optionsProps} />
      </fieldset>
      <output data-testid="ready">{String(live.deliveryReady)}</output>
      <output data-testid="state">{live.state}</output>
      <output data-testid="version">{live.quoteVersion}</output>
    </form>
  )
}

describe('cart loaded with the address already saved', () => {
  for (const lookup of [false, true]) {
    it(`no rates on the page (lookup=${lookup}): quotes by itself on mount`, async () => {
      const f = vi.fn(() => json(rates))
      vi.stubGlobal('fetch', f)
      render(<Shop page={empty} lookup={lookup} />)
      await flush(1500)
      expect(f).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('ready').textContent).toBe('true')
      expect(screen.getByTestId('version').textContent).toBe('1')
    })
    it(`rates on the page (lookup=${lookup}): ready with no request`, async () => {
      const f = vi.fn(() => json(rates))
      vi.stubGlobal('fetch', f)
      render(<Shop page={rates} lookup={lookup} />)
      await flush(1500)
      expect(f).toHaveBeenCalledTimes(0)
      expect(screen.getByTestId('ready').textContent).toBe('true')
    })
  }
})
