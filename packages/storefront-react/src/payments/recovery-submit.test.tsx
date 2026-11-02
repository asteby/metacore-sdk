// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import type { PaymentClient, PaymentMethod } from '@asteby/storefront'
import { PaymentHttpError, PaymentMethodSection, buildPayChoices, usePaymentRecovery, type PaymentFormAdapter, type PaymentIssue, type PaymentTransport } from './index.js'

afterEach(() => cleanup())

const issue = (kind: PaymentIssue['kind'], code = 'c', status = 500): PaymentIssue =>
  kind === 'confirming' || kind === 'verifying' ? { kind, message: 'x' } : { kind, message: 'x', retryable: false, status, code }

// Seen in production: after a rejection the buyer typed the card again and pressed "pay" (not "retry payment"); the
// "the charge did not go through" notice stayed on screen next to the new attempt's "your bank needs to verify".
describe('usePaymentRecovery: a new charge clears the notice of the previous definitive failure', () => {
  it.each(['rejected', 'provider_declined', 'other', 'form_failed'] as const)('%s is cleared on submit', (kind) => {
    const { result } = renderHook(() => usePaymentRecovery({ scope: 'cart_1', storage: null }))
    act(() => result.current.setNotice({ kind }))
    act(() => result.current.onEvent({ type: 'submit' }))
    expect(result.current.notice).toBeNull()
  })

  it('the rejection notice from a result event is cleared by the next submit, and lastIssue is reset', () => {
    const { result } = renderHook(() => usePaymentRecovery({ scope: 'cart_1', storage: null }))
    act(() => result.current.onIssue(issue('provider_declined')))
    act(() => result.current.onEvent({ type: 'result', status: 'rejected', decline_code: 'declined' }))
    expect(result.current.notice).toEqual({ kind: 'rejected' })
    act(() => result.current.onIssue(issue('other')))
    act(() => result.current.onEvent({ type: 'submit' }))
    expect(result.current.notice).toBeNull()
    expect(result.current.lastIssue.current).toBeNull()
  })

  it('keeps the notices that are not about a failed charge (confirming, merchant config, stale checkout)', () => {
    const { result } = renderHook(() => usePaymentRecovery({ scope: 'cart_1', storage: null }))
    for (const kind of ['confirming', 'merchant_config', 'stale_checkout'] as const) {
      act(() => result.current.setNotice({ kind }))
      act(() => result.current.onEvent({ type: 'submit' }))
      expect(result.current.notice).toEqual({ kind })
    }
  })

  it('never forgets an UNKNOWN outcome on submit: retry() still refuses a new key', () => {
    const { result } = renderHook(() => usePaymentRecovery({ scope: 'cart_1', storage: null }))
    act(() => result.current.onIssue(issue('transient')))
    act(() => result.current.onEvent({ type: 'submit' }))
    expect(result.current.lastIssue.current?.kind).toBe('transient')
    let ok = true
    act(() => {
      ok = result.current.retry()
    })
    expect(ok).toBe(false)
  })

  it('out of stock at checkout shows no "retry payment" notice (the card form points to the cart)', () => {
    const { result } = renderHook(() => usePaymentRecovery({ scope: 'cart_1', storage: null }))
    act(() => result.current.onIssue(issue('other', 'insufficient_stock', 409)))
    expect(result.current.notice).toBeNull()
  })
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

describe('PaymentMethodSection: a product ran out while paying (409 insufficient_stock)', () => {
  it('says so (not "try again"), offers the way back to the cart and never calls onDone', async () => {
    const onDone = vi.fn()
    const onEvent = vi.fn()
    const transport: PaymentTransport = {
      submit: async () => {
        throw new PaymentHttpError(409, 'insufficient_stock', 'no hay existencias suficientes de «Balata»', undefined, { retryable: false, kind: 'other' })
      },
    }
    const formRef = createRef<HTMLFormElement>()
    render(
      <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
        <PaymentMethodSection
          choices={buildPayChoices([method])}
          amount={{ amount: '500.00', currency_code: 'MXN' }}
          scope="c1"
          formRef={formRef}
          payUrl="/p"
          transport={transport}
          rebuildHref="/carrito"
          onDone={onDone}
          onEvent={onEvent}
          brickProps={{ adapter, storage: null }}
        />
      </form>,
    )
    const button = await screen.findByRole('button', { name: /Realizar el pedido/ })
    await waitFor(() => expect(button.getAttribute('aria-disabled')).not.toBe('true'))
    fireEvent.click(button)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/se agotaron/)
    expect(alert.textContent).not.toMatch(/Intenta de nuevo/)
    expect(onEvent).toHaveBeenCalledWith({ type: 'error', kind: 'out_of_stock' })
    const link = await screen.findByRole('link', { name: 'Revisar mi carrito' })
    expect(link.getAttribute('href')).toBe('/carrito')
    expect(onDone).not.toHaveBeenCalled()
  })
})
