// @vitest-environment happy-dom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Money, PaymentAttemptResult, PaymentClient } from '@asteby/storefront'
import { useEmbeddedPayment, type EmbeddedPaymentState, type PaymentFormAdapter, type PaymentTransport } from './index.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const client: PaymentClient = { kind: 'mercadopago_bricks', sdk_url: 'https://sdk.mercadopago.com/js/v2', public_key: 'APP_USR-test', options: [{ key: 'card', redirect: false }] }
const money: Money = { amount: '77.99', currency_code: 'USD' }
const paid: PaymentAttemptResult = { payment: { provider: 'stripe', status: 'paid', outcome: 'approved' } }

/** Adapter whose form becomes ready only when the test says so (`open()`), or fails when `fail()` is called. */
function gatedAdapter() {
  let open: () => void = () => {}
  let fail: () => void = () => {}
  const gate = new Promise<void>((resolve, reject) => {
    open = resolve
    fail = () => reject(new Error('form failed'))
  })
  gate.catch(() => {})
  const adapter: PaymentFormAdapter = {
    kind: 'mercadopago_bricks',
    load: async () => {},
    mount: async (opts) => {
      await gate
      opts.onReady()
      return { collect: async () => ({ provider_data: { token: 'tok_1' } }), unmount: () => {} }
    },
  }
  return { adapter, open: () => open(), fail: () => fail() }
}

function mountHook(adapter: PaymentFormAdapter, transport: PaymentTransport, extra: Record<string, unknown> = {}) {
  const h = { current: null as EmbeddedPaymentState | null }
  function C() {
    const s = useEmbeddedPayment({ client, amount: money, transport, adapter, sdkTimeoutMs: 2000, mountRetries: 0, storage: null, ...extra })
    h.current = s
    return <div ref={s.containerRef} />
  }
  render(<C />)
  return h
}

describe('clic en PAGAR mientras el formulario se prepara', () => {
  it('no se pierde: se guarda y el cobro sale solo cuando el formulario esta listo (un solo cobro)', async () => {
    const gated = gatedAdapter()
    const submit = vi.fn(async () => paid)
    const h = mountHook(gated.adapter, { submit })
    await waitFor(() => expect(h.current?.status).toBe('loading'))
    expect(h.current?.preparing).toBe(true)

    let pressed: Promise<void> = Promise.resolve()
    await act(async () => {
      pressed = h.current!.submit()
      // un segundo clic impaciente comparte la misma espera, no encola otro cobro
      void h.current!.submit()
    })
    expect(submit).not.toHaveBeenCalled()

    await act(async () => gated.open())
    await act(async () => void (await pressed))
    expect(h.current?.status).toBe('approved')
    expect(h.current?.preparing).toBe(false)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('si el formulario no llega a estar disponible, el clic guardado se descarta sin tocar al servidor', async () => {
    const gated = gatedAdapter()
    const submit = vi.fn(async () => paid)
    const h = mountHook(gated.adapter, { submit })
    await waitFor(() => expect(h.current?.status).toBe('loading'))
    let pressed: Promise<void> = Promise.resolve()
    await act(async () => {
      pressed = h.current!.submit()
    })
    await act(async () => gated.fail())
    await act(async () => void (await pressed))
    expect(submit).not.toHaveBeenCalled()
    expect(['fallback', 'idle']).toContain(h.current?.status)
  })
})

describe('cobro lento: el servidor ya cobro pero la respuesta no llega', () => {
  it('pasados slowSubmitMs se pregunta al servidor y, si ya resolvio el pago, se termina con eso', async () => {
    const gated = gatedAdapter()
    let hung = false
    const refresh = vi.fn(async () => paid)
    const transport: PaymentTransport = {
      submit: () => {
        hung = true
        return new Promise<PaymentAttemptResult>(() => {}) // la respuesta nunca llega
      },
      refresh,
    }
    const h = mountHook(gated.adapter, transport, { slowSubmitMs: 20, slowSubmitPollMs: 20 })
    await act(async () => gated.open())
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => {
      void h.current!.submit()
    })
    await waitFor(() => expect(h.current?.status).toBe('approved'), { timeout: 2000 })
    expect(hung).toBe(true)
    expect(refresh).toHaveBeenCalled()
  })

  it('si el servidor aun no resuelve, sigue preguntando y no inventa un resultado', async () => {
    const gated = gatedAdapter()
    let n = 0
    const refresh = vi.fn(async (): Promise<PaymentAttemptResult> => {
      n++
      return n < 3 ? { payment: { provider: 'stripe', status: 'processing', outcome: 'in_review' } } : paid
    })
    const transport: PaymentTransport = { submit: () => new Promise<PaymentAttemptResult>(() => {}), refresh }
    const h = mountHook(gated.adapter, transport, { slowSubmitMs: 10, slowSubmitPollMs: 10 })
    await act(async () => gated.open())
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => {
      void h.current!.submit()
    })
    await waitFor(() => expect(h.current?.status).toBe('approved'), { timeout: 2000 })
    expect(refresh.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('sin transport.refresh no hay vigilante: manda la respuesta del cobro', async () => {
    const gated = gatedAdapter()
    const transport: PaymentTransport = { submit: async () => paid }
    const h = mountHook(gated.adapter, transport, { slowSubmitMs: 5 })
    await act(async () => gated.open())
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => void (await h.current!.submit()))
    expect(h.current?.status).toBe('approved')
  })

  it('una respuesta normal rapida no deja el vigilante corriendo (no se consulta al servidor)', async () => {
    const gated = gatedAdapter()
    const refresh = vi.fn(async () => paid)
    const transport: PaymentTransport = { submit: async () => paid, refresh }
    const h = mountHook(gated.adapter, transport, { slowSubmitMs: 50, slowSubmitPollMs: 10 })
    await act(async () => gated.open())
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => void (await h.current!.submit()))
    await new Promise((r) => setTimeout(r, 120))
    expect(h.current?.status).toBe('approved')
    expect(refresh).not.toHaveBeenCalled()
  })
})
