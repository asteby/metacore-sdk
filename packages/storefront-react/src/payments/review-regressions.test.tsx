// @vitest-environment happy-dom
// Regresiones de la revisión del PR #1252: el resultado indeterminado nunca cambia de clave ni de token.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { type Money, type PaymentAttemptResult, type PaymentClient } from '@asteby/storefront'
import {
  createFetchTransport,
  createResilientTransport,
  mercadoPagoBricksAdapter,
  payErrorResponse,
  useEmbeddedPayment,
  usePaymentRecovery,
  type EmbeddedPaymentState,
  type MercadoPagoCtor,
  type PaymentTransport,
} from './index.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const client: PaymentClient = { kind: 'mercadopago_bricks', sdk_url: 'https://sdk.mercadopago.com/js/v2', public_key: 'APP_USR-test', options: [{ key: 'card', redirect: false }] }
const money = (n: number): Money => ({ amount: n.toFixed(2), currency_code: 'MXN' })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const paid: PaymentAttemptResult = { payment: { provider: 'mp', status: 'paid', outcome: 'approved' } }

/** MP falso: tokens de UN solo uso (tok_1, tok_2...), create/unmount/update asíncronos. */
function fakeMP(opts: { createMs?: number; collectMs?: number; failUpdate?: boolean } = {}) {
  const log = { creates: 0, alive: 0, maxAlive: 0, missing: 0, tokens: 0 }
  class MP {
    bricks() {
      return {
        create: async (_b: string, id: string, settings: { callbacks?: { onReady?: () => void } }) => {
          log.creates++
          if (!document.getElementById(id)) {
            log.missing++
            throw new Error('container_not_found')
          }
          await sleep(opts.createMs ?? 5)
          if (!document.getElementById(id)) throw new Error('container_not_found')
          log.alive++
          log.maxAlive = Math.max(log.maxAlive, log.alive)
          queueMicrotask(() => settings.callbacks?.onReady?.())
          return {
            getFormData: async () => {
              await sleep(opts.collectMs ?? 0)
              return { token: `tok_${++log.tokens}`, payment_method_id: 'visa', installments: 1 }
            },
            unmount: async () => {
              await sleep(3)
              log.alive--
            },
            update: async () => {
              await sleep(3)
              if (opts.failUpdate) throw new Error('update failed')
            },
          }
        },
      }
    }
  }
  return { log, ctor: MP as unknown as MercadoPagoCtor }
}

/**
 * OPS + ruta de la tienda falsos, con la semántica REAL de cartsvc/pay.go: la clave se ata al hash de provider_data;
 * misma clave + otro token = 409 conflict; un intento sin resolver bloquea cualquier otra clave (409 payment_in_progress).
 * `plan` decide qué pasa con la respuesta de cada intento NUEVO: 'lost' = OPS cobra pero la respuesta se pierde.
 */
function fakeShop(plan: { firstNew: 'lost' | 'html500' | 'ok'; replay?: 'lost' | 'ok'; status?: 'none' | 'paid' }) {
  const attempts = new Map<string, { token: string; charged: boolean }>()
  const log = { charges: 0, payCalls: [] as Array<{ key: string; token: string; expected?: string }>, statusCalls: 0 }
  let news = 0
  const opsErr = (status: number, code: string, field?: string) => {
    const r = payErrorResponse({ status, code, message: 'x', ...(field ? { field } : {}) })
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } })
  }
  const fetch = (async (url: string, init: RequestInit) => {
    if (String(url).includes('estado')) {
      log.statusCalls++
      const charged = [...attempts.values()].some((a) => a.charged)
      if (plan.status === 'paid' && charged) return new Response(JSON.stringify(paid), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ payment: { provider: '', status: 'none' }, recoverable: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    const key = (init.headers as Record<string, string>)['Idempotency-Key']!
    const body = JSON.parse(String(init.body)) as { provider_data: { token: string }; expected_total?: { amount: string } }
    const token = body.provider_data.token
    log.payCalls.push({ key, token, ...(body.expected_total ? { expected: body.expected_total.amount } : {}) })
    const existing = attempts.get(key)
    if (existing) {
      if (existing.token !== token) return opsErr(409, 'conflict', 'Idempotency-Key')
      if (plan.replay === 'lost') throw new TypeError('Failed to fetch')
      return new Response(JSON.stringify(paid), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    if ([...attempts.values()].some((a) => a.charged)) return opsErr(409, 'payment_in_progress', 'payment_in_progress')
    attempts.set(key, { token, charged: true })
    log.charges++
    news++
    if (news === 1 && plan.firstNew === 'lost') throw new TypeError('Failed to fetch')
    if (news === 1 && plan.firstNew === 'html500') return new Response('<html>Internal Server Error</html>', { status: 500, headers: { 'Content-Type': 'text/html' } })
    return new Response(JSON.stringify(paid), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }) as unknown as typeof globalThis.fetch
  return { fetch, log }
}

function mountHook(transport: PaymentTransport, extra: Partial<Parameters<typeof useEmbeddedPayment>[0]> = {}, amount = money(100)) {
  const mp = fakeMP()
  const adapter = mercadoPagoBricksAdapter({ getSdk: () => mp.ctor })
  const h = { current: null as EmbeddedPaymentState | null }
  function C({ amt }: { amt: Money }) {
    const s = useEmbeddedPayment({ client, amount: amt, transport, adapter, sdkTimeoutMs: 2000, verifyIntervalMs: 10, ...extra })
    h.current = s
    return <div ref={s.containerRef} />
  }
  const view = render(<C amt={amount} />)
  return { h, mp, view, rerender: (a: Money) => view.rerender(<C amt={a} />) }
}


describe('resultado indeterminado: misma clave', () => {
  it('500 sin cuerpo JSON con createFetchTransport: network_error, la clave se conserva', async () => {
    sessionStorage.clear()
    const shop = fakeShop({ firstNew: 'html500' })
    const transport = createFetchTransport('/pagar/cobrar', { fetch: shop.fetch })
    const { h } = mountHook(transport, { autoRetries: 0, storage: sessionStorage })
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => void (await h.current!.submit()))
    expect(h.current?.status).toBe('network_error')
    expect(h.current?.error?.kind).toBe('network')
    const k1 = shop.log.payCalls[0]!.key
    expect(sessionStorage.getItem('sf:pay:attempt:default')).toBe(k1)
    await act(async () => void (await h.current!.submit()))
    expect(new Set(shop.log.payCalls.map((c) => c.key))).toEqual(new Set([k1]))
    expect(shop.log.charges).toBe(1)
  })

  it('PAGAR en network_error delega en retry(): misma clave y MISMO token', async () => {
    sessionStorage.clear()
    const shop = fakeShop({ firstNew: 'lost', replay: 'ok' })
    const transport = createResilientTransport({ payUrl: '/pagar/cobrar', statusUrl: '/pagar/estado', fields: () => ({}), fetch: shop.fetch, sleep: async () => {} })
    // Primer intento y reintento del transporte pierden la respuesta; el siguiente submit() ya la recibe.
    let lose = 3
    const lossy = ((u: string, i: RequestInit) => (!String(u).includes('estado') && lose-- > 0 ? Promise.reject(new TypeError('Failed to fetch')) : shop.fetch(u, i))) as unknown as typeof fetch
    const t2 = createResilientTransport({ payUrl: '/pagar/cobrar', statusUrl: '/pagar/estado', fields: () => ({}), fetch: lossy, sleep: async () => {} })
    void transport
    const { h } = mountHook(t2, { autoRetries: 0, storage: sessionStorage, verifyTimeoutMs: 50 })
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => void (await h.current!.submit()))
    expect(h.current?.status).toBe('network_error')
    await act(async () => void (await h.current!.submit()))
    expect(h.current?.status).toBe('approved')
    expect(new Set(shop.log.payCalls.map((c) => c.key)).size).toBe(1)
    expect(new Set(shop.log.payCalls.map((c) => c.token)).size).toBe(1)
    expect(shop.log.charges).toBe(1)
  })

  it('sin almacenamiento (storage: null) retry() reusa la clave', async () => {
    const keys: string[] = []
    let n = 0
    const transport: PaymentTransport = {
      submit: async (r) => {
        keys.push(r.idempotencyKey)
        if (n++ === 0) throw Object.assign(new Error('net'), { status: 0, code: 'network' })
        return paid
      },
    }
    const { h } = mountHook(transport, { autoRetries: 0, storage: null })
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => void (await h.current!.submit()))
    expect(h.current?.status).toBe('network_error')
    await act(async () => void (await h.current!.retry()))
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  it('sessionStorage que lanza al leer: la clave vive en memoria', async () => {
    const keys: string[] = []
    let n = 0
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {},
    }
    const transport: PaymentTransport = {
      submit: async (r) => {
        keys.push(r.idempotencyKey)
        if (n++ === 0) throw Object.assign(new Error('net'), { status: 0, code: 'network' })
        return paid
      },
    }
    const { h } = mountHook(transport, { autoRetries: 0, storage: blocked })
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => void (await h.current!.submit()))
    await act(async () => void (await h.current!.retry()))
    expect(keys[0]).toBe(keys[1])
  })

  it('expected_total se captura al hacer clic y se conserva en retry()', async () => {
    const sent: string[] = []
    let n = 0
    const transport: PaymentTransport = {
      submit: async (r) => {
        sent.push(r.expected_total!.amount)
        if (n++ === 0) throw Object.assign(new Error('net'), { status: 0, code: 'network' })
        return paid
      },
    }
    const mp = fakeMP({ collectMs: 40 })
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => mp.ctor })
    const h = { current: null as EmbeddedPaymentState | null }
    function C({ amt }: { amt: Money }) {
      const s = useEmbeddedPayment({ client, amount: amt, transport, adapter, storage: null, autoRetries: 0, verifyIntervalMs: 10 })
      h.current = s
      return <div ref={s.containerRef} />
    }
    const view = render(<C amt={money(100)} />)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    let done!: Promise<void>
    act(() => {
      done = h.current!.submit()
    })
    await sleep(10)
    view.rerender(<C amt={money(180)} />)
    await act(async () => void (await done))
    expect(sent).toEqual(['100.00'])
    await act(async () => void (await h.current!.retry()))
    expect(sent).toEqual(['100.00', '100.00'])
  })

  it('un cambio de total durante la verificación no remonta ni la apaga; se aplica al resolverse', async () => {
    sessionStorage.clear()
    let n = 0
    const refresh = vi.fn(async () => ({ payment: { provider: '', status: 'none' as const } }))
    const transport: PaymentTransport = {
      submit: async () => {
        if (n++ === 0) throw Object.assign(new Error('net'), { status: 0, code: 'network' })
        return paid
      },
      refresh,
    }
    const mp = fakeMP({ failUpdate: true })
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => mp.ctor })
    const h = { current: null as EmbeddedPaymentState | null }
    function C({ amt }: { amt: Money }) {
      const s = useEmbeddedPayment({ client, amount: amt, transport, adapter, storage: sessionStorage, autoRetries: 0, verifyIntervalMs: 10 })
      h.current = s
      return <div ref={s.containerRef} />
    }
    const view = render(<C amt={money(100)} />)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => void (await h.current!.submit()))
    expect(h.current?.status).toBe('network_error')
    view.rerender(<C amt={money(120)} />)
    await sleep(80)
    expect(mp.log.creates).toBe(1)
    expect(h.current?.status).toBe('network_error')
    expect(h.current?.verifying).toBe(true)
  })
})

describe('usePaymentRecovery: indeterminado por eventos', () => {
  it('error/network sin onIssue bloquea retry() y conserva la clave; un resultado lo libera', () => {
    sessionStorage.setItem('sf:pay:attempt:cart1', 'att-OLD')
    const { result } = renderHook(() => usePaymentRecovery({ scope: 'cart1' }))
    act(() => result.current.onEvent({ type: 'error', kind: 'network' }))
    let ok = true
    act(() => {
      ok = result.current.retry()
    })
    expect(ok).toBe(false)
    expect(sessionStorage.getItem('sf:pay:attempt:cart1')).toBe('att-OLD')
    act(() => result.current.onEvent({ type: 'result', status: 'rejected', decline_code: null }))
    act(() => {
      ok = result.current.retry()
    })
    expect(ok).toBe(true)
    expect(sessionStorage.getItem('sf:pay:attempt:cart1')).toBeNull()
  })
  it('error/payment_in_progress también bloquea', () => {
    const { result } = renderHook(() => usePaymentRecovery({ scope: 'cart3' }))
    act(() => result.current.onEvent({ type: 'error', kind: 'payment_in_progress' }))
    let ok = true
    act(() => {
      ok = result.current.retry()
    })
    expect(ok).toBe(false)
  })
  it('transitorio + verificación que termina en rechazo: retry() funciona', () => {
    const { result } = renderHook(() => usePaymentRecovery({ scope: 'cart2' }))
    act(() => result.current.onIssue({ kind: 'transient', message: 'x', retryable: true, status: 503, code: 'network' }))
    act(() => result.current.onEvent({ type: 'result', status: 'rejected', decline_code: null }))
    let ok = false
    act(() => {
      ok = result.current.retry()
    })
    expect(ok).toBe(true)
  })
})

describe('payErrorResponse: mensajes propios de la tienda', () => {
  it('ownMessage conserva el texto (tooManyRequests personalizado)', () => {
    const r = payErrorResponse({ status: 429, code: 'too_many_attempts', message: 'Calma, intenta en un rato' }, { ownMessage: true })
    expect(r.body.error.message).toBe('Calma, intenta en un rato')
    const o = payErrorResponse({ status: 429, code: 'too_many_attempts', message: 'rate limited by OPS' })
    expect(o.body.error.message).not.toBe('rate limited by OPS')
  })
})
