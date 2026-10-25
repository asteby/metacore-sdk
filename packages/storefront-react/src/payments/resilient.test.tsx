// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { PaymentAttemptResult } from '@asteby/storefront'
import {
  PaymentHttpError,
  PaymentRecovery,
  alternativeChoices,
  buildPayChoices,
  checkoutShouldRevalidate,
  createResilientTransport,
  usePaymentRecovery,
  type PaymentIssue,
  type PaymentSubmitRequest,
} from './index.js'

afterEach(cleanup)

const request: PaymentSubmitRequest = { option: 'card', attempt: 'att-12345678', idempotencyKey: 'att-12345678', provider_data: { token: 't' }, expected_total: { amount: '100.00', currency_code: 'MXN' } }
const ctx = { signal: new AbortController().signal }
const paid: PaymentAttemptResult = { payment: { provider: 'p', status: 'paid', outcome: 'approved' } }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const opsError = (status: number, code: string, extra: Record<string, unknown> = {}) => json({ error: { code, message: 'technical', ...extra } }, status)

type Route = (url: string, init: RequestInit) => Response | Promise<Response>
function harness(route: Route, over: Partial<Parameters<typeof createResilientTransport>[0]> = {}) {
  const calls: Array<{ url: string; key: string | null }> = []
  const issues: Array<PaymentIssue | null> = []
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, key: new Headers(init.headers).get('Idempotency-Key') })
    return route(url, init)
  }) as unknown as typeof globalThis.fetch
  const transport = createResilientTransport({
    payUrl: '/pagar/cobrar',
    statusUrl: '/pagar/estado',
    fields: () => ({ email: 'a@b.co' }),
    onIssue: (i) => issues.push(i),
    fetch,
    sleep: async () => {},
    ...over,
  })
  return { transport, calls, issues, pays: () => calls.filter((c) => c.url === '/pagar/cobrar'), statuses: () => calls.filter((c) => c.url === '/pagar/estado') }
}

describe('createResilientTransport', () => {
  it('repeats a transient failure with the SAME idempotency key until it works', async () => {
    let n = 0
    const h = harness((url) => (url === '/pagar/cobrar' ? (++n < 3 ? opsError(500, 'unavailable', { retryable: true, kind: 'transient' }) : json(paid)) : json(paid)))
    await expect(h.transport.submit(request, ctx)).resolves.toEqual(paid)
    expect(h.pays()).toHaveLength(3)
    expect(new Set(h.pays().map((c) => c.key))).toEqual(new Set(['att-12345678']))
    expect(h.issues.some((i) => i?.kind === 'confirming')).toBe(true)
    expect(h.issues.at(-1)).toBeNull()
  })

  it('retryable:false is ONE request: no repeat and no status read', async () => {
    const h = harness(() => opsError(500, 'payment_provider_rejected', { retryable: false, kind: 'provider_declined' }))
    const err = (await h.transport.submit(request, ctx).catch((e: unknown) => e)) as PaymentHttpError
    expect(err).toBeInstanceOf(PaymentHttpError)
    expect(err.kind).toBe('provider_declined')
    expect(err.retryable).toBe(false)
    expect(h.calls).toHaveLength(1)
    expect(h.issues.at(-1)).toMatchObject({ kind: 'provider_declined', retryable: false })
  })

  it('a body that says "transient" but retryable:false from OPS is still not repeated', async () => {
    const h = harness(() => opsError(500, 'server_error', { retryable: false, kind: 'transient' }))
    await expect(h.transport.submit(request, ctx)).rejects.toBeInstanceOf(PaymentHttpError)
    expect(h.calls).toHaveLength(1)
  })

  it('an indeterminate result is resolved by reading the status, never by charging with another key', async () => {
    const h = harness((url) => (url === '/pagar/cobrar' ? new Response('<html>Actualizando</html>', { status: 503, headers: { 'Content-Type': 'text/html' } }) : json(paid)))
    await expect(h.transport.submit(request, ctx)).resolves.toEqual(paid)
    expect(h.pays()).toHaveLength(3)
    expect(h.statuses()).toHaveLength(1)
    expect(new Set(h.pays().map((c) => c.key)).size).toBe(1)
  })

  it('status `none` (no session) leaves it indeterminate: the SAME attempt stays, as a network error', async () => {
    const none = { payment: { provider: '', status: 'none' }, recoverable: true }
    const h = harness((url) => (url === '/pagar/cobrar' ? opsError(500, 'unavailable', { retryable: true }) : json(none)))
    const err = (await h.transport.submit(request, ctx).catch((e: unknown) => e)) as PaymentHttpError
    expect(err).toBeInstanceOf(PaymentHttpError)
    expect(err.status).toBe(503)
    expect(err.code).toBe('network') // the hook then keeps the same attempt and shows "retry"
    expect(err.kind).toBe('transient')
    expect(h.statuses()).toHaveLength(3)
    expect(new Set(h.pays().map((c) => c.key))).toEqual(new Set(['att-12345678']))
    expect(h.issues.at(-1)).toMatchObject({ kind: 'transient', retryable: true })
  })

  it('a pending status without action is not a decision either', async () => {
    const pending: PaymentAttemptResult = { payment: { provider: 'p', status: 'pending', action: { type: 'none' } } }
    const h = harness((url) => (url === '/pagar/cobrar' ? opsError(502, 'unavailable', { retryable: true }) : json(pending)), { retries: 0 })
    await expect(h.transport.submit(request, ctx)).rejects.toMatchObject({ code: 'network' })
  })

  it('a rejection read from the status is returned as the result', async () => {
    const failed: PaymentAttemptResult = { payment: { provider: 'p', status: 'failed', decline_code: 'insufficient_funds' } }
    const h = harness((url) => (url === '/pagar/cobrar' ? opsError(500, 'unavailable', { retryable: true }) : json(failed)), { retries: 0 })
    await expect(h.transport.submit(request, ctx)).resolves.toEqual(failed)
  })

  it('network failures are transient too; refresh reads the status route', async () => {
    let n = 0
    const h = harness((url) => {
      if (url === '/pagar/cobrar' && ++n === 1) throw new TypeError('Failed to fetch')
      return json(paid)
    })
    await expect(h.transport.submit(request, ctx)).resolves.toEqual(paid)
    await expect(h.transport.refresh!(ctx)).resolves.toEqual(paid)
  })

  it('sends the page fields with the charge and the key in the header', async () => {
    let sent: { fields?: unknown } = {}
    const h = harness((_u, init) => {
      sent = JSON.parse(String(init.body))
      return json(paid)
    })
    await h.transport.submit(request, ctx)
    expect(sent.fields).toEqual({ email: 'a@b.co' })
  })

  it('texts are Spanish by default, in English on request, and overridable', async () => {
    const es = harness(() => new Response('x', { status: 503 }), { retries: 0, statusPolls: 1 })
    expect(((await es.transport.submit(request, ctx).catch((e: unknown) => e)) as Error).message).toMatch(/verificando tu pago/i)
    const en = harness(() => new Response('x', { status: 503 }), { retries: 0, statusPolls: 1, locale: 'en-US' })
    expect(((await en.transport.submit(request, ctx).catch((e: unknown) => e)) as Error).message).toMatch(/verifying your payment/i)
    const custom = harness(() => new Response('x', { status: 503 }), { retries: 0, statusPolls: 1, messages: { 'error.transient': 'Un momento…' } })
    expect(((await custom.transport.submit(request, ctx).catch((e: unknown) => e)) as Error).message).toBe('Un momento…')
  })
})

describe('usePaymentRecovery', () => {
  const store = () => {
    const data = new Map<string, string>([['sf:pay:attempt:cart_1', 'att-old']])
    return { data, storage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) } }
  }
  const issue = (kind: PaymentIssue['kind']): PaymentIssue =>
    kind === 'confirming' || kind === 'verifying' ? { kind, message: 'x' } : { kind, message: 'x', retryable: false, status: 500, code: 'c' }

  it('maps transport issues to notices', () => {
    const { result } = renderHook(() => usePaymentRecovery({ scope: 'cart_1', storage: null }))
    act(() => result.current.onIssue(issue('verifying')))
    expect(result.current.notice).toEqual({ kind: 'confirming' })
    act(() => result.current.onIssue(null))
    expect(result.current.notice).toBeNull()
    act(() => result.current.onIssue(issue('merchant_config')))
    expect(result.current.notice).toEqual({ kind: 'merchant_config' })
    act(() => result.current.onIssue(issue('provider_declined')))
    expect(result.current.notice).toEqual({ kind: 'provider_declined' })
    act(() => result.current.onIssue(issue('stale_checkout')))
    expect(result.current.notice).toEqual({ kind: 'stale_checkout' })
  })

  it('retry starts a NEW attempt (key removed, section remounted) only after a definitive failure', () => {
    const s = store()
    const { result } = renderHook(() => usePaymentRecovery({ scope: 'cart_1', storage: s.storage }))
    act(() => result.current.onIssue(issue('provider_declined')))
    const before = result.current.sectionKey
    let ok = false
    act(() => {
      ok = result.current.retry()
    })
    expect(ok).toBe(true)
    expect(s.data.has('sf:pay:attempt:cart_1')).toBe(false)
    expect(result.current.sectionKey).toBe(before + 1)
    expect(result.current.notice).toBeNull()
  })

  it('retry does NOTHING while the outcome is unknown: the old key stays', () => {
    const s = store()
    const { result } = renderHook(() => usePaymentRecovery({ scope: 'cart_1', storage: s.storage }))
    for (const kind of ['confirming', 'verifying', 'transient'] as const) {
      act(() => result.current.onIssue(issue(kind)))
      let ok = true
      act(() => {
        ok = result.current.retry()
      })
      expect(ok).toBe(false)
    }
    expect(s.data.get('sf:pay:attempt:cart_1')).toBe('att-old')
    expect(result.current.sectionKey).toBe(0)
  })

  it('remounts a form that failed to load by itself (limited) and then shows the notice', () => {
    const { result } = renderHook(() => usePaymentRecovery({ scope: 'cart_1', storage: null, formAutoRetries: 2 }))
    const fail = () => act(() => result.current.onEvent({ type: 'form_failed', reason: 'sdk_error' }))
    fail()
    fail()
    expect(result.current.sectionKey).toBe(2)
    expect(result.current.notice).toBeNull()
    fail()
    expect(result.current.sectionKey).toBe(2)
    expect(result.current.notice).toEqual({ kind: 'form_failed' })
    act(() => result.current.onEvent({ type: 'form_ready', ms: 1 }))
    expect(result.current.notice).toBeNull()
  })

  it('a rejected card shows its notice; a closed store re-reads the page', () => {
    const onRevalidate = vi.fn()
    const { result } = renderHook(() => usePaymentRecovery({ storage: null, onRevalidate }))
    act(() => result.current.onEvent({ type: 'result', status: 'rejected', decline_code: 'declined' }))
    expect(result.current.notice).toEqual({ kind: 'rejected' })
    act(() => result.current.onIssue({ kind: 'store_closed', message: 'x', retryable: false, status: 409, code: 'store_not_ready' }))
    act(() => result.current.onEvent({ type: 'error', kind: 'generic' }))
    expect(onRevalidate).toHaveBeenCalledOnce()
  })
})

describe('<PaymentRecovery>', () => {
  const method = {
    key: 'prov',
    kind: 'provider' as const,
    default: true,
    client: { kind: 'x', sdk_url: 'https://s.example/js', public_key: 'pk' },
    options: [
      { key: 'card', redirect: false },
      { key: 'cash', redirect: false, points: [{ id: 'a', payment_method_id: 's', label: 'Tienda', group: 'main' }] },
    ],
  }
  const alternatives = alternativeChoices(buildPayChoices([method]).choices)
  const noop = () => {}

  it('confirming is a polite status with no buttons', () => {
    render(<PaymentRecovery notice={{ kind: 'confirming' }} alternatives={alternatives} onRetry={noop} onPick={noop} onRefresh={noop} />)
    expect(screen.getByRole('status').textContent).toMatch(/confirmando tu pago/i)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('a merchant failure does not blame the card and offers the alternatives that came from the choices', () => {
    const onPick = vi.fn()
    const onRetry = vi.fn()
    render(<PaymentRecovery notice={{ kind: 'merchant_config' }} alternatives={alternatives} onRetry={onRetry} onPick={onPick} onRefresh={noop} />)
    expect(screen.getByRole('alert').textContent).toMatch(/No es un problema con tu tarjeta/)
    expect(screen.getByRole('alert').textContent).not.toMatch(/Mercado|MercadoPago/i)
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con Efectivo' }))
    expect(onPick).toHaveBeenCalledWith(alternatives[0])
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar pago' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('a stale checkout offers to refresh, not to pay again', () => {
    const onRefresh = vi.fn()
    render(<PaymentRecovery notice={{ kind: 'stale_checkout' }} alternatives={alternatives} onRetry={noop} onPick={noop} onRefresh={onRefresh} />)
    expect(screen.queryByRole('button', { name: /Reintentar/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Pagar con/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar mi pedido' }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('texts, button labels and class names are overridable; English on request', () => {
    render(
      <PaymentRecovery
        notice={{ kind: 'rejected' }}
        alternatives={alternatives}
        onRetry={noop}
        onPick={noop}
        onRefresh={noop}
        messages={{ 'notice.rejected.title': 'Rechazado' }}
        alternativeLabel={(c) => `Mejor ${c.label ?? 'otra'}`}
        classNames={{ root: 'caja', primary: 'btn-p' }}
      />,
    )
    expect(screen.getByText('Rechazado')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Mejor/ })).toBeTruthy()
    expect(document.querySelector('.caja')).toBeTruthy()
    expect(document.querySelector('button.btn-p')?.textContent).toBe('Reintentar pago')
    cleanup()
    render(<PaymentRecovery notice={{ kind: 'provider_declined' }} alternatives={alternatives} onRetry={noop} onPick={noop} onRefresh={noop} locale="en-US" />)
    expect(screen.getByRole('alert').textContent).toMatch(/You were not charged/)
  })

  it('renders nothing without a notice', () => {
    const { container } = render(<PaymentRecovery notice={null} onRetry={noop} onPick={noop} onRefresh={noop} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('checkoutShouldRevalidate', () => {
  const should = checkoutShouldRevalidate({ paths: ['/pagar'] })
  it('keeps the other loaders quiet for a submit to the checkout route only', () => {
    expect(should({ formMethod: 'POST', formAction: '/pagar', defaultShouldRevalidate: true })).toBe(false)
    expect(should({ formMethod: 'post', formAction: 'https://tienda.test/pagar/?x=1', defaultShouldRevalidate: true })).toBe(false)
    expect(should({ formMethod: 'POST', formAction: '/carrito', defaultShouldRevalidate: true })).toBe(true)
    expect(should({ formMethod: 'GET', formAction: '/pagar', defaultShouldRevalidate: true })).toBe(true)
    expect(should({ defaultShouldRevalidate: false })).toBe(false)
  })
})
