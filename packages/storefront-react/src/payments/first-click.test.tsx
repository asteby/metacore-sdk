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
const money: Money = { amount: '101.16', currency_code: 'MXN' }
const paid: PaymentAttemptResult = { payment: { provider: 'mp', status: 'paid', outcome: 'approved' } }

/**
 * Brick falso con la secuencia real de produccion: `getFormData` crea el token (card_tokens 201, token nuevo cada vez) y
 * la PRIMERA lectura falla igualmente (`secure_fields_card_token_creation_failed`); la segunda funciona.
 */
function flakyBrick(failures: number, kind: 'reject' | 'empty' = 'reject') {
  const log = { reads: 0, tokensCreated: 0 }
  class MP {
    bricks() {
      return {
        create: async (_b: string, _id: string, settings: { callbacks?: { onReady?: () => void } }) => {
          queueMicrotask(() => settings.callbacks?.onReady?.())
          return {
            getFormData: async () => {
              log.reads++
              log.tokensCreated++ // 201 de card_tokens
              if (log.reads <= failures) {
                if (kind === 'empty') return undefined
                throw { cause: 'secure_fields_card_token_creation_failed' }
              }
              return { token: `tok_${log.tokensCreated}`, payment_method_id: 'master', installments: 1 }
            },
            unmount: async () => {},
          }
        },
      }
    }
  }
  return { log, ctor: MP as unknown as MercadoPagoCtor }
}

function setup(failures: number, kind: 'reject' | 'empty' = 'reject') {
  const brick = flakyBrick(failures, kind)
  const calls: Array<{ key: string; token: unknown }> = []
  const transport: PaymentTransport = {
    submit: async (req) => {
      calls.push({ key: req.idempotencyKey, token: req.provider_data.token })
      return paid
    },
  }
  const adapter = mercadoPagoBricksAdapter({ getSdk: () => brick.ctor, collectRetryDelayMs: 1 })
  const h = { current: null as EmbeddedPaymentState | null }
  function C() {
    const s = useEmbeddedPayment({ client, amount: money, transport, adapter, sdkTimeoutMs: 2000, storage: null })
    h.current = s
    return <div ref={s.containerRef} />
  }
  render(<C />)
  return { h, brick, calls }
}

describe('primer clic con la tarjeta recien llena', () => {
  it('la primera lectura del Brick falla tras el 201 del token: se relee UNA vez y el pago sale en el primer clic', async () => {
    const { h, brick, calls } = setup(1)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => void (await h.current!.submit()))
    expect(h.current?.status).toBe('approved')
    expect(h.current?.error).toBeNull()
    expect(brick.log.reads).toBe(2)
    // Al servidor solo llega UN cobro, con el token de la segunda lectura y una sola llave.
    expect(calls).toEqual([{ key: calls[0]!.key, token: 'tok_2' }])
  })

  it('una lectura sin token tambien se relee una vez', async () => {
    const { h, calls } = setup(1, 'empty')
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => void (await h.current!.submit()))
    expect(h.current?.status).toBe('approved')
    expect(calls).toHaveLength(1)
  })

  it('si la segunda lectura tambien falla: error de tarjeta, NINGUNA llamada al servidor, y no mas de dos lecturas', async () => {
    const { h, brick, calls } = setup(2)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => void (await h.current!.submit()))
    expect(h.current?.status).toBe('ready')
    expect(h.current?.error?.kind).toBe('generic')
    expect(brick.log.reads).toBe(2)
    expect(calls).toHaveLength(0)
  })

  it('sin fallo no hay relectura (un solo token)', async () => {
    const { h, brick, calls } = setup(0)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => void (await h.current!.submit()))
    expect(brick.log.reads).toBe(1)
    expect(calls).toHaveLength(1)
  })

  it('un resultado indeterminado del servidor NO relee ni cambia de llave (regla #1252)', async () => {
    const brick = flakyBrick(0)
    const keys: string[] = []
    const transport: PaymentTransport = {
      submit: async (req) => {
        keys.push(req.idempotencyKey)
        throw new TypeError('Failed to fetch')
      },
    }
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => brick.ctor, collectRetryDelayMs: 1 })
    const h = { current: null as EmbeddedPaymentState | null }
    function C() {
      const s = useEmbeddedPayment({ client, amount: money, transport, adapter, sdkTimeoutMs: 2000, autoRetries: 0, storage: null })
      h.current = s
      return <div ref={s.containerRef} />
    }
    render(<C />)
    await waitFor(() => expect(h.current?.status).toBe('ready'))
    await act(async () => void (await h.current!.submit()))
    expect(h.current?.status).toBe('network_error')
    await act(async () => void (await h.current!.submit()))
    expect(brick.log.reads).toBe(1)
    expect(new Set(keys).size).toBe(1)
  })
})
