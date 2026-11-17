// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import type { PaymentAttemptResult, PaymentClient } from '@asteby/storefront'
import { PaymentBrick, resetPaymentSdkCache, type PaymentBrickHandle, type PaymentEvent, type PaymentFormAdapter, type PaymentTransport } from './index.js'

// State machine of the payment with fake timers: a bank challenge that never advances reaches a time limit, shows help,
// and NEVER leaves an endless "processing". Covers: challenge timeout, help + verify now, modal close, pay_blocked_until
// countdown, rejection, approval and a network failure.

const client: PaymentClient = { kind: 'fake', sdk_url: 'https://sdk.example.com/js', public_key: 'TEST-public', options: [{ key: 'card', redirect: false }] }
const total = { amount: '500.00', currency_code: 'MXN' }
const until = (ms: number) => new Date(Date.now() + ms).toISOString()
const challenge = (blockedMs?: number): PaymentAttemptResult => ({
  payment: { provider: 'mp', status: 'requires_action', outcome: 'challenge', action: { type: 'challenge', challenge: { url: 'https://acs.test/c' } } },
  ...(blockedMs ? { checkout: { id: 'c1', status: 'pending', external_order_id: 'x', total, stock_hold_expires_at: null, pay_blocked_until: until(blockedMs) } } : {}),
})
const paid: PaymentAttemptResult = { payment: { provider: 'mp', status: 'paid' } }
const failed: PaymentAttemptResult = { payment: { provider: 'mp', status: 'failed', decline_code: 'insufficient_funds', retryable: true }, attempts_left: 3 }

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

function setup(opts: { submit: () => Promise<PaymentAttemptResult>; refresh: () => PaymentAttemptResult; chooseOther?: () => void }) {
  const events: PaymentEvent[] = []
  const transport: PaymentTransport = { submit: async () => opts.submit(), refresh: async () => opts.refresh() }
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
      pollIntervalMs={1000}
      challengeTimeoutMs={60_000}
      verifyIntervalMs={1000}
      verifyTimeoutMs={30_000}
      newAttemptId={() => `key_${++i}`}
      onEvent={(e) => events.push(e)}
      submitLabel="Pagar ahora"
      {...(opts.chooseOther ? { onChooseOtherMethod: opts.chooseOther } : {})}
    />,
  )
  return { ...utils, events, ref }
}

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
const pay = async () => {
  await advance(10)
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Pagar ahora/ }))
  })
  await advance(10)
}

beforeEach(() => {
  vi.useFakeTimers()
  resetPaymentSdkCache()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('payment state machine: never an endless spinner', () => {
  it('a challenge that never advances reaches its time limit, shows the timeout text and ways out', async () => {
    const { ref, events, container } = setup({ submit: async () => challenge(), refresh: () => challenge() })
    await pay()
    expect(ref.current!.status).toBe('challenge')
    expect(container.querySelector('dialog[data-sf-challenge]')).not.toBeNull()

    // After ~20 s the help shows (visible, with the exits).
    await advance(21_000)
    expect(container.querySelector('[data-sf-challenge-escape] button')).not.toBeNull()
    expect(container.querySelector('[data-sf-challenge-verify]')).not.toBeNull()
    expect(container.querySelector('[data-sf-challenge-reload]')).not.toBeNull()
    expect(container.querySelector('[data-sf-challenge-escape]')!.textContent).toContain('¿Algo salió mal?')

    // Past the limit: the modal is gone and the buyer reads the timeout, not "processing".
    await advance(45_000)
    expect(events).toContainEqual({ type: 'challenge_timeout' })
    expect(ref.current!.status).toBe('blocked')
    expect(ref.current!.challengeTimedOut).toBe(true)
    expect(container.querySelector('dialog[data-sf-challenge]')).toBeNull()
    expect(container.textContent).toContain('Aún no recibimos la confirmación de tu banco')
    expect(container.querySelector('[data-sf-pay-wait]')).not.toBeNull()

    // And the verification itself is bounded: after its window the text says so, with retry and support.
    await advance(35_000)
    expect(ref.current!.verifyTimedOut).toBe(true)
    expect(ref.current!.verifying).toBe(false)
    expect(container.textContent).toContain('Aún no recibimos la confirmación de tu banco')
    expect(container.querySelector('[data-sf-pay-recheck]')).not.toBeNull()
    expect(container.querySelector('[data-sf-pay-support]')!.textContent).toContain('teléfono')
  })

  it('"Verificar estado ahora" reads the server and settles on its answer', async () => {
    let answer = challenge()
    const { ref, container } = setup({ submit: async () => challenge(), refresh: () => answer })
    await pay()
    await advance(21_000)
    answer = paid
    await act(async () => {
      fireEvent.click(container.querySelector('[data-sf-challenge-verify]')!)
    })
    await advance(10)
    expect(ref.current!.status).toBe('approved')
    expect(container.querySelector('dialog[data-sf-challenge]')).toBeNull()
  })

  it('closing the modal explains what happened and offers the actions; "choose another method" calls the shop', async () => {
    const chooseOther = vi.fn()
    const { ref, container } = setup({ submit: async () => challenge(), refresh: () => challenge(), chooseOther })
    await pay()
    await advance(21_000)
    const btn = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-sf-challenge-escape] button')).find((b) => /elegir otro método/.test(b.textContent ?? ''))!
    await act(async () => {
      fireEvent.click(btn)
    })
    expect(chooseOther).toHaveBeenCalledTimes(1)
    expect(ref.current!.status).toBe('blocked')
    expect(container.textContent).toContain('Cerraste la verificación')
    expect(container.textContent).toContain('no vuelvas a pagar')
    expect(container.querySelector('[data-sf-pay-verify]')).not.toBeNull()
    expect(container.querySelector('[data-sf-pay-choose-other]')).not.toBeNull()
  })

  it('pay_blocked_until: countdown with the reason, then "try again" starts a new attempt', async () => {
    const fixed = challenge(90_000) // one fixed server deadline, as the real server reports it
    const { ref, container } = setup({ submit: async () => fixed, refresh: () => fixed })
    await pay()
    await act(async () => ref.current!.cancelChallenge())
    await advance(1100)
    expect(ref.current!.blockedUntil).not.toBeNull()
    expect(container.querySelector('[data-sf-pay-countdown]')!.textContent).toMatch(/evitar cobros dobles.*1:[23]\d/)
    expect(container.querySelector('[data-sf-pay-start-over]')).toBeNull()
    act(() => ref.current!.startOver()) // too early: ignored
    expect(ref.current!.status).toBe('blocked')

    await advance(95_000)
    expect(container.querySelector('[data-sf-pay-countdown-done]')).not.toBeNull()
    const again = container.querySelector('[data-sf-pay-start-over]') as HTMLButtonElement
    expect(again).not.toBeNull()
    const firstKey = ref.current!.attemptId
    await act(async () => {
      fireEvent.click(again)
    })
    await advance(50)
    expect(ref.current!.status).toBe('ready')
    expect(ref.current!.blockedUntil).toBeNull()
    expect(ref.current!.attemptId).not.toBe(firstKey)
  })

  it('a rejection shows a clear reason with retry, and never says "processing"', async () => {
    const { ref, container } = setup({ submit: async () => failed, refresh: () => failed, chooseOther: () => {} })
    await pay()
    expect(ref.current!.outcome?.kind).toBe("rejected")
    expect(container.textContent).toContain('no tiene saldo suficiente')
    expect(container.textContent).not.toContain('Procesando')
    expect(container.querySelector('[data-sf-pay-dismiss]')).not.toBeNull()
    expect(container.querySelector('[data-sf-pay-choose-other]')).not.toBeNull()
  })

  it('an approval is terminal', async () => {
    const { ref } = setup({ submit: async () => paid, refresh: () => paid })
    await pay()
    expect(ref.current!.status).toBe('approved')
    expect(ref.current!.busy).toBe(false)
  })

  it('a network failure says what happened and offers retry with the same attempt', async () => {
    let n = 0
    const { ref, container } = setup({
      submit: async () => {
        n++
        throw new TypeError('Failed to fetch')
      },
      refresh: () => {
        throw new TypeError('Failed to fetch')
      },
    })
    await pay()
    await advance(5000)
    expect(ref.current!.status).toBe('network_error')
    expect(container.textContent).toContain('No pudimos conectar')
    expect(container.textContent).toContain('Reintentar')
    expect(n).toBeGreaterThan(0)
    expect(ref.current!.busy).toBe(false)
  })
})
