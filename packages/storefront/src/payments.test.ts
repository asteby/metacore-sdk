import { describe, expect, it } from 'vitest'
import { createStorefrontClient } from './client.js'
import { StorefrontError } from './errors.js'
import { createMockStorefront } from './mock/index.js'
import {
  declineMessage,
  declineMessageKey,
  formatVoucherExpiry,
  paymentErrorView,
  paymentIdempotencyKey,
  paymentMessages,
  paymentOutcome,
  safeHttpsUrl,
} from './payments.js'
import type { DeclineCode, PaymentAttemptResult } from './types.js'

const money = { amount: '1899.00', currency_code: 'MXN' }
const res = (payment: PaymentAttemptResult['payment'], extra: Partial<PaymentAttemptResult> = {}): PaymentAttemptResult => ({ payment, ...extra })

describe('declineMessage', () => {
  const codes: DeclineCode[] = [
    'insufficient_funds', 'invalid_cvc', 'invalid_expiry', 'invalid_card_data', 'call_issuer',
    'card_disabled', 'duplicate', 'max_attempts', 'authentication_failed', 'declined',
  ]
  it.each(codes)('%s has an actionable text in es and en and never leaks the code', (code) => {
    const es = declineMessage(code, 'es-MX')
    const en = declineMessage(code, 'en-US')
    expect(es.length).toBeGreaterThan(15)
    expect(en.length).toBeGreaterThan(15)
    expect(es).not.toContain(code)
    expect(es).not.toBe(en)
  })
  it.each([
    ['cc_rejected_other_reason', 'decline.declined'],
    [undefined, 'decline.declined'],
    [null, 'decline.declined'],
    ['invalid_cvc', 'decline.invalid_cvc'],
  ])('%s -> %s', (code, key) => expect(declineMessageKey(code)).toBe(key))
  it('shop overrides win by key', () => {
    expect(declineMessage('invalid_cvc', 'es', { 'decline.invalid_cvc': 'CVV mal' })).toBe('CVV mal')
  })
  it('es and en catalogs have the same keys', () => {
    expect(Object.keys(paymentMessages('es')).sort()).toEqual(Object.keys(paymentMessages('en')).sort())
  })
})

describe('safeHttpsUrl', () => {
  it.each([
    ['https://example.com/a?b=1', true],
    ['http://example.com', false],
    ['javascript:alert(1)', false],
    ['//example.com', false],
    ['https://user:pw@example.com', false],
    ['not a url', false],
    [undefined, false],
    [42, false],
  ])('%s -> %s', (v, ok) => expect(safeHttpsUrl(v) !== null).toBe(ok))
})

describe('paymentOutcome', () => {
  const voucher = { payment_point: 'oxxo', reference: 'REF123', voucher_url: 'https://mp.test/v', amount: '1899.90', currency: 'MXN', expires_at: '2026-11-05T18:00:00Z' }
  const cases: { name: string; result: PaymentAttemptResult; kind: string; check?: (o: ReturnType<typeof paymentOutcome>) => void }[] = [
    { name: 'paid', result: res({ provider: 'mp', status: 'paid' }), kind: 'approved' },
    {
      name: 'failed with reason',
      result: res({ provider: 'mp', status: 'failed', decline_code: 'insufficient_funds', retryable: true }, { attempts_left: 3 }),
      kind: 'rejected',
      check: (o) => {
        expect(o.decline_code).toBe('insufficient_funds')
        expect(o.retryable).toBe(true)
        expect(o.attempts_left).toBe(3)
        expect(o.message).toContain('saldo')
        expect(o.next_step).toBe('use_other_card')
      },
    },
    { name: 'failed unknown code -> declined', result: res({ provider: 'mp', status: 'failed', decline_code: 'weird' as DeclineCode }), kind: 'rejected', check: (o) => expect(o.decline_code).toBe('declined') },
    { name: 'failed without attempts left is not retryable', result: res({ provider: 'mp', status: 'failed' }, { attempts_left: 0 }), kind: 'rejected', check: (o) => expect(o.retryable).toBe(false) },
    { name: 'failed retryable=false', result: res({ provider: 'mp', status: 'failed', retryable: false }), kind: 'rejected', check: (o) => expect(o.retryable).toBe(false) },
    { name: 'pending without action', result: res({ provider: 'mp', status: 'pending', action: { type: 'none' } }), kind: 'in_review' },
    {
      name: 'voucher with reference and https url',
      result: res({ provider: 'mp', status: 'requires_action', action: { type: 'voucher', voucher } }),
      kind: 'voucher',
      check: (o) => {
        expect(o.voucher?.reference).toBe('REF123')
        expect(o.voucher?.voucher_url).toBe('https://mp.test/v')
        expect(o.voucher?.amount).toEqual({ amount: '1899.90', currency_code: 'MXN' })
        expect(o.next_step).toBe('pay_cash')
      },
    },
    {
      name: 'voucher with http url drops the url',
      result: res({ provider: 'mp', status: 'requires_action', action: { type: 'voucher', voucher: { ...voucher, voucher_url: 'http://evil.test' } } }),
      kind: 'voucher',
      check: (o) => expect(o.voucher?.voucher_url).toBeNull(),
    },
    {
      name: '3DS challenge',
      result: res({ provider: 'mp', status: 'requires_action', action: { type: 'challenge', challenge: { url: 'https://acs.test/c', creq: 'abc' } } }),
      kind: 'challenge',
      check: (o) => expect(o.challenge).toEqual({ url: 'https://acs.test/c', creq: 'abc' }),
    },
    {
      // NOT in_review: that closes the order in the shop's settle (cart and pay cookies cleared) before the 3DS runs.
      name: 'challenge without a bank url: still a challenge (order open), url null',
      result: res({ provider: 'x', status: 'requires_action', action: { type: 'challenge', challenge: { creq: 'abc' } } }),
      kind: 'challenge',
      check: (o) => expect(o.challenge).toEqual({ url: null, creq: 'abc' }),
    },
    {
      name: 'challenge with an http url: challenge with url null',
      result: res({ provider: 'x', status: 'requires_action', action: { type: 'challenge', challenge: { url: 'http://acs.test/c' } } }),
      kind: 'challenge',
      check: (o) => expect(o.challenge?.url).toBeNull(),
    },
    {
      name: 'stripe next_action: a challenge for the provider SDK (order open), no url, secret never in the outcome',
      result: res({ provider: 'stripe', status: 'requires_action', action: { type: 'challenge', next_action: { kind: 'stripe_next_action', client_secret: 'pi_1_secret_2' } } }),
      kind: 'challenge',
      check: (o) => {
        expect(o.challenge).toEqual({ url: null, creq: null })
        expect(JSON.stringify(o)).not.toContain('pi_1_secret_2')
      },
    },
    {
      name: 'next_action wins over a stray challenge url (never the iframe dialog for Stripe)',
      result: res({ provider: 'stripe', status: 'requires_action', action: { type: 'challenge', challenge: { url: 'https://hooks.stripe.com/x' }, next_action: { kind: 'stripe_next_action', client_secret: 'pi_1_secret_2' } } }),
      kind: 'challenge',
      check: (o) => expect(o.challenge?.url).toBeNull(),
    },
    { name: 'redirect https', result: res({ provider: 'mp', status: 'pending', action: { type: 'redirect', redirect_url: 'https://mp.test/pay' } }), kind: 'redirect', check: (o) => expect(o.redirect_url).toBe('https://mp.test/pay') },
    { name: 'redirect http is ignored', result: res({ provider: 'mp', status: 'pending', action: { type: 'redirect', redirect_url: 'http://mp.test/pay' } }), kind: 'in_review' },
    { name: 'expired', result: res({ provider: 'mp', status: 'expired' }), kind: 'expired' },
    { name: 'cancelled', result: res({ provider: 'mp', status: 'cancelled' }), kind: 'cancelled', check: (o) => expect(o.retryable).toBe(true) },
    { name: 'unknown status is never approved', result: res({ provider: 'mp', status: 'mystery' as never }), kind: 'in_review' },
  ]
  it.each(cases)('$name -> $kind', ({ result, kind, check }) => {
    const o = paymentOutcome(result, 'es-MX')
    expect(o.kind).toBe(kind)
    check?.(o)
  })
})

describe('voucher amount shapes and next step', () => {
  const v = (extra: object) => paymentOutcome(res({ provider: 'mp', status: 'requires_action', action: { type: 'voucher', voucher: { payment_point: 'oxxo', reference: 'R', ...extra } } })).voucher
  it.each([
    ['decimal string + currency (cart shape)', { amount: '1899.90', currency: 'MXN' }, { amount: '1899.90', currency_code: 'MXN' }],
    ['integer string gets cents', { amount: '500', currency: 'MXN' }, { amount: '500.00', currency_code: 'MXN' }],
    ['number', { amount: 120.5, currency: 'MXN' }, { amount: '120.5', currency_code: 'MXN' }],
    ['Money object', { amount: money }, money],
    ['no currency', { amount: '10.00' }, null],
    ['garbage', { amount: 'abc', currency: 'MXN' }, null],
    ['missing', {}, null],
  ])('%s', (_n, input, out) => expect(v(input)?.amount).toEqual(out))
  it('server next_step wins over the derived one; expired asks to rebuild the cart', () => {
    expect(paymentOutcome(res({ provider: 'mp', status: 'failed', decline_code: 'invalid_cvc', next_step: 'retry' })).next_step).toBe('retry')
    expect(paymentOutcome(res({ provider: 'mp', status: 'failed', decline_code: 'invalid_cvc' })).next_step).toBe('fix_card_data')
    expect(paymentOutcome(res({ provider: 'mp', status: 'expired' })).next_step).toBe('rebuild_cart')
  })
})

describe('paymentErrorView', () => {
  const err = (status: number, code: string) => new StorefrontError({ status, code, message: 'x' })
  it.each([
    [err(0, 'network'), 'network', true, true],
    [err(0, 'timeout'), 'network', true, true],
    [err(503, 'server_error'), 'network', true, true],
    [err(502, 'server_error'), 'network', true, true],
    [err(422, 'price_mismatch'), 'price_mismatch', false, true],
    [err(409, 'payment_in_progress'), 'payment_in_progress', false, false],
    [err(409, 'conflict'), 'generic', false, true],
    [err(409, 'expired'), 'expired', false, false],
    [err(429, 'rate_limited'), 'too_many_attempts', false, false],
    [err(500, 'server_error'), 'network', true, true], // a 500 with no readable body: the charge may have happened
    [new StorefrontError({ status: 500, code: 'server_error', message: 'x', retryable: false }), 'generic', false, true],
    [err(400, 'validation'), 'generic', false, true],
    [new TypeError('Failed to fetch'), 'network', true, true],
    [undefined, 'network', true, true],
  ] as [unknown, string, boolean, boolean][])('%# -> %s (same attempt: %s)', (e, kind, same, canRetry) => {
    const v = paymentErrorView(e, 'es')
    expect(v.kind).toBe(kind)
    expect(v.retrySameAttempt).toBe(same)
    expect(v.canRetry).toBe(canRetry)
    expect(v.message.length).toBeGreaterThan(10)
  })
})

describe('formatVoucherExpiry / idempotency key', () => {
  it('formats the deadline in the locale and returns null for bad input', () => {
    expect(formatVoucherExpiry('2026-11-05T18:00:00Z', 'es-MX')).toMatch(/^Vence el .*2026/)
    expect(formatVoucherExpiry('2026-11-05T18:00:00Z', 'en-US')).toMatch(/^Expires on /)
    expect(formatVoucherExpiry('nope', 'es')).toBeNull()
    expect(formatVoucherExpiry(null, 'es')).toBeNull()
  })
  it('is stable per attempt', () => {
    expect(paymentIdempotencyKey('chk_1', 'a1')).toBe(paymentIdempotencyKey('chk_1', 'a1'))
    expect(paymentIdempotencyKey('chk_1', 'a1')).not.toBe(paymentIdempotencyKey('chk_1', 'a2'))
  })
})

describe('client.checkouts.pay against the mock', () => {
  async function setup() {
    const mock = createMockStorefront({ maxPaymentAttempts: 3 })
    const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })
    const variant = mock.state.products.flatMap((p) => p.variants).find((v) => v.available_for_sale)!
    const cart = await sf.carts.create({ lines: [{ variant_id: variant.id, quantity: 1 }] })
    await sf.carts.setBuyer(cart.id, { email: 'a@b.mx' })
    await sf.carts.setDelivery(cart.id, { method: 'pickup', branch_id: mock.state.shop.branches[0]!.id })
    const chk = await sf.carts.checkout(cart.id, { payment_method: 'mock', return_url: 'https://shop.test/ok', payment_flow: 'embedded', payment_option: 'card' })
    return { mock, sf, chk }
  }
  const card = (token: string) => ({ method: 'card' as const, provider_data: { token } })

  it('requires an idempotency key before calling', async () => {
    const { sf, chk } = await setup()
    expect(() => sf.checkouts.pay(chk.checkout.id, card('tok_APRO'), {} as never)).toThrow(/idempotencyKey is required/)
    expect(() => sf.checkouts.pay(chk.checkout.id, card('tok_APRO'), { idempotencyKey: ' ' })).toThrow(TypeError)
  })

  it.each([
    ['tok_FUND', 'failed', 'insufficient_funds'],
    ['tok_SECU', 'failed', 'invalid_cvc'],
    ['tok_EXPI', 'failed', 'invalid_expiry'],
    ['tok_FORM', 'failed', 'invalid_card_data'],
    ['tok_CALL', 'failed', 'call_issuer'],
    ['tok_OTHE', 'failed', 'declined'],
    ['tok_CONT', 'pending', undefined],
    ['tok_3DS', 'requires_action', undefined],
    ['tok_APRO', 'paid', undefined],
  ])('%s -> %s', async (token, status, decline) => {
    const { sf, chk } = await setup()
    const r = await sf.checkouts.pay(chk.checkout.id, card(token), { idempotencyKey: 'k1' })
    expect(r.payment.status).toBe(status)
    expect(r.payment.decline_code ?? undefined).toBe(decline)
  })

  it('Stripe confirmation_token ctoken_3DS -> requires_action with action.next_action (no challenge); the order stays open', async () => {
    const { sf, chk } = await setup()
    const r = await sf.checkouts.pay(chk.checkout.id, { method: 'card', provider_data: { confirmation_token: 'ctoken_3DS' } }, { idempotencyKey: 'k1' })
    expect(r.payment.status).toBe('requires_action')
    expect(r.payment.action?.challenge).toBeUndefined()
    expect(r.payment.action?.next_action?.kind).toBe('stripe_next_action')
    expect(r.payment.action?.next_action?.client_secret).toMatch(/^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/)
    expect(paymentOutcome(r).kind).toBe('challenge')
    const ok = await sf.checkouts.pay(chk.checkout.id, { method: 'card', provider_data: { confirmation_token: 'ctoken_ok' } }, { idempotencyKey: 'k2' }).catch((e) => e)
    expect(ok).toBeInstanceOf(StorefrontError)
    expect(ok.status).toBe(409) // one attempt in the bank's hands blocks another
  })

  it('same key replays the same answer; a failed attempt can be followed by a new key', async () => {
    const { sf, chk } = await setup()
    const a = await sf.checkouts.pay(chk.checkout.id, card('tok_FUND'), { idempotencyKey: paymentIdempotencyKey(chk.checkout.id, '1') })
    const again = await sf.checkouts.pay(chk.checkout.id, card('tok_APRO'), { idempotencyKey: paymentIdempotencyKey(chk.checkout.id, '1') })
    expect(a.payment.outcome).toBe('rejected')
    expect(again).toEqual(a)
    const b = await sf.checkouts.pay(chk.checkout.id, card('tok_APRO'), { idempotencyKey: paymentIdempotencyKey(chk.checkout.id, '2') })
    expect(b.payment.status).toBe('paid')
  })

  it('paymentConfig tells what to mount and whether it is still payable', async () => {
    const { sf, chk } = await setup()
    const cfg = await sf.checkouts.paymentConfig(chk.checkout.id)
    expect(cfg).toMatchObject({ flow: 'embedded', payable: true, attempts_left: 3, amount: chk.checkout.total })
    expect(cfg!.client?.public_key).toBeTruthy()
    await sf.checkouts.pay(chk.checkout.id, card('tok_APRO'), { idempotencyKey: 'x' })
    expect((await sf.checkouts.paymentConfig(chk.checkout.id))!.payable).toBe(false)
    expect(await sf.checkouts.paymentConfig('nope')).toBeNull()
  })

  it('cash returns a voucher; price mismatch is 422; attempts cap is 429; paid blocks with 409', async () => {
    const { sf, chk } = await setup()
    const id = chk.checkout.id
    const cash = await sf.checkouts.pay(id, { method: 'cash', provider_data: { payment_method_id: 'oxxo' } }, { idempotencyKey: 'c1' })
    expect(paymentOutcome(cash).kind).toBe('voucher')
    await expect(sf.checkouts.pay(id, card('tok_APRO'), { idempotencyKey: 'c2' })).rejects.toMatchObject({ status: 409 })

    const second = await setup()
    await expect(
      second.sf.checkouts.pay(second.chk.checkout.id, { ...card('tok_APRO'), expected_total: { amount: '1.00', currency_code: 'MXN' } }, { idempotencyKey: 'm1' }),
    ).rejects.toMatchObject({ status: 422, code: 'price_mismatch' })

    const third = await setup()
    for (const k of ['a', 'b', 'c']) await third.sf.checkouts.pay(third.chk.checkout.id, card('tok_FUND'), { idempotencyKey: k })
    const e = await third.sf.checkouts.pay(third.chk.checkout.id, card('tok_APRO'), { idempotencyKey: 'd' }).catch((x: unknown) => x)
    expect(paymentErrorView(e).kind).toBe('too_many_attempts')
  })
})

describe('paymentNextAction', () => {
  it('reads action.next_action (canonical), tolerates the legacy challenge.x_kind, ignores bank challenges', async () => {
    const { paymentNextAction } = await import('./payments.js')
    expect(paymentNextAction({ type: 'challenge', next_action: { kind: 'stripe_next_action', client_secret: 'pi_a_secret_b' } })).toEqual({ kind: 'stripe_next_action', client_secret: 'pi_a_secret_b' })
    expect(paymentNextAction({ type: 'none', next_action: { kind: 'stripe_next_action' } })).toEqual({ kind: 'stripe_next_action', client_secret: null })
    expect(paymentNextAction({ type: 'challenge', challenge: { x_kind: 'stripe_next_action', x_client_secret: 'pi_c_secret_d' } })).toEqual({ kind: 'stripe_next_action', client_secret: 'pi_c_secret_d' })
    expect(paymentNextAction({ type: 'challenge', challenge: { x_kind: 'iframe', url: 'https://a.test' } })).toBeNull()
    expect(paymentNextAction({ type: 'challenge', challenge: { url: 'https://a.test', creq: 'x' } })).toBeNull()
    expect(paymentNextAction({ type: 'challenge', next_action: { kind: '' } as never })).toBeNull()
    expect(paymentNextAction({ type: 'challenge', next_action: null })).toBeNull()
    expect(paymentNextAction(null)).toBeNull()
  })
})
