// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { CheckoutResult, PaymentAttemptResult, PaymentClient, PaymentOutcome } from '@asteby/storefront'
import { PaymentBrick, resetPaymentSdkCache, checkoutToAttempt, type PaymentFormAdapter, type PaymentTransport } from './index.js'

// Production bug (ProtekAuto, MP sandbox): the bank failed the 3DS challenge, OPS kept the checkout `pending` (another
// attempt is allowed) and reported `payment.outcome: 'rejected'` on GET checkouts/:id. The challenge poll read that as
// «pending without an action» (= under review) and the page closed the order: «Gracias por tu compra» with a failed
// payment. The poll goes through the real `checkoutToAttempt`, as the shop's /pagar/estado route does.

const client: PaymentClient = { kind: 'fake', sdk_url: 'https://sdk.example.com/js', public_key: 'TEST-public', options: [{ key: 'card', redirect: false }] }
const total = { amount: '500.00', currency_code: 'MXN' }
const challenge: PaymentAttemptResult = {
  payment: { provider: 'mp', status: 'requires_action', action: { type: 'challenge', challenge: { url: 'https://acs.test/c' } } },
}

const get = (checkoutStatus: string, payment: Record<string, unknown>): CheckoutResult =>
  ({ order: { id: 'o', number: null }, checkout: { id: 'c', status: checkoutStatus, total }, payment: { provider: 'mp', status: 'pending', ...payment } }) as unknown as CheckoutResult

const rejected = get('pending', {
  outcome: 'rejected',
  decline_code: 'authentication_failed',
  next_step: 'retry',
  retryable: true,
  message: 'Tu banco no pudo verificar el pago. Intenta de nuevo o usa otra tarjeta.',
  message_en: 'Your bank could not verify the payment. Try again or use another card.',
  attempts_left: 4,
})
const approved = get('paid', {})
const stillPending = get('pending', { action: { type: 'none' } })

function adapter(): PaymentFormAdapter {
  let n = 0
  return {
    kind: 'fake',
    async load() {},
    async mount(o) {
      queueMicrotask(() => o.onReady())
      return { collect: async () => ({ provider_data: { token: `tok_${++n}` } }), unmount: () => {} }
    },
  }
}

function setup(getResults: CheckoutResult[]) {
  let idx = 0
  const transport: PaymentTransport = {
    submit: async () => challenge,
    refresh: async () => checkoutToAttempt(getResults[Math.min(idx++, getResults.length - 1)]!),
  }
  const onResult = vi.fn<(o: PaymentOutcome) => void>()
  const utils = render(
    <PaymentBrick client={client} amount={total} transport={transport} adapter={adapter()} locale="es-MX" storage={null} scope="chk" retryDelayMs={0} pollIntervalMs={5} verifyIntervalMs={5} submitLabel="Pagar ahora" onResult={onResult} />,
  )
  return { ...utils, onResult }
}

const ready = () => waitFor(() => expect(screen.getByRole('button', { name: /Pagar ahora/ }).getAttribute('aria-disabled')).toBe('false'))
const pay = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Pagar ahora/ }))
  })

beforeEach(() => resetPaymentSdkCache())
afterEach(() => cleanup())

describe('3DS challenge ends in a rejection', () => {
  it('shows the bank reason, never reports the order as received, and lets the buyer try again', async () => {
    const { onResult, container } = setup([get('pending', { action: challenge.payment.action }), rejected])
    await ready()
    await pay()
    await waitFor(() => expect(container.querySelector('dialog[data-sf-challenge]')).not.toBeNull())
    await waitFor(() => expect(onResult.mock.calls.some(([o]) => o.kind === 'rejected')).toBe(true))
    const kinds = onResult.mock.calls.map(([o]) => o.kind)
    expect(kinds).not.toContain('in_review')
    expect(kinds).not.toContain('approved')
    const last = onResult.mock.calls.at(-1)![0]
    expect(last).toMatchObject({ kind: 'rejected', decline_code: 'authentication_failed', retryable: true, next_step: 'retry' })
    await waitFor(() => expect(screen.getByText(/Tu banco no pudo verificar el pago/)).toBeTruthy())
    expect(container.querySelector('dialog[data-sf-challenge]')).toBeNull()
    // A fresh form: PAY is available again for the same purchase.
    await ready()
  })

  it('approved after the challenge still reports approved (thank-you page)', async () => {
    const { onResult } = setup([get('pending', { action: challenge.payment.action }), approved])
    await ready()
    await pay()
    await waitFor(() => expect(onResult.mock.calls.at(-1)![0].kind).toBe('approved'))
    expect(onResult.mock.calls.map(([o]) => o.kind)).not.toContain('rejected')
  })

  it('a really pending payment (no rejection) is still reported as under review', async () => {
    const { onResult } = setup([get('pending', { action: challenge.payment.action }), stillPending])
    await ready()
    await pay()
    await waitFor(() => expect(onResult.mock.calls.at(-1)![0].kind).toBe('in_review'))
  })
})
