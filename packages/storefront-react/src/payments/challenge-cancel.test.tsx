// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef, useState } from 'react'
import type { PaymentAttemptResult, PaymentClient, PaymentOutcome } from '@asteby/storefront'
import { PaymentBrick, PaymentChallenge, resetPaymentSdkCache, type PaymentBrickHandle, type PaymentFormAdapter, type PaymentSubmitRequest, type PaymentTransport } from './index.js'

// The buyer's emergency exit from a 3DS challenge must never open a second charge: the bank may still approve the
// first attempt (the buyer typed the code just before leaving). The outcome is unknown until reconciled, so the SAME
// attempt key stays and the hook verifies through `refresh`; only a definitive failure gives a fresh attempt.

const client: PaymentClient = { kind: 'fake', sdk_url: 'https://sdk.example.com/js', public_key: 'TEST-public', options: [{ key: 'card', redirect: false }] }
const total = { amount: '500.00', currency_code: 'MXN' }
const challenge: PaymentAttemptResult = {
  payment: { provider: 'mp', status: 'requires_action', action: { type: 'challenge', challenge: { url: 'https://acs.test/c' } } },
}
const paid: PaymentAttemptResult = { payment: { provider: 'mp', status: 'paid' } }
const failed: PaymentAttemptResult = { payment: { provider: 'mp', status: 'failed', decline_code: 'auth_failed' as never, retryable: true }, attempts_left: 4 }

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

function setup(refreshResults: PaymentAttemptResult[]) {
  const calls: PaymentSubmitRequest[] = []
  let refreshIdx = 0
  const transport: PaymentTransport = {
    submit: async (req) => (calls.push(req), calls.length === 1 ? challenge : paid),
    refresh: async () => refreshResults[Math.min(refreshIdx++, refreshResults.length - 1)]!,
  }
  const ref = createRef<PaymentBrickHandle>()
  const keys = new Map<string, string>()
  const storage = { getItem: (k: string) => keys.get(k) ?? null, setItem: (k: string, v: string) => void keys.set(k, v), removeItem: (k: string) => void keys.delete(k) }
  let i = 0
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
      verifyIntervalMs={5}
      newAttemptId={() => `key_${++i}`}
      submitLabel="Pagar ahora"
    />,
  )
  return { ...utils, calls, ref }
}

const ready = () => waitFor(() => expect(screen.getByRole('button', { name: /Pagar ahora/ }).getAttribute('aria-disabled')).toBe('false'))
const pay = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Pagar ahora/ }))
  })

beforeEach(() => resetPaymentSdkCache())
afterEach(() => cleanup())

describe('cancelChallenge: unknown outcome, never a second charge', () => {
  it('keeps the attempt key, blocks a new payment and settles on the bank answer (approved after leaving)', async () => {
    // refresh: still the challenge while the modal is open, then the bank approves the first attempt.
    const { calls, ref, container } = setup([challenge, challenge, challenge, paid])
    await ready()
    await pay()
    await waitFor(() => expect(container.querySelector('dialog[data-sf-challenge]')).not.toBeNull())
    const key = ref.current!.attemptId
    expect(key).toBe('key_1')
    act(() => ref.current!.cancelChallenge())
    // Modal gone, but the buyer cannot pay again with a new key while the outcome is unknown.
    expect(container.querySelector('dialog[data-sf-challenge]')).toBeNull()
    expect(ref.current!.status).not.toBe('ready')
    await act(async () => {
      await ref.current!.submit()
    })
    expect(calls).toHaveLength(1)
    await waitFor(() => expect(ref.current!.status).toBe('approved'))
    expect(calls).toHaveLength(1)
    expect(calls.every((c) => c.idempotencyKey === 'key_1')).toBe(true)
  })

  it('does not reopen the modal while the bank still waits, and gives a fresh attempt only after a definitive failure', async () => {
    const { calls, ref, container } = setup([challenge, challenge, challenge, failed])
    await ready()
    await pay()
    await waitFor(() => expect(container.querySelector('dialog[data-sf-challenge]')).not.toBeNull())
    act(() => ref.current!.cancelChallenge())
    await waitFor(() => expect(ref.current!.outcome?.kind).toBe('rejected'))
    expect(container.querySelector('dialog[data-sf-challenge]')).toBeNull()
    await ready()
    await pay()
    expect(calls).toHaveLength(2)
    expect(calls[1]!.idempotencyKey).not.toBe(calls[0]!.idempotencyKey)
  })
})

describe('PaymentChallenge dialog', () => {
  const outcome = { kind: 'challenge', challenge: { url: 'https://acs.test/c' } } as unknown as PaymentOutcome

  it('the exit timer survives a parent re-render with a new onCancel function', () => {
    vi.useFakeTimers()
    try {
      let bump!: () => void
      function Host() {
        const [n, setN] = useState(0)
        bump = () => setN((x) => x + 1)
        return <PaymentChallenge outcome={outcome} onCancel={() => void n} escapeAfterMs={1000} />
      }
      const { container } = render(<Host />)
      act(() => vi.advanceTimersByTime(600))
      act(() => bump())
      act(() => vi.advanceTimersByTime(500))
      expect(container.querySelector('[data-sf-challenge-escape] button')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('announces the exit when it appears (live region present from the start)', () => {
    vi.useFakeTimers()
    try {
      const { container } = render(<PaymentChallenge outcome={outcome} onCancel={() => {}} escapeAfterMs={1000} />)
      const live = container.querySelector('[data-sf-challenge-escape]')
      expect(live?.getAttribute('aria-live')).toBe('polite')
      act(() => vi.advanceTimersByTime(1001))
      expect(container.querySelector('[data-sf-challenge-escape] button')).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('if the browser closes the dialog anyway (repeated Esc / Android back), the buyer can reopen the verification', () => {
    const { container } = render(<PaymentChallenge outcome={outcome} onCancel={() => {}} />)
    const dlg = container.querySelector('dialog[data-sf-challenge]') as HTMLDialogElement
    act(() => {
      dlg.close()
      dlg.dispatchEvent(new Event('close'))
    })
    const reopen = container.querySelector('[data-sf-challenge-reopen]') as HTMLButtonElement
    expect(reopen).not.toBeNull()
    act(() => fireEvent.click(reopen))
    expect(dlg.open).toBe(true)
  })
})
