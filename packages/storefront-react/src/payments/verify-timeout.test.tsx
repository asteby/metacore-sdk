// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import type { PaymentAttemptResult, PaymentClient } from '@asteby/storefront'
import { PaymentBrick, resetPaymentSdkCache, type PaymentBrickHandle, type PaymentEvent, type PaymentFormAdapter, type PaymentSubmitRequest, type PaymentTransport } from './index.js'

// A bank challenge the buyer left (or a lost answer) is an UNKNOWN outcome: the hook checks it in the background for a
// while. When that window closes and the bank still has not answered, the page must hear about it (`verify_timeout`,
// `verifyTimedOut`) so it can offer a way out instead of an endless "verifying" spinner. Nothing about the payment
// changes: same attempt key, no new charge from the form, and `recheck()` only reads the state again.

const client: PaymentClient = { kind: 'fake', sdk_url: 'https://sdk.example.com/js', public_key: 'TEST-public', options: [{ key: 'card', redirect: false }] }
const total = { amount: '500.00', currency_code: 'MXN' }
const challenge: PaymentAttemptResult = {
  payment: { provider: 'mp', status: 'requires_action', action: { type: 'challenge', challenge: { url: 'https://acs.test/c' } } },
}
const paid: PaymentAttemptResult = { payment: { provider: 'mp', status: 'paid' } }

function adapter(): PaymentFormAdapter {
  return {
    kind: 'fake',
    async load() {},
    async mount(o) {
      queueMicrotask(() => o.onReady())
      return { collect: async () => ({ provider_data: { token: 'tok' } }), unmount: () => {} }
    },
  }
}

function setup(refresh: () => PaymentAttemptResult) {
  const calls: PaymentSubmitRequest[] = []
  const events: PaymentEvent[] = []
  const transport: PaymentTransport = {
    submit: async (req) => (calls.push(req), challenge),
    refresh: async () => refresh(),
  }
  const ref = createRef<PaymentBrickHandle>()
  const keys = new Map<string, string>()
  const storage = { getItem: (k: string) => keys.get(k) ?? null, setItem: (k: string, v: string) => void keys.set(k, v), removeItem: (k: string) => void keys.delete(k) }
  const utils = render(
    <PaymentBrick
      ref={ref}
      client={client}
      amount={total}
      transport={transport}
      adapter={adapter()}
      locale="es-MX"
      storage={storage}
      scope="chk"
      retryDelayMs={0}
      pollIntervalMs={5}
      pollTimeoutMs={40}
      verifyIntervalMs={5}
      verifyTimeoutMs={40}
      newAttemptId={() => 'key_1'}
      onEvent={(e) => events.push(e)}
      submitLabel="Pagar ahora"
    />,
  )
  return { ...utils, calls, events, ref }
}

const ready = () => waitFor(() => expect(screen.getByRole('button', { name: /Pagar ahora/ }).getAttribute('aria-disabled')).toBe('false'))

beforeEach(() => resetPaymentSdkCache())
afterEach(() => cleanup())

describe('verify_timeout: an unknown outcome never spins forever', () => {
  it('announces the timeout, keeps the attempt and the lock, and recheck() settles on the real answer', async () => {
    let answer: PaymentAttemptResult = challenge
    const { calls, events, ref, container } = setup(() => answer)
    await ready()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Pagar ahora/ }))
    })
    await waitFor(() => expect(container.querySelector('dialog[data-sf-challenge]')).not.toBeNull())
    act(() => ref.current!.cancelChallenge())
    expect(ref.current!.verifying || ref.current!.status === 'blocked').toBe(true)

    // The bank keeps the challenge open past the window: timed out, still locked, same attempt.
    await waitFor(() => expect(ref.current!.verifyTimedOut).toBe(true))
    expect(events).toContainEqual({ type: 'verify_timeout' })
    expect(ref.current!.verifying).toBe(false)
    expect(ref.current!.status).toBe('blocked')
    expect(ref.current!.attemptId).toBe('key_1')
    await act(async () => {
      await ref.current!.submit()
    })
    expect(calls).toHaveLength(1)

    // A new check (same attempt) reads the bank's real answer.
    answer = paid
    act(() => ref.current!.recheck())
    await waitFor(() => expect(ref.current!.status).toBe('approved'))
    expect(ref.current!.verifyTimedOut).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('recheck() does nothing when there is no unknown outcome', async () => {
    const { events, ref } = setup(() => challenge)
    await ready()
    act(() => ref.current!.recheck())
    expect(ref.current!.status).toBe('ready')
    expect(ref.current!.verifyTimedOut).toBe(false)
    expect(events.some((e) => e.type === 'verify_timeout')).toBe(false)
  })
})
