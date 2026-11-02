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

function setup(withPending: boolean, refresh?: PaymentTransport['refresh'], pollTimeoutMs = 300_000) {
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
        brickProps={{ adapter, storage: null, pollIntervalMs: 5, pollTimeoutMs }}
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
  it('without onPending, the button never stays "processing": it reads "under review" and cannot charge again', async () => {
    const submit = vi.fn(async () => pending)
    const onDone = vi.fn()
    const formRef = createRef<HTMLFormElement>()
    render(
      <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
        <PaymentMethodSection
          choices={buildPayChoices([method])}
          amount={total}
          scope="c1"
          formRef={formRef}
          payUrl="/p"
          transport={{ submit, refresh: async () => pending }}
          onDone={onDone}
          brickProps={{ adapter, storage: null, pollIntervalMs: 5 }}
        />
      </form>,
    )
    await pay()
    const button = await screen.findByRole('button', { name: /Pago en revisión/ })
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(button.getAttribute('aria-busy')).not.toBe('true')
    fireEvent.click(button)
    await new Promise((r) => setTimeout(r, 30))
    expect(submit).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
  })
  it('without onPending, when the polling window closes with no answer: a way out ("check my payment") that re-reads and can reach onDone', async () => {
    let approve = false
    const { onDone } = setup(false, async () => (approve ? paid : pending), 40)
    await pay()
    const again = await screen.findByRole('button', { name: 'Verificar mi pago' })
    expect(screen.getByText(/Todavía no tenemos la respuesta de tu banco/)).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
    approve = true
    fireEvent.click(again)
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(onDone.mock.calls[0]![0].kind).toBe('approved')
  })
  it('without onPending and without a status endpoint: the way out shows at once (never a dead button)', async () => {
    setup(false)
    await pay()
    await screen.findByRole('button', { name: 'Verificar mi pago' })
    expect(screen.getByRole('button', { name: /Pago en revisión/ }).getAttribute('aria-disabled')).toBe('true')
  })
  it('with onPending nothing of this shows (the shop owns the pending screen)', async () => {
    const { onPending } = setup(true)
    await pay()
    await waitFor(() => expect(onPending).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('button', { name: 'Verificar mi pago' })).toBeNull()
  })
  it('without onPending, switching to another row while the review is polling never leaves a dead button: the way out shows on any row', async () => {
    const twoRows: PaymentMethod = { ...method, options: [{ key: 'card', redirect: false }, { key: 'wallet', redirect: true, label: 'Mi cuenta' }] }
    const onDone = vi.fn()
    const formRef = createRef<HTMLFormElement>()
    render(
      <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
        <PaymentMethodSection
          choices={buildPayChoices([twoRows])}
          amount={total}
          scope="c1"
          formRef={formRef}
          payUrl="/p"
          transport={{ submit: async () => pending, refresh: async () => pending }}
          onDone={onDone}
          rememberChoice={false}
          brickProps={{ adapter, storage: null, pollIntervalMs: 5 }}
        />
      </form>,
    )
    await pay()
    await screen.findByRole('button', { name: /Pago en revisión/ })
    expect(screen.queryByRole('button', { name: 'Verificar mi pago' })).toBeNull()
    // The buyer picks the other row: the card form (and its polling) leaves the page.
    fireEvent.click(screen.getByRole('radio', { name: /Mi cuenta/ }))
    const again = await screen.findByRole('button', { name: 'Verificar mi pago' })
    // Intentional: no second payment of any kind while the first is under review.
    expect(screen.getByRole('button', { name: /Pago en revisión/ }).getAttribute('aria-disabled')).toBe('true')
    // Back to the card: the exit is still there (the new form is not in review; it reloads the page).
    fireEvent.click(screen.getByRole('radio', { name: /Tarjeta/ }))
    expect(screen.getByRole('button', { name: 'Verificar mi pago' })).toBe(again)
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } })
    try {
      fireEvent.click(again)
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
    expect(onDone).not.toHaveBeenCalled()
  })
})
