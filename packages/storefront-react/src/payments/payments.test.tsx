// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { createRef } from 'react'
import type { PaymentAttemptResult, PaymentClient } from '@asteby/storefront'
import {
  PaymentBrick,
  PaymentHttpError,
  createFetchTransport,
  loadPaymentSdk,
  mercadoPagoBricksAdapter,
  paymentCsp,
  paymentCspHeaderName,
  resetPaymentSdkCache,
  sanitizeMercadoPagoFormData,
  type MountedPaymentForm,
  type PaymentBrickHandle,
  type PaymentFormAdapter,
  type PaymentFormMountOptions,
  type PaymentSubmitRequest,
  type PaymentTransport,
} from './index.js'

const client: PaymentClient = {
  kind: 'fake',
  sdk_url: 'https://sdk.example.com/js',
  public_key: 'TEST-public',
  options: [{ key: 'card', redirect: false, max_installments: 12 }],
  csp: { script: ['https://sdk.example.com'], frame: ['https://*.example.com'], connect: ['https://api.example.com'] },
}
const total = { amount: '2185.00', currency_code: 'MXN' }

type FakeControl = {
  mounts: { amount: string; theme?: Record<string, string> }[]
  unmounts: number
  collect: ReturnType<typeof vi.fn>
  fire: PaymentFormMountOptions | null
}

function fakeAdapter(opts: { loadDelay?: number; loadError?: boolean; neverReady?: boolean } = {}): { adapter: PaymentFormAdapter; ctl: FakeControl } {
  const ctl: FakeControl = { mounts: [], unmounts: 0, collect: vi.fn(async () => ({ provider_data: { token: `tok_${ctl.mounts.length}` }, device_session_id: 'dev1' })), fire: null }
  const adapter: PaymentFormAdapter = {
    kind: 'fake',
    async load() {
      if (opts.loadDelay) await new Promise((r) => setTimeout(r, opts.loadDelay))
      if (opts.loadError) throw new Error('payment sdk: failed to load')
    },
    async mount(o) {
      ctl.mounts.push({ amount: o.amount.amount, ...(o.theme ? { theme: o.theme } : {}) })
      ctl.fire = o
      if (!opts.neverReady) queueMicrotask(() => o.onReady())
      const m: MountedPaymentForm = { collect: () => ctl.collect(), unmount: () => void (ctl.unmounts += 1) }
      return m
    },
  }
  return { adapter, ctl }
}

const paid: PaymentAttemptResult = { payment: { provider: 'mp', status: 'paid' } }
const rejected = (code: string, extra: Partial<PaymentAttemptResult> = {}): PaymentAttemptResult => ({
  payment: { provider: 'mp', status: 'failed', decline_code: code as never, retryable: true },
  attempts_left: 4,
  ...extra,
})

function memStorage() {
  const m = new Map<string, string>()
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

function setup(over: Partial<Parameters<typeof PaymentBrick>[0]> = {}, transportImpl?: PaymentTransport['submit']) {
  const { adapter, ctl } = fakeAdapter()
  const calls: PaymentSubmitRequest[] = []
  const transport: PaymentTransport = {
    submit: transportImpl ?? (async (req) => (calls.push(req), paid)),
  }
  if (transportImpl) {
    const inner = transportImpl
    transport.submit = async (req, c) => (calls.push(req), inner(req, c))
  }
  const ref = createRef<PaymentBrickHandle>()
  const storage = memStorage()
  const utils = render(
    <PaymentBrick
      ref={ref}
      client={client}
      amount={total}
      transport={transport}
      adapter={adapter}
      locale="es-MX"
      storage={storage}
      scope="chk1"
      retryDelayMs={0}
      submitLabel="Realizar el pedido"
      {...over}
    />,
  )
  return { ...utils, ctl, calls, ref, storage }
}

const ready = () => waitFor(() => expect(screen.getByRole('button', { name: /Realizar el pedido/ }).getAttribute('aria-disabled')).toBe('false'))
const pay = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Realizar el pedido|Procesando/ }))
  })
}

beforeEach(() => resetPaymentSdkCache())
afterEach(() => cleanup())

describe('PaymentBrick: happy path and states', () => {
  it('mounts with the server total, shows it on the button and approves', async () => {
    const onResult = vi.fn()
    const { ctl, calls } = setup({ onResult })
    await ready()
    expect(ctl.mounts).toHaveLength(1)
    expect(ctl.mounts[0]!.amount).toBe('2185.00')
    expect(screen.getByRole('button', { name: /Realizar el pedido/ }).textContent).toContain('$2,185.00')
    await pay()
    await waitFor(() => expect(onResult).toHaveBeenCalled())
    expect(calls).toHaveLength(1)
    const req = calls[0]!
    expect(req.provider_data).toEqual({ token: 'tok_1' })
    expect(req.device_session_id).toBe('dev1')
    expect(req.expected_total).toEqual(total)
    expect(req.idempotencyKey).toBe(req.attempt)
    expect(onResult.mock.calls[0]![0].kind).toBe('approved')
    expect(screen.getByText('¡Pago aprobado!')).toBeTruthy()
  })

  it('rejected: actionable reason, alert with focus, fresh attempt and remounted form', async () => {
    let n = 0
    const { ctl, calls, storage } = setup({}, async () => (++n === 1 ? rejected('insufficient_funds') : paid))
    await ready()
    await pay()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('no tiene saldo suficiente')
    await waitFor(() => expect(document.activeElement).toBe(alert))
    expect(ctl.mounts.length).toBe(2) // single-use token => form remounted
    expect(ctl.unmounts).toBeGreaterThanOrEqual(1)
    expect(storage.m.size).toBe(0) // the attempt was rotated
    await ready()
    await pay()
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy())
    expect(calls[0]!.attempt).not.toBe(calls[1]!.attempt)
  })

  it.each([
    ['invalid_cvc', 'código de seguridad'],
    ['call_issuer', 'Llama al número'],
    ['card_disabled', 'no está activa'],
    ['authentication_failed', 'no pudo verificar'],
    ['totally_unknown', 'rechazó el pago'],
  ])('decline %s -> text contains "%s" and never the raw code', async (code, text) => {
    setup({}, async () => rejected(code))
    await ready()
    await pay()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(text)
    expect(alert.textContent).not.toContain(code)
  })

  it('in review: no new charge invited, form hidden', async () => {
    setup({}, async () => ({ payment: { provider: 'mp', status: 'pending', action: { type: 'none' } } }))
    await ready()
    await pay()
    expect(await screen.findByText(/está en revisión/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Realizar el pedido/ })).toBeNull()
  })

  it('voucher: reference, exact amount and expiry from the server; https link only', async () => {
    setup({}, async () => ({
      payment: {
        provider: 'mp',
        status: 'requires_action',
        action: { type: 'voucher', voucher: { payment_point: 'oxxo', reference: 'REF-987', voucher_url: 'http://insecure.test/x', amount: '2185.00', currency: 'MXN', expires_at: '2026-11-05T18:00:00Z' } },
      },
    }))
    const { container } = setup({}, async () => ({
      payment: {
        provider: 'mp',
        status: 'requires_action',
        action: { type: 'voucher', voucher: { payment_point: 'oxxo', reference: 'REF-987', voucher_url: 'https://mp.test/v/1', amount: '2185.00', currency: 'MXN', expires_at: '2026-11-05T18:00:00Z' } },
      },
    }))
    const buttons = screen.getAllByRole('button', { name: /Realizar el pedido/ })
    await waitFor(() => expect(buttons[buttons.length - 1]!.getAttribute('aria-disabled')).toBe('false'))
    await act(async () => void fireEvent.click(buttons[buttons.length - 1]!))
    await waitFor(() => expect(container.querySelector('[data-sf-voucher-reference]')?.textContent).toBe('REF-987'))
    expect(container.textContent).toContain('$2,185.00')
    expect(container.querySelector('[data-sf-voucher-expiry]')?.textContent).toMatch(/Vence el .*2026/)
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://mp.test/v/1')
    expect(container.querySelector('a')?.getAttribute('rel')).toContain('noopener')
  })

  it('voucher with an http url shows no link', async () => {
    const { container } = setup({}, async () => ({
      payment: { provider: 'mp', status: 'requires_action', action: { type: 'voucher', voucher: { payment_point: 'oxxo', reference: 'R', voucher_url: 'http://insecure.test/x' } } },
    }))
    await ready()
    await pay()
    await waitFor(() => expect(container.querySelector('[data-sf-voucher]')).not.toBeNull())
    expect(container.querySelector('a')).toBeNull()
  })

  it('3DS challenge opens a labelled dialog inside the page', async () => {
    const { container } = setup({}, async () => ({
      payment: { provider: 'mp', status: 'requires_action', action: { type: 'challenge', challenge: { url: 'https://acs.test/c', creq: 'x' } } },
    }))
    await ready()
    await pay()
    await waitFor(() => expect(container.querySelector('dialog[data-sf-challenge]')).not.toBeNull())
    const dlg = container.querySelector('dialog')!
    expect(dlg.getAttribute('aria-labelledby')).toBe('sf-challenge-title')
    expect(container.querySelector('iframe')?.getAttribute('src')).toBe('https://acs.test/c')
    expect(container.querySelector('iframe')?.getAttribute('title')).toBe('Verificación de tu banco')
  })

  it('redirect outcome uses onRedirect and only for https', async () => {
    const onRedirect = vi.fn()
    setup({ onRedirect }, async () => ({ payment: { provider: 'mp', status: 'pending', action: { type: 'redirect', redirect_url: 'https://mp.test/pay' } } }))
    await ready()
    await pay()
    await waitFor(() => expect(onRedirect).toHaveBeenCalledWith('https://mp.test/pay'))
    cleanup()
    const onRedirect2 = vi.fn()
    setup({ onRedirect: onRedirect2 }, async () => ({ payment: { provider: 'mp', status: 'pending', action: { type: 'redirect', redirect_url: 'javascript:alert(1)' } } }))
    await ready()
    await pay()
    await screen.findByText(/está en revisión/)
    expect(onRedirect2).not.toHaveBeenCalled()
  })
})

describe('PaymentBrick: idempotency, retries and errors', () => {
  it('double click sends one request', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { calls } = setup({}, async () => (await gate, paid))
    await ready()
    const btn = screen.getByRole('button', { name: /Realizar el pedido/ })
    await act(async () => {
      fireEvent.click(btn)
      fireEvent.click(btn)
      fireEvent.click(btn)
    })
    expect(calls).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Procesando/ }).getAttribute('aria-busy')).toBe('true')
    await act(async () => release())
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy())
    expect(calls).toHaveLength(1)
  })

  it('network failure: auto-retries with the SAME attempt, then offers a manual retry that keeps it', async () => {
    let n = 0
    const { calls } = setup({ autoRetries: 1 }, async () => {
      n += 1
      if (n <= 3) throw new TypeError('Failed to fetch')
      return paid
    })
    await ready()
    await pay()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('No pudimos conectar')
    expect(calls).toHaveLength(2) // first + 1 auto retry
    const retry = screen.getByRole('button', { name: 'Reintentar' })
    await act(async () => void fireEvent.click(retry))
    await act(async () => void (await new Promise((r) => setTimeout(r, 10))))
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy())
    const attempts = new Set(calls.map((c) => c.attempt))
    expect(attempts.size).toBe(1)
    expect(new Set(calls.map((c) => c.idempotencyKey)).size).toBe(1)
    expect(new Set(calls.map((c) => JSON.stringify(c.provider_data))).size).toBe(1) // same token, held in memory only
  })

  it('503 is retryable; 409 blocks without retry; 429 blocks', async () => {
    const run = async (err: unknown) => {
      cleanup()
      const { calls } = setup({ autoRetries: 0 }, async () => {
        throw err
      })
      await ready()
      await pay()
      const alert = await screen.findByRole('alert')
      return { text: alert.textContent ?? '', retryBtn: screen.queryByRole('button', { name: 'Reintentar' }), calls }
    }
    const a = await run(new PaymentHttpError(503, 'server_error'))
    expect(a.retryBtn).not.toBeNull()
    const b = await run(new PaymentHttpError(409, 'payment_in_progress'))
    expect(b.text).toContain('Ya hay un pago en proceso')
    expect(b.retryBtn).toBeNull()
    const c = await run(new PaymentHttpError(429, 'rate_limited'))
    expect(c.text).toContain('no podemos intentar con más tarjetas')
    expect(c.retryBtn).toBeNull()
    const d = await run(new PaymentHttpError(409, 'expired'))
    expect(d.text).toContain('apartado venció')
  })

  it('price_mismatch: explains, rotates the attempt and remounts', async () => {
    const { ctl, storage } = setup({}, async () => {
      throw new PaymentHttpError(422, 'price_mismatch')
    })
    await ready()
    await pay()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('El total cambió')
    expect(storage.m.size).toBe(0)
    await waitFor(() => expect(ctl.mounts.length).toBe(2))
  })

  it('409 conflict (idempotency key already used with another card, e.g. after a reload): new attempt, form remounted', async () => {
    const { ctl, storage } = setup({}, async () => {
      throw new PaymentHttpError(409, 'conflict')
    })
    storage.setItem('sf:pay:attempt:chk1', 'old-attempt')
    await ready()
    await pay()
    await screen.findByRole('alert')
    expect(storage.m.has('sf:pay:attempt:chk1')).toBe(false)
    await waitFor(() => expect(ctl.mounts.length).toBe(2))
  })

  it('tokenize error (invalid card): nothing is sent, the buyer is pointed to the card data', async () => {
    const { ctl, calls } = setup()
    ctl.collect.mockRejectedValueOnce(new Error('invalid'))
    await ready()
    await pay()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Revisa los datos de tu tarjeta')
    expect(calls).toHaveLength(0)
  })

  it('re-renders with a new server total remount the form with that total', async () => {
    const { ctl, rerender, calls } = setup()
    await ready()
    rerender(
      <PaymentBrick client={client} amount={{ amount: '1999.00', currency_code: 'MXN' }} transport={{ submit: async (r) => (calls.push(r), paid) }} adapter={fakeAdapterReuse(ctl)} locale="es-MX" scope="chk1" submitLabel="Realizar el pedido" />,
    )
    await waitFor(() => expect(ctl.mounts.at(-1)!.amount).toBe('1999.00'))
  })

  it('attempt id is reused across a reload (storage) and never holds card data', async () => {
    const storage = memStorage()
    storage.setItem('sf:pay:attempt:chk1', 'attempt-from-before-reload')
    const { calls } = setup({ storage })
    await ready()
    await pay()
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]!.attempt).toBe('attempt-from-before-reload')
    for (const v of storage.m.values()) expect(v).not.toMatch(/tok_|\d{12,}/)
  })
})

function fakeAdapterReuse(ctl: FakeControl): PaymentFormAdapter {
  return {
    kind: 'fake',
    load: async () => undefined,
    async mount(o) {
      ctl.mounts.push({ amount: o.amount.amount })
      queueMicrotask(() => o.onReady())
      return { collect: () => ctl.collect(), unmount: () => void (ctl.unmounts += 1) }
    },
  }
}

describe('PaymentBrick: fallback', () => {
  it('SDK that never gets ready falls back after the timeout', async () => {
    const { adapter } = fakeAdapter({ neverReady: true })
    const onFallback = vi.fn()
    const onEvent = vi.fn()
    const { container } = setup({ adapter, sdkTimeoutMs: 40, onFallback, onEvent })
    await waitFor(() => expect(onFallback).toHaveBeenCalledWith('sdk_timeout'), { timeout: 2000 })
    expect(container.querySelector('[data-sf-pay-fallback]')?.textContent).toContain('No pudimos cargar el formulario seguro')
    expect(onFallback).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith({ type: 'form_failed', reason: 'sdk_timeout' })
  })
  it('SDK load error falls back once', async () => {
    const { adapter } = fakeAdapter({ loadError: true })
    const onFallback = vi.fn()
    setup({ adapter, onFallback, sdkTimeoutMs: 50 })
    await waitFor(() => expect(onFallback).toHaveBeenCalledWith('sdk_error'))
    await new Promise((r) => setTimeout(r, 80))
    expect(onFallback).toHaveBeenCalledTimes(1)
  })
  it('critical form error falls back; non critical does not', async () => {
    const { adapter, ctl } = fakeAdapter()
    const onFallback = vi.fn()
    setup({ adapter, onFallback })
    await ready()
    act(() => ctl.fire!.onError({ critical: false }))
    expect(onFallback).not.toHaveBeenCalled()
    act(() => ctl.fire!.onError({ critical: true }))
    await waitFor(() => expect(onFallback).toHaveBeenCalledWith('form_error'))
  })
  it('unknown provider kind falls back; missing client stays idle', async () => {
    const onFallback = vi.fn()
    const transport = { submit: async () => paid }
    // `stripe_elements` is built in since 0.47: an unknown kind must still fall back.
    render(<PaymentBrick client={{ ...client, kind: 'acme_pay' }} amount={total} transport={transport} onFallback={onFallback} />)
    await waitFor(() => expect(onFallback).toHaveBeenCalledWith('unsupported_provider'))
    cleanup()
    const { container } = render(<PaymentBrick client={null} amount={total} transport={transport} />)
    expect(container.querySelector('[data-sf-pay-status]')?.getAttribute('data-sf-pay-status')).toBe('idle')
  })
})

describe('PaymentBrick: accessibility and i18n', () => {
  it('has no axe violations while ready, in error and in voucher state', async () => {
    const { container } = setup({}, async () => rejected('invalid_cvc'))
    await ready()
    const results = async () => (await axe.run(container, { rules: { 'color-contrast': { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join('|')}`)
    expect(await results()).toEqual([])
    await pay()
    await screen.findByRole('alert')
    expect(await results()).toEqual([])
  })
  it('labels the container, marks it busy while loading and speaks English', async () => {
    const { adapter } = fakeAdapter({ loadDelay: 30 })
    const { container } = setup({ adapter, locale: 'en-US', submitLabel: 'Place order' })
    const group = container.querySelector('[data-sf-pay-container]')!
    expect(group.getAttribute('aria-label')).toBe('Your card details')
    expect(group.getAttribute('aria-busy')).toBe('true')
    expect(screen.getByText('Loading secure payment…')).toBeTruthy()
    await waitFor(() => expect(group.getAttribute('aria-busy')).toBe('false'))
    expect(screen.getByRole('button', { name: /Place order/ })).toBeTruthy()
  })
  it('the button is at least 44px tall and explains its busy state', async () => {
    setup()
    await ready()
    expect(screen.getByRole('button', { name: /Realizar el pedido/ }).style.minHeight).toBe('44px')
  })
  it('exposes the controller through the ref', async () => {
    const { ref } = setup({ submitLabel: undefined })
    await waitFor(() => expect(ref.current?.status).toBe('ready'))
    await act(async () => void (await ref.current!.submit()))
    await waitFor(() => expect(ref.current?.status).toBe('approved'))
  })
})

describe('polling a pending result', () => {
  it('in review resolves to approved through transport.refresh', async () => {
    let calls = 0
    const { adapter } = fakeAdapter()
    render(
      <PaymentBrick
        client={client}
        amount={total}
        adapter={adapter}
        storage={null}
        pollIntervalMs={10}
        pollTimeoutMs={500}
        submitLabel="Pagar"
        transport={{
          submit: async () => ({ payment: { provider: 'mp', status: 'pending', action: { type: 'none' } } }),
          refresh: async () => (++calls >= 2 ? paid : { payment: { provider: 'mp', status: 'pending', action: { type: 'none' } } }),
        }}
      />,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /Pagar/ }).getAttribute('aria-disabled')).toBe('false'))
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /Pagar/ })))
    await waitFor(() => expect(screen.getByText('¡Pago aprobado!')).toBeTruthy(), { timeout: 2000 })
  })
})

describe('createFetchTransport', () => {
  const req: PaymentSubmitRequest = { option: 'card', attempt: 'a1', idempotencyKey: 'a1', provider_data: { token: 't' }, expected_total: total }
  const ctx = { signal: new AbortController().signal }
  it('posts JSON with the idempotency key and parses the result', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(paid), { status: 200 }))
    const t = createFetchTransport('/pagar', { fetch: f as never })
    expect(await t.submit(req, ctx)).toEqual(paid)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/pagar')
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('a1')
    expect(JSON.parse(init.body as string).provider_data).toEqual({ token: 't' })
    expect(init.credentials).toBe('same-origin')
  })
  it.each([
    [422, { error: { code: 'price_mismatch', message: 'changed' } }, 'price_mismatch'],
    [409, { error: { code: 'payment_in_progress' } }, 'payment_in_progress'],
    [503, null, 'server_error'],
  ])('%s -> PaymentHttpError(%s)', async (status, body, code) => {
    const t = createFetchTransport('/pagar', { fetch: (async () => new Response(body ? JSON.stringify(body) : '', { status })) as never })
    await expect(t.submit(req, ctx)).rejects.toMatchObject({ status, code })
  })
  it('a 200 with a malformed body is an error, not a success', async () => {
    const t = createFetchTransport('/pagar', { fetch: (async () => new Response('{"ok":true}', { status: 200 })) as never })
    await expect(t.submit(req, ctx)).rejects.toMatchObject({ status: 502, code: 'invalid_response' })
  })
  it('refresh only exists with refreshUrl', () => {
    expect(createFetchTransport('/p').refresh).toBeUndefined()
    expect(createFetchTransport('/p', { refreshUrl: '/p/estado' }).refresh).toBeTypeOf('function')
  })
})

describe('Mercado Pago adapter', () => {
  it.each([
    ['keeps only the allowed fields', { token: 'abc', payment_method_id: 'master', issuer_id: 24, installments: 3, transaction_amount: 1, payer: { email: 'a@b.mx', identification: { type: 'RFC', number: 'XAXX010101000' }, first_name: 'x' }, cardholder: { name: 'JUAN' }, card_number: '4075595716483764' }, { token: 'abc', payment_method_id: 'master', issuer_id: '24', installments: 3, payer: { email: 'a@b.mx', identification: { type: 'RFC', number: 'XAXX010101000' } } }],
    ['drops the amount even alone', { token: 't', transaction_amount: 999999, amount: 5 }, { token: 't' }],
    ['rejects absurd installments', { token: 't', installments: 9999 }, { token: 't' }],
    ['rejects non-string token', { token: 123 }, {}],
    ['handles null', null, {}],
  ])('sanitize: %s', (_n, input, out) => expect(sanitizeMercadoPagoFormData(input as never)).toEqual(out))

  it('creates a cardPayment brick with hidden button, installments cap, theme and server amount; collect strips amounts', async () => {
    const create = vi.fn(async (_b: string, _id: string, settings: Record<string, any>) => {
      queueMicrotask(() => settings.callbacks.onReady())
      return { getFormData: async () => ({ token: 'tok', payment_method_id: 'visa', installments: 1, transaction_amount: 1 }), unmount: vi.fn() }
    })
    const ctor = vi.fn(function (this: unknown) {
      return { bricks: () => ({ create }) }
    }) as never
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => ctor, getDeviceSessionId: () => 'dev-xyz' })
    const el = document.createElement('div')
    el.id = 'brick1'
    const onReady = vi.fn()
    const mounted = await adapter.mount({ container: el, client: { ...client, kind: 'mercadopago_bricks' }, amount: total, locale: 'es-MX', theme: { baseColor: '#123456' }, onReady, onError: vi.fn(), email: 'a@b.mx' })
    expect(create).toHaveBeenCalledTimes(1)
    const [brick, id, settings] = create.mock.calls[0]!
    expect(brick).toBe('cardPayment')
    expect(id).toBe('brick1')
    expect(settings.initialization).toEqual({ amount: 2185, payer: { email: 'a@b.mx' } })
    expect(settings.customization.visual.hidePaymentButton).toBe(true)
    // El título y las banderas del Brick repiten la fila de la tienda y se veían cortados.
    expect(settings.customization.visual.hideFormTitle).toBe(true)
    expect(settings.customization.visual.style.customVariables).toEqual({ baseColor: '#123456' })
    // Página clara (o sin esquema): el tema base del Brick.
    expect(settings.customization.visual.style.theme).toBe('default')
    expect(settings.customization.paymentMethods).toEqual({ minInstallments: 1, maxInstallments: 12 })
    await Promise.resolve()
    expect(onReady).toHaveBeenCalled()
    expect(await mounted.collect()).toEqual({ provider_data: { token: 'tok', payment_method_id: 'visa', installments: 1 }, device_session_id: 'dev-xyz' })
    await mounted.unmount()
    await expect(mounted.collect()).rejects.toThrow()
  })

  it('a dark page mounts the dark base theme of the brick (no white card inside a dark checkout)', async () => {
    const create = vi.fn(async (_b: string, _id: string, settings: Record<string, any>) => {
      queueMicrotask(() => settings.callbacks.onReady())
      return { getFormData: async () => ({}), unmount: vi.fn() }
    })
    const ctor = vi.fn(function (this: unknown) {
      return { bricks: () => ({ create }) }
    }) as never
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => ctor })
    const el = document.createElement('div')
    el.id = 'brick2'
    await adapter.mount({ container: el, client: { ...client, kind: 'mercadopago_bricks' }, amount: total, colorScheme: 'dark', theme: {}, onReady: vi.fn(), onError: vi.fn() })
    const settings = create.mock.calls[0]![2]
    expect(settings.customization.visual.style).toEqual({ theme: 'dark' })
    // Sin correo de la tienda, el Brick lo pide él mismo.
    expect(settings.initialization).toEqual({ amount: 2185 })
  })

  it('refuses SDK urls outside the allowed origin before touching the DOM', async () => {
    const adapter = mercadoPagoBricksAdapter({ getSdk: () => undefined })
    await expect(adapter.load({ ...client, kind: 'mercadopago_bricks', sdk_url: 'https://evil.example.com/sdk.js' }, { timeoutMs: 50 })).rejects.toThrow(/origin not allowed/)
    await expect(adapter.load({ ...client, kind: 'mercadopago_bricks', sdk_url: 'http://sdk.mercadopago.com/js/v2' }, { timeoutMs: 50 })).rejects.toThrow(/https required/)
    expect(document.querySelector('script[data-sf-payment-sdk]')).toBeNull()
  })
})

describe('loadPaymentSdk', () => {
  // Stub document: the real DOM would try to fetch the script.
  function stubDoc() {
    const scripts: any[] = []
    const doc = {
      createElement: () => ({ dataset: {} as Record<string, string>, remove() { scripts.splice(scripts.indexOf(this), 1) } } as any),
      head: { appendChild: (el: any) => void scripts.push(el) },
    } as unknown as Document
    return { doc, scripts }
  }
  it('inserts one script with nonce, resolves on load and dedupes', async () => {
    const { doc, scripts } = stubDoc()
    const p1 = loadPaymentSdk('https://sdk.example.com/js', { timeoutMs: 500, nonce: 'abc123', document: doc })
    const p2 = loadPaymentSdk('https://sdk.example.com/js', { timeoutMs: 500, nonce: 'abc123', document: doc })
    expect(scripts).toHaveLength(1)
    expect(scripts[0].nonce).toBe('abc123')
    expect(scripts[0].src).toBe('https://sdk.example.com/js')
    expect(scripts[0].async).toBe(true)
    scripts[0].onload()
    await Promise.all([p1, p2])
  })
  it('rejects on error and times out, allowing a later retry', async () => {
    const { doc, scripts } = stubDoc()
    const p = loadPaymentSdk('https://sdk.example.com/err', { timeoutMs: 500, document: doc })
    scripts[0].onerror()
    await expect(p).rejects.toThrow(/failed to load/)
    expect(scripts).toHaveLength(0)
    await expect(loadPaymentSdk('https://sdk.example.com/slow', { timeoutMs: 20, document: doc })).rejects.toThrow(/timeout/)
    expect(scripts).toHaveLength(0)
    const retry = loadPaymentSdk('https://sdk.example.com/err', { timeoutMs: 500, document: doc })
    expect(scripts).toHaveLength(1) // a failed load does not poison the cache
    scripts[0].onload()
    await retry
  })
  it('skips insertion when already loaded and refuses non-https', async () => {
    const { doc, scripts } = stubDoc()
    await loadPaymentSdk('https://sdk.example.com/loaded', { timeoutMs: 20, isLoaded: () => true, document: doc })
    expect(scripts).toHaveLength(0)
    await expect(loadPaymentSdk('http://sdk.example.com/x', { timeoutMs: 20, document: doc })).rejects.toThrow(/https/)
    await expect(loadPaymentSdk('not a url', { timeoutMs: 20, document: doc })).rejects.toThrow(/invalid url/)
  })
})

describe('paymentCsp', () => {
  it('builds the directives from what the provider declares', () => {
    const csp = paymentCsp([client], { nonce: 'n0nce+/=' })
    expect(csp).toContain("script-src 'self' 'nonce-n0nce+/=' https://sdk.example.com")
    expect(csp).toContain('frame-src https://*.example.com')
    expect(csp).toContain("connect-src 'self' https://api.example.com")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
  })
  it.each([
    ['semicolon injection', "https://ok.test; script-src *"],
    ['unsafe-eval', "'unsafe-eval'"],
    ['http origin', 'http://plain.test'],
    ['wildcard only', '*'],
    ['space', 'https://a.test https://b.test'],
  ])('drops hostile origins: %s', (_n, bad) => {
    const csp = paymentCsp([{ ...client, csp: { script: [bad] } }])
    expect(csp).not.toContain(bad)
    expect(csp.split(';').length).toBe(10)
  })
  it('rejects a malformed nonce, adds extras and report-uri, and handles no client', () => {
    expect(paymentCsp([client], { nonce: "x'; evil" })).not.toContain('nonce-')
    expect(paymentCsp([client], { extra: { img: ['https://cdn.shop.test'] }, reportUri: '/csp-report' })).toMatch(/img-src 'self' data: .*https:\/\/cdn\.shop\.test.*report-uri \/csp-report/)
    expect(paymentCsp([null, undefined])).toContain("frame-src 'none'")
    expect(paymentCspHeaderName(true)).toBe('Content-Security-Policy-Report-Only')
    expect(paymentCspHeaderName(false)).toBe('Content-Security-Policy')
  })
})

describe('SSR', () => {
  it('renders a stable skeleton on the server without touching the DOM or the SDK', async () => {
    const { renderToString } = await import('react-dom/server')
    const html = renderToString(<PaymentBrick client={client} amount={total} transport={{ submit: async () => paid }} locale="es-MX" submitLabel="Pagar" />)
    expect(html).toContain('data-sf-pay-container')
    expect(html).toContain('aria-busy="false"')
    expect(html).not.toContain('<script')
    expect(html).toContain('min-height')
  })
})
