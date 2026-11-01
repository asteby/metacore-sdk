// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import type { PaymentAttemptResult, PaymentClient, PaymentMethod } from '@asteby/storefront'
import { PaymentMethodSection, buildPayChoices, type PaymentFormAdapter, type PaymentTransport } from './index.js'

// A payment that is not approved (pending at the provider: `in_review`) must never reach a success page. With `onPending`
// the section hands it there; without it, `onDone` keeps the old behaviour (backward compatible).

afterEach(() => cleanup())

const client: PaymentClient = { kind: 'fake', sdk_url: 'https://sdk.example.com/js', public_key: 'pk' }
const method: PaymentMethod = { key: 'prov', kind: 'provider', default: true, client, options: [{ key: 'card', redirect: false }] }
const total = { amount: '500.00', currency_code: 'MXN' }
const pending: PaymentAttemptResult = { payment: { provider: 'mp', status: 'pending' } }
const adapter: PaymentFormAdapter = {
  kind: 'fake',
  async load() {},
  async mount(o) {
    queueMicrotask(() => o.onReady())
    return { collect: async () => ({ provider_data: { token: 't' } }), unmount() {} }
  },
}

function setup(withPending: boolean) {
  const onDone = vi.fn()
  const onPending = vi.fn()
  const transport: PaymentTransport = { submit: async () => pending }
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
        brickProps={{ adapter, storage: null }}
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
  it('without onPending, onDone as before (compatible)', async () => {
    const { onDone } = setup(false)
    await pay()
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })
})
