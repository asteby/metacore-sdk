// @vitest-environment happy-dom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Money, PaymentAttemptResult, PaymentClient } from '@asteby/storefront'
import { mercadoPagoBricksAdapter, useEmbeddedPayment, type EmbeddedPaymentState, type MercadoPagoCtor, type PaymentTransport } from './index.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const client: PaymentClient = { kind: 'mercadopago_bricks', sdk_url: 'https://sdk.mercadopago.com/js/v2', public_key: 'APP_USR-test', options: [{ key: 'card', redirect: false }] }
const paid: PaymentAttemptResult = { payment: { provider: 'mp', status: 'paid', outcome: 'approved' } }

function brick(failures: number, slowMs = 0) {
  const log = { reads: 0, unmounts: 0, onError: null as null | ((e: unknown) => void) }
  class MP {
    bricks() {
      return {
        create: async (_b: string, _id: string, settings: { callbacks?: { onReady?: () => void; onError?: (e: unknown) => void } }) => {
          log.onError = settings.callbacks?.onError ?? null
          queueMicrotask(() => settings.callbacks?.onReady?.())
          return {
            getFormData: async () => {
              log.reads++
              if (log.reads <= failures) throw { cause: 'secure_fields_card_token_creation_failed' }
              if (slowMs) await new Promise((r) => setTimeout(r, slowMs))
              return { token: `tok_${log.reads}`, payment_method_id: 'master', installments: 1 }
            },
            update: async () => {},
            unmount: async () => {
              log.unmounts++
            },
          }
        },
      }
    }
  }
  return { log, ctor: MP as unknown as MercadoPagoCtor }
}

function setup(failures: number, delay = 50, amount: Money = { amount: '101.16', currency_code: 'MXN' }, slowMs = 0) {
  const b = brick(failures, slowMs)
  const calls: Array<{ key: string; token: unknown; total: string }> = []
  const transport: PaymentTransport = {
    submit: async (req) => {
      calls.push({ key: req.idempotencyKey, token: req.provider_data.token, total: req.expected_total!.amount })
      return paid
    },
  }
  const adapter = mercadoPagoBricksAdapter({ getSdk: () => b.ctor, collectRetryDelayMs: delay })
  const h = { current: null as EmbeddedPaymentState | null }
  function C(p: { amount: Money; on: boolean }) {
    const s = useEmbeddedPayment({ client, amount: p.amount, transport, adapter, sdkTimeoutMs: 2000, storage: null, enabled: p.on })
    h.current = s
    return <div ref={s.containerRef} />
  }
  const r = render(<C amount={amount} on />)
  return { h, b, calls, rerender: (a: Money, on = true) => r.rerender(<C amount={a} on={on} />), unmount: r.unmount }
}

describe('adversarial #1275', () => {
  it('doble clic / clic durante la espera: un solo submit, dos lecturas', async () => {
    const { h, b, calls } = setup(1)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => {
      const p1 = h.current!.submit()
      const p2 = h.current!.submit()
      await new Promise((r) => setTimeout(r, 10))
      const p3 = h.current!.submit()
      await Promise.all([p1, p2, p3])
    })
    expect(b.log.reads).toBe(2)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.token).toBe('tok_2')
    expect(h.current?.status).toBe('approved')
  })

  it('tarjeta incompleta: un solo retraso, error, sin cargo', async () => {
    const { h, b, calls } = setup(99, 400)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    const t0 = Date.now()
    await act(async () => void (await h.current!.submit()))
    const dt = Date.now() - t0
    expect(dt).toBeGreaterThanOrEqual(390)
    expect(dt).toBeLessThan(800)
    expect(b.log.reads).toBe(2)
    expect(calls).toHaveLength(0)
    expect(h.current?.error?.kind).toBe('generic')
  })

  it('cambio de total durante la espera: el cobro lleva el total del clic y el form se actualiza despues', async () => {
    const { h, calls, rerender } = setup(1, 80)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => {
      const p = h.current!.submit()
      await new Promise((r) => setTimeout(r, 10))
      rerender({ amount: '200.00', currency_code: 'MXN' })
      await p
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.total).toBe('101.16')
  })

  it('desmontar el componente durante la espera: no relee ni cobra', async () => {
    const { h, b, calls, unmount } = setup(1, 80)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    let p!: Promise<void>
    act(() => {
      p = h.current!.submit()
    })
    await new Promise((r) => setTimeout(r, 10))
    unmount()
    await p
    await new Promise((r) => setTimeout(r, 120))
    expect(b.log.reads).toBe(1)
    expect(calls).toHaveLength(0)
  })

  it('error critico del Brick durante la espera: queda en fallback, no vuelve a ready', async () => {
    const { h, b, calls } = setup(1, 80)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => {
      const p = h.current!.submit()
      await new Promise((r) => setTimeout(r, 10))
      b.log.onError!({ type: 'critical', cause: 'boom' })
      await p
    })
    expect(b.log.reads).toBe(1)
    expect(calls).toHaveLength(0)
    expect(h.current?.status).toBe('fallback')
  })

  it('deshabilitar el pago (enabled=false) durante la espera: no cobra', async () => {
    const { h, b, calls, rerender } = setup(1, 80)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    let p!: Promise<void>
    act(() => {
      p = h.current!.submit()
    })
    await new Promise((r) => setTimeout(r, 10))
    act(() => rerender({ amount: '101.16', currency_code: 'MXN' }, false))
    await act(async () => void (await p))
    expect(b.log.reads).toBe(1)
    expect(calls).toHaveLength(0)
    expect(h.current?.status).not.toBe('processing')
    expect(h.current?.status).not.toBe('ready')
  })

  it('el form se retira mientras la segunda lectura sigue en curso: el token tardio NO se envia', async () => {
    const { h, b, calls, rerender } = setup(1, 5, { amount: '101.16', currency_code: 'MXN' }, 80)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    let p!: Promise<void>
    act(() => {
      p = h.current!.submit()
    })
    await new Promise((r) => setTimeout(r, 30))
    act(() => rerender({ amount: '101.16', currency_code: 'MXN' }, false))
    await act(async () => void (await p))
    expect(b.log.reads).toBe(2)
    expect(calls).toHaveLength(0)
    expect(h.current?.status).toBe('idle')
  })
})
