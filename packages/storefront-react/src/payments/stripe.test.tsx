// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Money, PaymentAction, PaymentAttemptResult, PaymentClient } from '@asteby/storefront'
import { createRef } from 'react'
import {
  PaymentBrick,
  moneyToMinorUnits,
  type PaymentBrickHandle,
  resetPaymentSdkCache,
  stripeAppearance,
  stripeElementsAdapter,
  type MountedPaymentForm,
  type PaymentFormAdapter,
  type PaymentFormMountOptions,
  type PaymentSubmitRequest,
  type PaymentTransport,
  type StripeFactory,
} from './index.js'

// Fake test key only: never a real secret.
const client: PaymentClient = {
  kind: 'stripe_elements',
  sdk_url: 'https://js.stripe.com/v3',
  public_key: 'pk_test_x',
  test_mode: true,
  options: [{ key: 'card', redirect: false }],
}
const total = { amount: '2185.00', currency_code: 'USD' }
const SECRET = 'pi_3Abc_secret_Xyz'
// The addon's canonical contract (kernel schema: url / creq / x_ extras): x_kind + x_client_secret, no url.
const stripeAction: PaymentAction = {
  type: 'challenge',
  challenge: { x_kind: 'stripe_next_action', x_client_secret: SECRET, x_next_action: 'use_stripe_sdk', x_payment_intent: 'pi_3Abc' },
}

type FakeOpts = {
  submitError?: boolean
  tokenError?: boolean
  tokenId?: unknown
  nextActionError?: boolean
  /** handleNextAction waits for `resolveNextAction()`. */
  nextActionDeferred?: boolean
  noReady?: boolean
  mountThrows?: boolean
}

/** Simulated Stripe.js: records every call; the fields never exist here (they live in Stripe's iframes). */
function fakeStripe(o: FakeOpts = {}) {
  const handlers: Record<string, ((e?: { error?: Record<string, string> }) => void)[]> = {}
  let resolveNextAction: () => void = () => {}
  const element = {
    mount: vi.fn((_target: HTMLElement) => {
      if (o.mountThrows) throw new Error('IntegrationError: mount')
      if (!o.noReady) queueMicrotask(() => handlers.ready?.forEach((h) => h()))
    }),
    on: vi.fn((ev: string, h: (e?: { error?: Record<string, string> }) => void) => void (handlers[ev] ??= []).push(h)),
    destroy: vi.fn(),
  }
  const elements = {
    create: vi.fn((_type: string, _opts?: Record<string, unknown>) => element),
    update: vi.fn((_opts: Record<string, unknown>) => undefined),
    submit: vi.fn(async () => (o.submitError ? { error: { type: 'validation_error', code: 'incomplete_number', message: '4242 is incomplete' } } : {})),
  }
  const stripe = {
    elements: vi.fn((_opts: Record<string, unknown>) => elements),
    createConfirmationToken: vi.fn(async (_a: { elements: unknown }) =>
      o.tokenError ? { error: { type: 'card_error', code: 'card_declined' } } : { confirmationToken: { id: o.tokenId ?? 'ctoken_1AbC', payment_method_preview: { card: { last4: '4242' } } } },
    ),
    handleNextAction: vi.fn(async (_a: { clientSecret: string }) => {
      if (o.nextActionDeferred) await new Promise<void>((r) => (resolveNextAction = r))
      return o.nextActionError ? { error: { type: 'card_error', code: 'payment_intent_authentication_failure' } } : { paymentIntent: { status: 'succeeded' } }
    }),
    // Must NEVER be called: the server confirms the PaymentIntent.
    confirmPayment: vi.fn(),
    confirmCardPayment: vi.fn(),
  }
  const factory = vi.fn((_pk: string, _opts?: { locale?: string }) => stripe) as unknown as StripeFactory & ReturnType<typeof vi.fn>
  const fire = (ev: string, e?: { error?: Record<string, string> }) => handlers[ev]?.forEach((h) => h(e))
  return { factory, stripe, elements, element, fire, resolveNextAction: () => resolveNextAction() }
}

function mountOpts(over: Partial<PaymentFormMountOptions> = {}): PaymentFormMountOptions {
  const el = document.createElement('div')
  el.id = 'pay1'
  document.body.appendChild(el)
  return { container: el, client, amount: total, onReady: vi.fn(), onError: vi.fn(), ...over }
}

beforeEach(() => resetPaymentSdkCache())
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('moneyToMinorUnits (exact, no floats)', () => {
  it.each([
    [{ amount: '2185.00', currency_code: 'USD' }, 218500],
    [{ amount: '2185', currency_code: 'MXN' }, 218500],
    [{ amount: '19.99', currency_code: 'usd' }, 1999], // 19.99 * 100 = 1998.9999999999998 in floats
    [{ amount: '0.10', currency_code: 'USD' }, 10],
    [{ amount: '1.1', currency_code: 'USD' }, 110],
    [{ amount: '10.500', currency_code: 'MXN' }, 1050],
    [{ amount: '1500', currency_code: 'JPY' }, 1500],
    [{ amount: '1500.00', currency_code: 'JPY' }, 1500],
    [{ amount: '1.234', currency_code: 'KWD' }, 1234],
    [{ amount: '007.05', currency_code: 'USD' }, 705],
    [{ amount: '15000', currency_code: 'KRW' }, 15000], // zero-decimal
    [{ amount: '15000.00', currency_code: 'krw' }, 15000],
    [{ amount: '1.234', currency_code: 'BHD' }, 1234], // three-decimal
    [{ amount: '1.230', currency_code: 'BHD' }, 1230],
    [{ amount: '100', currency_code: 'ISK' }, 10000], // Stripe: two-decimal representation
    [{ amount: '100', currency_code: 'UGX' }, 10000],
    [{ amount: '100.50', currency_code: 'HUF' }, 10050],
    [{ amount: '30.00', currency_code: 'TWD' }, 3000],
  ])('%j -> %i', (money, minor) => {
    expect(moneyToMinorUnits(money)).toBe(minor)
  })
  it.each([
    [{ amount: '10.505', currency_code: 'MXN' }], // would need rounding
    [{ amount: '1500.5', currency_code: 'JPY' }],
    [{ amount: '15000.5', currency_code: 'KRW' }],
    [{ amount: '1.2345', currency_code: 'BHD' }],
    [{ amount: '0.00', currency_code: 'USD' }],
    [{ amount: '-5.00', currency_code: 'USD' }],
    [{ amount: '1e3', currency_code: 'USD' }],
    [{ amount: '1,000.00', currency_code: 'USD' }],
    [{ amount: '', currency_code: 'USD' }],
    [{ amount: '10.00', currency_code: 'US' }],
    [{ amount: '99999999999999999.00', currency_code: 'USD' }],
    [{ amount: 10 as unknown as string, currency_code: 'USD' }],
  ])('%j throws', (money) => {
    expect(() => moneyToMinorUnits(money)).toThrow()
  })
})

describe('stripeElementsAdapter.load', () => {
  function stubDoc(onAppend?: (s: any) => void) {
    const scripts: any[] = []
    const doc = {
      createElement: () => ({ dataset: {} as Record<string, string>, setAttribute: vi.fn(), remove() { scripts.splice(scripts.indexOf(this), 1) } }) as any,
      head: { appendChild: (s: any) => (scripts.push(s), onAppend?.(s)) },
    } as unknown as Document
    return { doc, scripts }
  }

  it('loads js.stripe.com with the nonce and no SRI; resolves once the global exists', async () => {
    let global: StripeFactory | undefined
    const { doc, scripts } = stubDoc()
    const adapter = stripeElementsAdapter({ getSdk: () => global, document: doc })
    const p = adapter.load(client, { nonce: 'n0nce', timeoutMs: 500 })
    expect(scripts).toHaveLength(1)
    expect(scripts[0].src).toBe('https://js.stripe.com/v3')
    expect(scripts[0].nonce).toBe('n0nce')
    expect(scripts[0].integrity).toBeUndefined()
    global = fakeStripe().factory
    scripts[0].onload()
    await p
  })

  it('refuses other origins, http and invalid urls before touching the DOM', async () => {
    const { doc, scripts } = stubDoc()
    const adapter = stripeElementsAdapter({ getSdk: () => undefined, document: doc })
    await expect(adapter.load({ ...client, sdk_url: 'https://evil.example.com/v3' }, { timeoutMs: 50 })).rejects.toThrow(/origin not allowed/)
    await expect(adapter.load({ ...client, sdk_url: 'https://js.stripe.com.evil.com/v3' }, { timeoutMs: 50 })).rejects.toThrow(/origin not allowed/)
    await expect(adapter.load({ ...client, sdk_url: 'http://js.stripe.com/v3' }, { timeoutMs: 50 })).rejects.toThrow(/https required/)
    await expect(adapter.load({ ...client, sdk_url: 'not a url' }, { timeoutMs: 50 })).rejects.toThrow(/invalid url/)
    expect(scripts).toHaveLength(0)
  })

  it('rejects when the script is blocked, times out, or loads without the global', async () => {
    const blocked = stubDoc((s) => queueMicrotask(() => s.onerror()))
    await expect(stripeElementsAdapter({ getSdk: () => undefined, document: blocked.doc }).load(client, { timeoutMs: 500 })).rejects.toThrow(/failed to load/)
    const slow = stubDoc()
    await expect(stripeElementsAdapter({ getSdk: () => undefined, document: slow.doc }).load({ ...client, sdk_url: 'https://js.stripe.com/v3/?slow' }, { timeoutMs: 20 })).rejects.toThrow(/timeout/)
    const empty = stubDoc((s) => queueMicrotask(() => s.onload()))
    await expect(stripeElementsAdapter({ getSdk: () => undefined, document: empty.doc }).load({ ...client, sdk_url: 'https://js.stripe.com/v3/?e' }, { timeoutMs: 500 })).rejects.toThrow(/global missing/)
  })
})

describe('stripeElementsAdapter.mount / collect / update / handleAction / unmount', () => {
  it('creates a deferred-intent Payment Element with the server total in minor units, card only, themed', async () => {
    const f = fakeStripe()
    const opts = mountOpts({ theme: { baseColor: '#123456', inputBackgroundColor: '#000', borderRadiusMedium: '6px' }, colorScheme: 'dark', locale: 'es-MX', email: 'a@b.us' })
    await stripeElementsAdapter({ getSdk: () => f.factory }).mount(opts)
    expect(f.factory).toHaveBeenCalledWith('pk_test_x', { locale: 'es-419' })
    expect(f.stripe.elements).toHaveBeenCalledWith({
      mode: 'payment',
      amount: 218500,
      currency: 'usd',
      paymentMethodTypes: ['card'],
      appearance: { theme: 'night', variables: { colorPrimary: '#123456', colorBackground: '#000', borderRadius: '6px' } },
    })
    expect(f.elements.create.mock.calls[0]![0]).toBe('payment')
    expect(f.elements.create.mock.calls[0]![1]).toMatchObject({ defaultValues: { billingDetails: { email: 'a@b.us' } } })
    expect(f.element.mount).toHaveBeenCalledWith(opts.container)
    await waitFor(() => expect(opts.onReady).toHaveBeenCalledTimes(1))
  })

  it('light page -> stripe base theme without variables', () => {
    expect(stripeAppearance({}, 'light')).toEqual({ theme: 'stripe' })
    expect(stripeAppearance(undefined, undefined)).toEqual({ theme: 'stripe' })
  })

  it('a load error of the iframe is critical (the hook falls back to redirect)', async () => {
    const f = fakeStripe({ noReady: true })
    const opts = mountOpts()
    await stripeElementsAdapter({ getSdk: () => f.factory }).mount(opts)
    f.fire('loaderror', { error: { type: 'api_connection_error', message: 'blocked by CSP https://x' } })
    expect(opts.onError).toHaveBeenCalledWith({ critical: true, message: 'stripe loaderror: api_connection_error' })
  })

  it.each([
    ['sk_test_x', true],
    ['rk_test_x', true],
    ['whsec_x', true],
    ['pk_live_x', true], // live key in test mode
    ['pk_test_x', false], // test key in live mode
    ['pk_test_x', undefined], // mode not stated: refused even if the prefix looks fine
    ['pk_live_x', undefined],
    ['', true],
  ])('refuses public key %s (test_mode %s) before creating anything', async (key, testMode) => {
    const f = fakeStripe()
    const { test_mode: _drop, ...base } = client
    const c = { ...base, public_key: key, ...(testMode === undefined ? {} : { test_mode: testMode }) }
    await expect(stripeElementsAdapter({ getSdk: () => f.factory }).mount(mountOpts({ client: c }))).rejects.toThrow(/key/)
    expect(f.factory).not.toHaveBeenCalled()
  })

  it('refuses an amount it cannot express exactly', async () => {
    const f = fakeStripe()
    await expect(stripeElementsAdapter({ getSdk: () => f.factory }).mount(mountOpts({ amount: { amount: '10.005', currency_code: 'USD' } }))).rejects.toThrow(/decimals/)
    expect(f.stripe.elements).not.toHaveBeenCalled()
  })

  it('collect: submit() then createConfirmationToken({elements}); only the token leaves; never confirmPayment', async () => {
    const f = fakeStripe()
    const m = await stripeElementsAdapter({ getSdk: () => f.factory }).mount(mountOpts())
    const data = await m.collect()
    expect(data).toEqual({ provider_data: { confirmation_token: 'ctoken_1AbC' } })
    expect(f.elements.submit).toHaveBeenCalledTimes(1)
    expect(f.stripe.createConfirmationToken).toHaveBeenCalledWith({ elements: f.elements })
    expect(f.elements.submit.mock.invocationCallOrder[0]!).toBeLessThan(f.stripe.createConfirmationToken.mock.invocationCallOrder[0]!)
    const wire = JSON.stringify(data)
    expect(wire).not.toMatch(/4242|2185|218500|amount|card|pk_test/)
    expect(f.stripe.confirmPayment).not.toHaveBeenCalled()
    expect(f.stripe.confirmCardPayment).not.toHaveBeenCalled()
  })

  it('collect rejects an invalid form without tokenizing (Stripe shows the field errors)', async () => {
    const f = fakeStripe({ submitError: true })
    const m = await stripeElementsAdapter({ getSdk: () => f.factory }).mount(mountOpts())
    const err = await m.collect().catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe('payment form incomplete: validation_error/incomplete_number')
    expect((err as Error).message).not.toContain('4242') // never the provider message (may echo input)
    expect(f.stripe.createConfirmationToken).not.toHaveBeenCalled()
  })

  it.each([[{ tokenError: true }], [{ tokenId: 'pm_123' }], [{ tokenId: 'ctoken_<script>' }], [{ tokenId: 42 }]])('collect rejects a failed or malformed token %j', async (o) => {
    const f = fakeStripe(o)
    const m = await stripeElementsAdapter({ getSdk: () => f.factory }).mount(mountOpts())
    await expect(m.collect()).rejects.toThrow()
  })

  it('update: elements.update with the new minor amount; a currency change or a bad amount rejects (the hook remounts)', async () => {
    const f = fakeStripe()
    const m = await stripeElementsAdapter({ getSdk: () => f.factory }).mount(mountOpts())
    await m.update!({ amount: { amount: '2500.00', currency_code: 'USD' } })
    expect(f.elements.update).toHaveBeenCalledWith({ amount: 250000 })
    await expect(m.update!({ amount: { amount: '2500.00', currency_code: 'MXN' } })).rejects.toThrow(/currency/)
    await expect(m.update!({ amount: { amount: '0', currency_code: 'USD' } })).rejects.toThrow(/amount/)
    expect(f.elements.update).toHaveBeenCalledTimes(1)
  })

  it('handleAction: runs handleNextAction with the client secret; rejects on a Stripe error', async () => {
    const ok = fakeStripe()
    const m1 = await stripeElementsAdapter({ getSdk: () => ok.factory }).mount(mountOpts())
    await m1.handleAction!(stripeAction)
    expect(ok.stripe.handleNextAction).toHaveBeenCalledWith({ clientSecret: SECRET })
    expect(ok.stripe.confirmPayment).not.toHaveBeenCalled()

    const bad = fakeStripe({ nextActionError: true })
    const m2 = await stripeElementsAdapter({ getSdk: () => bad.factory }).mount(mountOpts())
    await expect(m2.handleAction!(stripeAction)).rejects.toThrow('payment action failed: card_error/payment_intent_authentication_failure')
  })

  it('handleAction tolerates the unprefixed kind / client_secret', async () => {
    const f = fakeStripe()
    const m = await stripeElementsAdapter({ getSdk: () => f.factory }).mount(mountOpts())
    await m.handleAction!({ type: 'challenge', challenge: { kind: 'stripe_next_action', client_secret: SECRET } })
    expect(f.stripe.handleNextAction).toHaveBeenCalledWith({ clientSecret: SECRET })
  })

  it.each([
    [{ type: 'challenge', challenge: { url: 'https://acs.test/c', creq: 'x' } }],
    [{ type: 'challenge', challenge: { x_kind: 'stripe_next_action', x_client_secret: 'sk_test_x' } }],
    [{ type: 'challenge', challenge: { x_kind: 'stripe_next_action' } }],
    [{ type: 'challenge', challenge: { x_kind: 'other_sdk', x_client_secret: SECRET } }],
    [{ type: 'redirect', redirect_url: 'https://x.test' }],
  ] as PaymentAction[][])('handleAction refuses %j without calling Stripe', async (action) => {
    const f = fakeStripe()
    const m = await stripeElementsAdapter({ getSdk: () => f.factory }).mount(mountOpts())
    await expect(m.handleAction!(action)).rejects.toThrow()
    expect(f.stripe.handleNextAction).not.toHaveBeenCalled()
  })

  it('destroys the element when mounting it throws after it was created', async () => {
    const f = fakeStripe({ mountThrows: true })
    await expect(stripeElementsAdapter({ getSdk: () => f.factory }).mount(mountOpts())).rejects.toThrow(/IntegrationError/)
    expect(f.elements.create).toHaveBeenCalledTimes(1)
    expect(f.element.destroy).toHaveBeenCalledTimes(1)
  })

  it('unmount destroys once, detaches from the signal, and the form refuses work afterwards', async () => {
    const f = fakeStripe()
    const abort = new AbortController()
    const remove = vi.spyOn(abort.signal, 'removeEventListener')
    const m = await stripeElementsAdapter({ getSdk: () => f.factory }).mount(mountOpts({ signal: abort.signal }))
    await m.unmount()
    await m.unmount()
    abort.abort()
    expect(f.element.destroy).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
    await expect(m.collect()).rejects.toThrow(/unmounted/)
    await expect(m.update!({ amount: total })).rejects.toThrow(/unmounted/)
    await expect(m.handleAction!(stripeAction)).rejects.toThrow(/unmounted/)
    expect(f.elements.submit).not.toHaveBeenCalled()
  })

  it('respects the signal: aborted before -> nothing created; aborted after -> destroyed; late events ignored', async () => {
    const f = fakeStripe({ noReady: true })
    const pre = new AbortController()
    pre.abort()
    await expect(stripeElementsAdapter({ getSdk: () => f.factory }).mount(mountOpts({ signal: pre.signal }))).rejects.toThrow(/cancelled/)
    expect(f.stripe.elements).not.toHaveBeenCalled()

    const later = new AbortController()
    const opts = mountOpts({ signal: later.signal })
    await stripeElementsAdapter({ getSdk: () => f.factory }).mount(opts)
    later.abort()
    expect(f.element.destroy).toHaveBeenCalledTimes(1)
    f.fire('ready')
    f.fire('loaderror', { error: { type: 'x' } })
    expect(opts.onReady).not.toHaveBeenCalled()
    expect(opts.onError).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// Hook integration (PaymentBrick -> useEmbeddedPayment) with the simulated Stripe.js.
// ---------------------------------------------------------------------------------------------------------------------

function memStorage() {
  const m = new Map<string, string>()
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

const paid: PaymentAttemptResult = { payment: { provider: 'stripe', status: 'paid' } }
const needs3ds: PaymentAttemptResult = { payment: { provider: 'stripe', status: 'requires_action', outcome: 'challenge', action: stripeAction } }
const failed3ds: PaymentAttemptResult = { payment: { provider: 'stripe', status: 'failed', decline_code: 'authentication_failed', retryable: true }, attempts_left: 4 }

function setupBrick(o: {
  fake?: ReturnType<typeof fakeStripe>
  adapter?: PaymentFormAdapter
  submit?: PaymentTransport['submit']
  refresh?: PaymentTransport['refresh']
  onFallback?: (r: string) => void
  onEvent?: (e: unknown) => void
  initialAction?: PaymentAction
  verifyTimeoutMs?: number
}) {
  const fake = o.fake ?? fakeStripe()
  const calls: PaymentSubmitRequest[] = []
  const transport: PaymentTransport = {
    submit: async (req, c) => (calls.push(req), (o.submit ?? (async () => paid))(req, c)),
    ...(o.refresh ? { refresh: o.refresh } : {}),
  }
  const storage = memStorage()
  const ref = createRef<PaymentBrickHandle>()
  const adapter = o.adapter ?? stripeElementsAdapter({ getSdk: () => fake.factory })
  const ui = (amount: Money) => (
    <PaymentBrick
      ref={ref}
      client={client}
      amount={amount}
      transport={transport}
      adapter={adapter}
      locale="es-MX"
      storage={storage}
      scope="chk1"
      retryDelayMs={0}
      verifyIntervalMs={5}
      pollIntervalMs={5}
      verifyTimeoutMs={o.verifyTimeoutMs ?? 200}
      pollTimeoutMs={o.verifyTimeoutMs ?? 200}
      submitLabel="Pagar"
      {...(o.onFallback ? { onFallback: o.onFallback } : {})}
      {...(o.onEvent ? { onEvent: o.onEvent } : {})}
      {...(o.initialAction ? { initialAction: o.initialAction } : {})}
    />
  )
  const utils = render(ui(total))
  const setAmount = (amount: Money) => act(() => void utils.rerender(ui(amount)))
  return { ...utils, fake, calls, storage, ref, setAmount }
}

const payButton = () => screen.getByRole('button', { name: /Pagar|Procesando/ })
const ready = () => waitFor(() => expect(screen.getByRole('button', { name: /Pagar/ }).getAttribute('aria-disabled')).toBe('false'))
const pay = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Pagar|Procesando/ }))
  })
}

describe('useEmbeddedPayment with Stripe', () => {
  it('pays: only {confirmation_token} and the server total travel; approved; confirmPayment never called', async () => {
    const { calls, fake } = setupBrick({})
    await ready()
    await pay()
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy())
    expect(calls).toHaveLength(1)
    expect(calls[0]!.provider_data).toEqual({ confirmation_token: 'ctoken_1AbC' })
    expect(calls[0]!.device_session_id).toBeUndefined()
    expect(calls[0]!.expected_total).toEqual(total)
    expect(Object.keys(calls[0]!).sort()).toEqual(['attempt', 'expected_total', 'idempotencyKey', 'option', 'provider_data'])
    expect(fake.stripe.confirmPayment).not.toHaveBeenCalled()
  })

  it('invalid card form: nothing is sent, the form stays usable', async () => {
    const { calls } = setupBrick({ fake: fakeStripe({ submitError: true }) })
    await ready()
    await pay()
    await screen.findByRole('alert')
    expect(calls).toHaveLength(0)
    await ready()
  })

  it('Stripe.js blocked (script error) -> fallback to redirect', async () => {
    const onFallback = vi.fn()
    const doc = {
      createElement: () => ({ dataset: {}, remove() {} }) as any,
      head: { appendChild: (s: any) => queueMicrotask(() => s.onerror()) },
    } as unknown as Document
    setupBrick({ adapter: stripeElementsAdapter({ getSdk: () => undefined, document: doc }), onFallback })
    await waitFor(() => expect(onFallback).toHaveBeenCalledWith('sdk_error'))
  })

  it('Payment Element iframe fails to load (loaderror) -> critical -> fallback to redirect', async () => {
    const onFallback = vi.fn()
    const fake = fakeStripe({ noReady: true })
    setupBrick({ fake, onFallback })
    await waitFor(() => expect(fake.element.mount).toHaveBeenCalled())
    act(() => fake.fire('loaderror', { error: { type: 'api_connection_error' } }))
    await waitFor(() => expect(onFallback).toHaveBeenCalledWith('form_error'))
    expect(fake.element.destroy).toHaveBeenCalled()
  })

  it('3DS (stripe_next_action): handleNextAction in Stripe modal, then the SERVER says paid; no iframe dialog', async () => {
    const refresh = vi.fn(async () => paid)
    const events: unknown[] = []
    const { fake, container, calls } = setupBrick({ submit: async () => needs3ds, refresh, onEvent: (e) => events.push(e) })
    await ready()
    await pay()
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy())
    expect(fake.stripe.handleNextAction).toHaveBeenCalledWith({ clientSecret: SECRET })
    expect(refresh).toHaveBeenCalled()
    expect(fake.element.mount.mock.invocationCallOrder[0]!).toBeLessThan(fake.stripe.handleNextAction.mock.invocationCallOrder[0]!)
    expect(container.querySelector('dialog[data-sf-challenge]')).toBeNull()
    expect(calls).toHaveLength(1)
    expect(events).toContainEqual({ type: 'provider_action', result: 'completed' })
    expect(JSON.stringify(events)).not.toContain(SECRET)
  })

  it('3DS completed in the browser but the server still pending -> verifying, no new payment, never "approved" on the SDK word', async () => {
    let n = 0
    const refresh = vi.fn(async () => (++n < 3 ? needs3ds : paid))
    const { fake, calls } = setupBrick({ submit: async () => needs3ds, refresh })
    await ready()
    await pay()
    expect(await screen.findByText(/Verificación terminada/)).toBeTruthy()
    expect(screen.queryByText('¡Pago aprobado!')).toBeNull()
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy())
    expect(fake.stripe.handleNextAction).toHaveBeenCalledTimes(1) // a still-pending challenge does not reopen the modal
    expect(calls).toHaveLength(1)
  })

  it('3DS rejected in Stripe modal -> server says failed -> rejection text, new attempt, fresh form', async () => {
    const refresh = vi.fn(async () => failed3ds)
    const events: unknown[] = []
    const fake = fakeStripe({ nextActionError: true })
    setupBrick({ fake, submit: async () => needs3ds, refresh, onEvent: (e) => events.push(e) })
    await ready()
    await pay()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('no pudo verificar')
    expect(events).toContainEqual({ type: 'provider_action', result: 'failed' })
    await waitFor(() => expect(fake.element.mount).toHaveBeenCalledTimes(2)) // single-use token: remounted
  })

  it('3DS rejected and the server cannot be read yet -> blocked "verifying" (no new charge), not rejected', async () => {
    const refresh = vi.fn(async () => {
      throw new TypeError('network')
    })
    setupBrick({ fake: fakeStripe({ nextActionError: true }), submit: async () => needs3ds, refresh })
    await ready()
    await pay()
    expect(await screen.findByText(/Cerraste la verificación/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Pagar/ })?.getAttribute('aria-disabled') ?? 'true').toBe('true')
  })

  it('Mercado Pago challenge {url, creq} is untouched: dialog shown, handleAction never called', async () => {
    const handleAction = vi.fn(async () => {})
    const adapter: PaymentFormAdapter = {
      kind: 'stripe_elements',
      async load() {},
      async mount(o) {
        queueMicrotask(() => o.onReady())
        const m: MountedPaymentForm = { collect: async () => ({ provider_data: { token: 't' } }), handleAction, unmount: () => {} }
        return m
      },
    }
    const { container } = setupBrick({
      adapter,
      submit: async () => ({ payment: { provider: 'mp', status: 'requires_action', action: { type: 'challenge', challenge: { url: 'https://acs.test/c', creq: 'abc' } } } }),
    })
    await ready()
    await pay()
    await waitFor(() => expect(container.querySelector('dialog[data-sf-challenge]')).not.toBeNull())
    expect(handleAction).not.toHaveBeenCalled()
  })
})

describe('useEmbeddedPayment with Stripe: contract, reload and unknown outcomes', () => {
  it('a challenge with no bank url and no known provider -> verifying, never the empty dialog; then the server decides', async () => {
    let n = 0
    const blind: PaymentAttemptResult = { payment: { provider: 'x', status: 'requires_action', action: { type: 'challenge', challenge: { creq: 'abc' } } } }
    const refresh = vi.fn(async () => (++n < 3 ? blind : paid))
    const { container, fake } = setupBrick({ submit: async () => blind, refresh })
    await ready()
    await pay()
    expect(await screen.findByText(/Verificación terminada/)).toBeTruthy()
    expect(container.querySelector('dialog[data-sf-challenge]')).toBeNull()
    expect(payButton().getAttribute('aria-disabled')).toBe('true')
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy())
    expect(container.querySelector('dialog[data-sf-challenge]')).toBeNull()
    expect(fake.stripe.handleNextAction).not.toHaveBeenCalled()
  })

  it('adapter without handleAction: event "unsupported", verifying with the SAME attempt (not rotated, no new charge)', async () => {
    const events: unknown[] = []
    const adapter: PaymentFormAdapter = {
      kind: 'stripe_elements',
      async load() {},
      async mount(o) {
        queueMicrotask(() => o.onReady())
        return { collect: async () => ({ provider_data: { confirmation_token: 'ctoken_x' } }), unmount: () => {} }
      },
    }
    const refresh = vi.fn(async () => needs3ds)
    const { storage, calls, ref } = setupBrick({ adapter, submit: async () => needs3ds, refresh, onEvent: (e) => events.push(e) })
    await ready()
    await pay()
    expect(await screen.findByText(/Cerraste la verificación/)).toBeTruthy()
    expect(events).toContainEqual({ type: 'provider_action', result: 'unsupported' })
    const key = calls[0]!.attempt
    expect(storage.m.get('sf:pay:attempt:chk1')).toBe(key)
    expect(ref.current!.attemptId).toBe(key)
    await act(async () => void (await ref.current!.submit()))
    expect(calls).toHaveLength(1)
  })

  it('Stripe.js 3DS fails and the server cannot answer: the attempt is NOT rotated; it rotates only on the server\'s answer', async () => {
    let answer: PaymentAttemptResult | null = null
    const refresh = vi.fn(async () => {
      if (!answer) throw new TypeError('network')
      return answer
    })
    const { storage, calls, ref } = setupBrick({ fake: fakeStripe({ nextActionError: true }), submit: async () => needs3ds, refresh, verifyTimeoutMs: 5000 })
    await ready()
    await pay()
    expect(await screen.findByText(/Cerraste la verificación/)).toBeTruthy()
    const key = calls[0]!.attempt
    expect(storage.m.get('sf:pay:attempt:chk1')).toBe(key)
    expect(ref.current!.attemptId).toBe(key)
    expect(ref.current!.status).toBe('blocked')
    answer = failed3ds
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('no pudo verificar'))
    expect(storage.m.has('sf:pay:attempt:chk1')).toBe(false)
  })

  it('send awaits the provider action: submit() stays pending (and single) while Stripe\'s 3DS modal is open', async () => {
    const fake = fakeStripe({ nextActionDeferred: true })
    const refresh = vi.fn(async () => paid)
    const { ref, calls } = setupBrick({ fake, submit: async () => needs3ds, refresh })
    await ready()
    let settled = false
    let p!: Promise<void>
    await act(async () => {
      p = ref.current!.submit().then(() => void (settled = true))
    })
    await waitFor(() => expect(fake.stripe.handleNextAction).toHaveBeenCalledTimes(1))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(settled).toBe(false)
    expect(ref.current!.status).toBe('processing')
    expect(ref.current!.busy).toBe(true)
    // A second press while the modal is open is the same in-flight promise: no second token, no second charge.
    await act(async () => void ref.current!.submit())
    expect(fake.stripe.createConfirmationToken).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    await act(async () => {
      fake.resolveNextAction()
      await p
    })
    expect(settled).toBe(true)
    expect(calls).toHaveLength(1)
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy())
    expect(fake.stripe.handleNextAction).toHaveBeenCalledTimes(1)
  })

  it('a total/currency change during the 3DS never remounts the form nor re-enables PAY while verifying; polling goes on', async () => {
    const fake = fakeStripe({ nextActionDeferred: true })
    let n = 0
    const refresh = vi.fn(async () => (++n < 6 ? needs3ds : paid))
    const { setAmount } = setupBrick({ fake, submit: async () => needs3ds, refresh, verifyTimeoutMs: 5000 })
    await ready()
    await pay()
    await waitFor(() => expect(fake.stripe.handleNextAction).toHaveBeenCalledTimes(1))
    setAmount({ amount: '2300.00', currency_code: 'MXN' }) // currency change: update would reject -> remount
    await act(async () => {
      fake.resolveNextAction()
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(await screen.findByText(/Verificación terminada/)).toBeTruthy()
    expect(payButton().getAttribute('aria-disabled')).toBe('true')
    expect(fake.element.mount).toHaveBeenCalledTimes(1)
    expect(fake.elements.update).not.toHaveBeenCalled()
    await waitFor(() => expect(refresh.mock.calls.length).toBeGreaterThanOrEqual(3))
    expect(fake.element.mount).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy())
  })

  it('a total change while a provider action runs outside a submit (reload) is not applied until it ends', async () => {
    const fake = fakeStripe({ nextActionDeferred: true })
    const refresh = vi.fn(async () => paid)
    const { setAmount } = setupBrick({ fake, refresh, initialAction: stripeAction })
    await waitFor(() => expect(fake.stripe.handleNextAction).toHaveBeenCalledTimes(1))
    setAmount({ amount: '2300.00', currency_code: 'USD' })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(fake.elements.update).not.toHaveBeenCalled()
    expect(fake.element.mount).toHaveBeenCalledTimes(1)
    await act(async () => fake.resolveNextAction())
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy())
  })

  it('reload with a pending stripe_next_action (initialAction): PAY never enabled, the 3DS is run once, the server decides', async () => {
    const refresh = vi.fn(async () => paid)
    const events: unknown[] = []
    let enabled = false
    const watch = new MutationObserver(() => {
      if (document.querySelector('[data-sf-pay-submit]')?.getAttribute('aria-disabled') === 'false') enabled = true
    })
    watch.observe(document.body, { subtree: true, attributes: true, childList: true })
    const { fake, calls, container } = setupBrick({ refresh, initialAction: stripeAction, onEvent: (e) => events.push(e) })
    await waitFor(() => expect(fake.stripe.handleNextAction).toHaveBeenCalledWith({ clientSecret: SECRET }))
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy())
    expect(fake.stripe.handleNextAction).toHaveBeenCalledTimes(1)
    expect(fake.stripe.createConfirmationToken).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
    watch.disconnect()
    expect(enabled).toBe(false)
    expect(events).toContainEqual({ type: 'provider_action', result: 'completed' })
    expect(container.querySelector('dialog[data-sf-challenge]')).toBeNull()
  })

  it('reload with a pending challenge while Stripe.js is blocked: verifying instead of the redirect fallback', async () => {
    const onFallback = vi.fn()
    let n = 0
    const refresh = vi.fn(async () => (++n < 2 ? needs3ds : paid))
    const doc = { createElement: () => ({ dataset: {}, remove() {} }) as any, head: { appendChild: (s: any) => queueMicrotask(() => s.onerror()) } } as unknown as Document
    setupBrick({ adapter: stripeElementsAdapter({ getSdk: () => undefined, document: doc }), refresh, initialAction: stripeAction, onFallback })
    expect(await screen.findByText(/Cerraste la verificación/)).toBeTruthy()
    expect(onFallback).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy())
  })

  it('reload with a pending Mercado Pago challenge (url) reopens the bank dialog', async () => {
    const mp: PaymentAction = { type: 'challenge', challenge: { url: 'https://acs.test/c', creq: 'abc' } }
    const { container, fake } = setupBrick({ initialAction: mp })
    await waitFor(() => expect(container.querySelector('dialog[data-sf-challenge]')).not.toBeNull())
    expect(fake.stripe.handleNextAction).not.toHaveBeenCalled()
  })

  it('in review (form hidden), then the server asks for the Stripe 3DS: verifying; the re-shown form never re-enables PAY', async () => {
    let settle = false
    const events: unknown[] = []
    const refresh = vi.fn(async () => (settle ? paid : needs3ds))
    const { fake, ref } = setupBrick({
      submit: async () => ({ payment: { provider: 'stripe', status: 'pending', action: { type: 'none' } } }),
      refresh,
      onEvent: (e) => events.push(e),
      verifyTimeoutMs: 5000,
    })
    await ready()
    await pay()
    expect(await screen.findByText(/está en revisión/)).toBeTruthy()
    // The form is not on screen in review: there is no Stripe instance to run it, so the hook verifies with the server.
    await waitFor(() => expect(events).toContainEqual({ type: 'provider_action', result: 'unsupported' }))
    expect(await screen.findByText(/Cerraste la verificación/)).toBeTruthy()
    // "verifying" shows the form container again: it remounts, and that must not turn the state into loading -> ready.
    await waitFor(() => expect(fake.element.mount).toHaveBeenCalledTimes(2))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(ref.current!.status).toBe('blocked')
    expect(ref.current!.error?.kind).toBe('payment_in_progress')
    expect(payButton().getAttribute('aria-disabled')).toBe('true')
    const before = refresh.mock.calls.length
    await waitFor(() => expect(refresh.mock.calls.length).toBeGreaterThan(before)) // still verifying
    settle = true
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy())
    expect(fake.stripe.handleNextAction).not.toHaveBeenCalled()
  })
})
