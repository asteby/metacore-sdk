import { describe, expect, it } from 'vitest'
import { classifyPaymentError } from './payment-errors.js'
import { createStorefrontClient } from './client.js'
import { StorefrontError } from './errors.js'
import { paymentErrorView } from './payments.js'

describe('classifyPaymentError with the answers OPS really sends', () => {
  it('502 payment_provider_rejected retryable:false is a definitive provider decline', () => {
    expect(classifyPaymentError({ status: 502, code: 'payment_provider_rejected', retryable: false })).toEqual({ kind: 'provider_declined', retryable: false })
  })
  it('502 payment_provider_misconfigured is merchant config', () => {
    expect(classifyPaymentError({ status: 502, code: 'payment_provider_misconfigured', retryable: false })).toEqual({ kind: 'merchant_config', retryable: false })
  })
  it('502 unavailable retryable:true is transient', () => {
    expect(classifyPaymentError({ status: 502, code: 'unavailable', retryable: true })).toEqual({ kind: 'transient', retryable: true })
  })
  it('422 invalid_state with checkout_id is a stale checkout', () => {
    expect(classifyPaymentError({ status: 422, code: 'invalid_state', checkoutId: 'chk_1' })).toEqual({ kind: 'stale_checkout', retryable: false })
  })
  it('a payment row refused by the shop is not a stale checkout', () => {
    expect(classifyPaymentError({ status: 422, code: 'invalid_state', field: 'payment_choice' })).toEqual({ kind: 'other', retryable: false })
  })
  it('a generic 5xx is transient only when OPS did not say retryable:false', () => {
    expect(classifyPaymentError({ status: 500, code: 'server_error' }).kind).toBe('transient')
    expect(classifyPaymentError({ status: 503 }).kind).toBe('transient')
    expect(classifyPaymentError({ status: 500, code: 'server_error', retryable: false })).toEqual({ kind: 'other', retryable: false })
    expect(classifyPaymentError({ status: 500, details: { retryable: false } })).toEqual({ kind: 'other', retryable: false })
  })
  it('network, timeout and status 0 are transient', () => {
    expect(classifyPaymentError({ status: 0, code: 'network' }).kind).toBe('transient')
    expect(classifyPaymentError({ status: 0, code: 'timeout' }).kind).toBe('transient')
  })
  it('maps the stable answers', () => {
    expect(classifyPaymentError({ status: 409, code: 'payment_in_progress' }).kind).toBe('in_progress')
    expect(classifyPaymentError({ status: 409, code: 'expired' }).kind).toBe('expired')
    expect(classifyPaymentError({ status: 429, code: 'too_many_attempts' }).kind).toBe('rate_limited')
    expect(classifyPaymentError({ status: 422, code: 'price_mismatch' }).kind).toBe('price_mismatch')
    expect(classifyPaymentError({ status: 400, code: 'validation' }).kind).toBe('validation')
    expect(classifyPaymentError({ status: 403, code: 'forbidden' }).kind).toBe('merchant_config')
  })
})

describe('StorefrontError keeps what OPS sends in error.*', () => {
  it('exposes retryable, retryAfter, checkoutId, cost and messageEn', async () => {
    const body = {
      error: { code: 'payment_in_progress', message: 'Hay un pago en curso', message_en: 'A payment is in progress', retryable: true, retry_after: 7, checkout_id: 'chk_9', cost: { total: { amount: '10.00', currency_code: 'MXN' } } },
    }
    const client = createStorefrontClient({
      baseUrl: 'https://ops.test/api/storefront',
      token: 'pk_test',
      fetch: async () => new Response(JSON.stringify(body), { status: 409, headers: { 'content-type': 'application/json' } }),
    })
    const err = (await client.carts.get('c1').catch((e: unknown) => e)) as StorefrontError
    expect(err).toBeInstanceOf(StorefrontError)
    expect(err.retryable).toBe(true)
    expect(err.retryAfter).toBe(7)
    expect(err.checkoutId).toBe('chk_9')
    expect(err.messageEn).toBe('A payment is in progress')
    expect(err.cost).toEqual(body.error.cost)
    expect(classifyPaymentError(err).kind).toBe('in_progress')
  })
  it('leaves them undefined when OPS did not send them', () => {
    const e = new StorefrontError({ status: 500, code: 'server_error', message: 'x' })
    expect(e.retryable).toBeUndefined()
    expect(e.checkoutId).toBeUndefined()
  })
  it('paymentErrorView honours retryable on a 5xx', () => {
    expect(paymentErrorView({ status: 500, code: 'server_error', retryable: true }).kind).toBe('network')
    expect(paymentErrorView({ status: 502, code: 'payment_provider_rejected', retryable: false }).kind).toBe('generic')
  })
})
