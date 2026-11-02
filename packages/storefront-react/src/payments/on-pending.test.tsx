// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import type { PaymentAttemptResult, PaymentClient, PaymentMethod } from '@asteby/storefront'
import { PaymentMethodSection, buildPayChoices, type PaymentFormAdapter, type PaymentTransport } from './index.js'

// A payment that is not approved (pending at the provider: `in_review`) must never reach a success page. With `onPending`
// the section hands it there; without it, the section stays on the page ("under review, do not pay again") and only an
// approval read later reaches `onDone`.

afterEach(() => cleanup())

const client: PaymentClient = { kind: 'fake', sdk_url: 'https://sdk.example.com/js', public_key: 'pk' }
const method: PaymentMethod = { key: 'prov', kind: 'provider', default: true, client, options: [{ key: 'card', redirect: false }] }
const total = { amount: '500.00', currency_code: 'MXN' }
const pending: PaymentAttemptResult = { payment: { provider: 'mp', status: 'pending' } }
const paid: PaymentAttemptResult = { payment: { provider: 'mp', status: 'paid', outcome: 'approved' } }
const adapter: PaymentFormAdapter = {
  kind: 'fake',
  async load() {},
  async mount(o) {
    queueMicrotask(() => o.onReady())
    return { collect: async () => ({ provider_data: { token: 't' } }), unmount() {} }
  },
}

function setup(withPending: boolean, refresh?: PaymentTransport['refresh']) {
  const onDone = vi.fn()
  const onPending = vi.fn()
  const transport: PaymentTransport = { submit: async () => pending, ...(refresh ? { refresh } : {}) }
  const formRef = createRef<HTMLFormElement>()
  render(
    <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
      <PaymentMethodSection
        choices={buildPayChoices([method])}
        amount={total}
        scope="c1"
        formRef={formRef}
        payUrl="/p"
        transport={transport}
        delivery="rate:1"
        syncDelivery={async () => true}
        onDone={onDone}
        {...(withPending ? { onPending } : {})}
        brickProps={{ adapter, storage: null, pollIntervalMs: 5 }}
      />
    </form>,
  )
  return { onDone, onPending }
}

async function pay() {
  const button = await screen.findByRole('button', { name: /Realizar el pedido/ })
  await waitFor(() => expect(button.getAttribute('aria-disabled')).not.toBe('true'))
  fireEvent.click(button)
}

describe('onPending', () => {
  it('in_review goes to onPending, never to onDone', async () => {
    const { onDone, onPending } = setup(true)
    await pay()
    await waitFor(() => expect(onPending).toHaveBeenCalledTimes(1))
    expect(onPending.mock.calls[0]![0].kind).toBe('in_review')
    expect(onDone).not.toHaveBeenCalled()
  })
  it('without onPending, in_review never calls onDone: the page says "under review, do not pay again"', async () => {
    const { onDone } = setup(false)
    await pay()
    await screen.findByText(/Tu pago está en revisión/)
    expect(document.querySelector('[data-sf-pay-status="in_review"]')).not.toBeNull()
    // Give a wrong `onDone` every chance to fire.
    await new Promise((r) => setTimeout(r, 50))
    expect(onDone).not.toHaveBeenCalled()
  })
  it('without onPending, an approval read later (status polling) reaches onDone as approved', async () => {
    let reads = 0
    const { onDone } = setup(false, async () => (++reads >= 2 ? paid : pending))
    await pay()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone.mock.calls[0]![0].kind).toBe('approved')
  })
})
