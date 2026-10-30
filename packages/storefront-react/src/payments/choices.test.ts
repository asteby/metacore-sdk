import { describe, expect, it } from 'vitest'
import type { CheckoutResult, PaymentClient, PaymentMethod } from '@asteby/storefront'
import { buildPayChoices, cashProviderData, checkoutToAttempt, parseChoice, payErrorResponse, voucherRows } from './choices.js'
import { isResolvedAttempt } from './resilient-transport.js'

const client: PaymentClient = { kind: 'fake', sdk_url: 'https://sdk.example.com/js', public_key: 'pk' }
const points = [
  { id: 'a', payment_method_id: 'store', payment_point: 'shop-1', label: 'Tienda 1', group: 'main' as const },
  { id: 'b', payment_method_id: 'bank', label: 'Banco', group: 'more' as const },
]
const mp: PaymentMethod = {
  key: 'prov',
  kind: 'provider',
  default: true,
  client,
  options: [
    { key: 'card', redirect: false, max_installments: 6, label: ' Tarjeta ' },
    { key: 'cash', redirect: false, points },
    { key: 'wallet', redirect: true },
    { key: 'credits', redirect: true },
  ],
}

describe('buildPayChoices', () => {
  it('unfolds options in server order and picks the first row of the default method', () => {
    const r = buildPayChoices([mp])
    expect(r.choices.map((c) => [c.value, c.mode])).toEqual([
      ['prov|card', 'card'],
      ['prov|cash', 'cash'],
      ['prov|wallet', 'redirect'],
      ['prov|credits', 'redirect'],
    ])
    expect(r.choices[0]).toMatchObject({ label: 'Tarjeta', maxInstallments: 6 })
    expect(r.choices[1]!.points).toHaveLength(2)
    expect(r.cardClient).toBe(client)
    expect(r.defaultValue).toBe('prov|card')
  })
  it('a card without client or flagged redirect is paid by redirect', () => {
    const noClient = buildPayChoices([{ ...mp, client: undefined }])
    expect(noClient.cardClient).toBeNull()
    expect(noClient.choices[0]!.mode).toBe('redirect')
    const flagged = buildPayChoices([{ ...mp, options: [{ key: 'card', redirect: true }] }])
    expect(flagged.choices[0]!.mode).toBe('redirect')
  })
  it('a method without options is a plain row and hidden methods never show', () => {
    const manual: PaymentMethod = { key: 'manual', kind: 'builtin', default: false }
    const r = buildPayChoices([manual, mp], { hide: ['manual'] })
    expect(r.choices.some((c) => c.methodKey === 'manual')).toBe(false)
    const plain = buildPayChoices([manual])
    expect(plain.choices).toEqual([expect.objectContaining({ value: 'manual', mode: 'plain', option: null })])
    expect(plain.defaultValue).toBe('manual')
    expect(buildPayChoices([]).defaultValue).toBeNull()
  })
  it('keeps the payment points only for cash', () => {
    expect(buildPayChoices([mp]).choices.filter((c) => c.points.length).map((c) => c.option)).toEqual(['cash'])
  })
})

describe('parseChoice', () => {
  it('reads method and option, rejects unknown options', () => {
    expect(parseChoice('prov|card')).toEqual({ methodKey: 'prov', option: 'card' })
    expect(parseChoice('manual')).toEqual({ methodKey: 'manual', option: null })
    expect(parseChoice('prov|nope')).toBeNull()
    expect(parseChoice('  ')).toBeNull()
    expect(parseChoice(undefined)).toBeNull()
  })
})

describe('cashProviderData', () => {
  it('builds provider_data from the server list, never from the browser', () => {
    expect(cashProviderData(points, 'a')).toEqual({ payment_method_id: 'store', payment_point: 'shop-1' })
    expect(cashProviderData(points, 'b')).toEqual({ payment_method_id: 'bank' })
    expect(cashProviderData(points, undefined)).toEqual({ payment_method_id: 'store', payment_point: 'shop-1' })
    expect(cashProviderData(points, 'forged')).toBeNull()
    expect(cashProviderData([], undefined)).toBeNull()
  })
})

const total = { amount: '10.00', currency_code: 'MXN' }
const result = (status: string, payment: Record<string, unknown> = {}): CheckoutResult =>
  ({ order: { id: 'o', number: null }, checkout: { id: 'c', status, total }, payment: { provider: 'p', status: 'pending', ...payment } }) as unknown as CheckoutResult

describe('checkoutToAttempt', () => {
  it('translates server states and never invents an approval', () => {
    expect(checkoutToAttempt(result('paid')).payment).toMatchObject({ status: 'paid', outcome: 'approved' })
    expect(checkoutToAttempt(result('converted')).payment.status).toBe('paid')
    expect(checkoutToAttempt(result('canceled')).payment.status).toBe('cancelled')
    expect(checkoutToAttempt(result('expired')).payment.status).toBe('expired')
    expect(checkoutToAttempt(result('failed')).payment).toMatchObject({ status: 'failed', outcome: 'rejected', decline_code: 'declined' })
    expect(checkoutToAttempt(result('pending')).payment).toMatchObject({ status: 'pending', outcome: 'pending' })
    expect(checkoutToAttempt(result('weird')).payment.outcome).toBe('pending')
  })
  it('a pending checkout whose latest attempt was rejected is a rejection, not a review', () => {
    const p = checkoutToAttempt(
      result('pending', { outcome: 'rejected', decline_code: 'authentication_failed', next_step: 'retry', retryable: true, message: 'm', message_en: 'e', attempts_left: 3 }),
    )
    expect(p.payment).toMatchObject({ status: 'failed', outcome: 'rejected', decline_code: 'authentication_failed', next_step: 'retry', retryable: true, message: 'm', message_en: 'e' })
    expect(p.attempts_left).toBe(3)
    expect(checkoutToAttempt(result('pending', { outcome: 'rejected' })).payment).toMatchObject({ status: 'failed', decline_code: 'declined', retryable: true })
    expect(checkoutToAttempt(result('paid', { outcome: 'rejected' })).payment.status).toBe('paid')
  })
  it('keeps a pending challenge as a challenge', () => {
    const action = { type: 'challenge', url: 'https://bank.example.com/3ds' }
    expect(checkoutToAttempt(result('pending', { action })).payment).toMatchObject({ status: 'requires_action', outcome: 'challenge' })
  })
})

describe('payErrorResponse', () => {
  it('keeps the codes the SDK reads', () => {
    expect(payErrorResponse({ status: 422, field: 'expected_total', message: 'm' })).toMatchObject({ status: 422, body: { error: { code: 'price_mismatch' } } })
    expect(payErrorResponse({ status: 409, field: 'payment_in_progress' }).body.error.code).toBe('payment_in_progress')
    expect(payErrorResponse({ status: 429, code: 'x' }).body.error.code).toBe('too_many_attempts')
    expect(payErrorResponse({ status: 500, code: 'boom', details: { a: 1 } }).body.error).toMatchObject({ code: 'boom', retryable: true, kind: 'transient', details: { a: 1 } })
  })
  it('never answers 502-504 (the proxy swaps them for an HTML page) and always says retryable and kind', () => {
    for (const status of [502, 503, 504]) expect(payErrorResponse({ status, code: 'unavailable', retryable: true }).status).toBe(500)
    expect(payErrorResponse({}).status).toBe(500)
    expect(payErrorResponse({ status: 502, code: 'payment_provider_rejected', retryable: false })).toMatchObject({
      status: 500,
      body: { error: { code: 'payment_provider_rejected', retryable: false, kind: 'provider_declined' } },
    })
    expect(payErrorResponse({ status: 502, code: 'payment_provider_misconfigured', retryable: false }).body.error.kind).toBe('merchant_config')
    expect(payErrorResponse({ status: 422, code: 'invalid_state', checkoutId: 'chk_1' }).body.error).toMatchObject({ kind: 'stale_checkout', retryable: false })
  })
  it('uses the shop catalog (overridable) instead of the technical OPS message, but keeps the shop own texts', () => {
    expect(payErrorResponse({ status: 502, code: 'unavailable', message: 'upstream connect error' }).body.error.message).toMatch(/verificando/)
    expect(payErrorResponse({ status: 502, code: 'unavailable' }, { messages: { 'error.transient': 'Verificando…' } }).body.error.message).toBe('Verificando…')
    expect(payErrorResponse({ status: 400, code: 'validation', message: 'Falta el correo' }).body.error.message).toBe('Falta el correo')
    expect(payErrorResponse({ status: 502, code: 'unavailable' }, { locale: 'en-US' }).body.error.message).toMatch(/verifying/i)
  })
})

describe('voucherRows', () => {
  const labels = { point: 'Punto', reference: 'Ref', clabe: 'CLABE', barcode: 'Barras', expires: 'Vence' }
  it('bounds values and prints the deadline in UTC', () => {
    const rows = voucherRows({ payment_point: 'Tienda', reference: 'R'.repeat(200), expires_at: '2026-10-30T18:00:00Z' } as never, labels, 'es-MX')
    expect(rows[0]).toEqual(['Punto', 'Tienda'])
    expect(rows[1]![1]).toHaveLength(80)
    expect(rows[2]![0]).toBe('Vence')
    expect(rows[2]![1]).toContain('UTC')
    expect(voucherRows(null, labels, 'es-MX')).toEqual([])
  })
  it('prints the deadline in the shop time zone when given, UTC when invalid', () => {
    const v = { reference: 'R', expires_at: '2026-10-31T18:24:00Z' } as never
    const mx = voucherRows(v, labels, 'es-MX', 'America/Mexico_City')[1]![1]
    expect(mx).toContain('12:24')
    expect(mx).not.toContain('UTC')
    expect(voucherRows(v, labels, 'es-MX', 'Mars/Olympus')[1]![1]).toContain('UTC')
  })
})

describe('Stripe next_action (contract 1.25) on the read paths', () => {
  const nextAction = { type: 'challenge' as const, next_action: { kind: 'stripe_next_action', client_secret: 'pi_1_secret_2' } }
  it('checkoutToAttempt keeps a pending next_action as requires_action (never in review), with the action intact', () => {
    const r = checkoutToAttempt({
      checkout: { id: 'c', status: 'pending' },
      payment: { provider: 'stripe', status: 'pending', action: { ...nextAction, type: 'none' } },
    } as never)
    expect(r.payment.status).toBe('requires_action')
    expect(r.payment.action?.next_action?.kind).toBe('stripe_next_action')
  })
  it('isResolvedAttempt: a next_action is an answer (even with type none)', () => {
    expect(isResolvedAttempt({ payment: { provider: 'stripe', status: 'requires_action', action: { ...nextAction, type: 'none' } } })).toBe(true)
    expect(isResolvedAttempt({ payment: { provider: 'stripe', status: 'pending', action: { type: 'none' } } })).toBe(false)
  })
})
