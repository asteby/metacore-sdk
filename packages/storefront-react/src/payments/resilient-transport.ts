/**
 * Browser transport to the shop's pay and status routes, with the retry policy a card payment needs.
 *
 * - A TRANSIENT failure (5xx, timeout, network, a proxy HTML page) is repeated up to `retries` times with the SAME
 *   idempotency key (`request.idempotencyKey`): OPS then answers with the result of the first attempt. A payment whose
 *   outcome is unknown is NEVER charged with another key.
 * - If it is still unknown, the status route is read `statusPolls` times. A resolved answer (paid, failed, voucher,
 *   challenge...) is returned; otherwise a network error is thrown and the hook keeps the SAME attempt (retry button
 *   and background checks).
 * - `retryable: false` (an answer from OPS) is ONE request: no repeat, no status read.
 * - A body that is not JSON is treated as transient, never as a definitive error.
 */
import type { PaymentAttemptResult, PaymentErrorClassKind } from '@asteby/storefront'
import { classifyPaymentError } from '@asteby/storefront'
import { PaymentHttpError, type PaymentSubmitRequest, type PaymentTransport } from './adapter.js'
import { paymentRecoveryMessages, type PaymentRecoveryMessages } from './recovery-messages.js'

/** What the screen is told while a payment is being repeated or checked, and when it ends with a problem. */
export type PaymentIssue =
  | { kind: 'confirming'; message: string }
  | { kind: 'verifying'; message: string }
  | { kind: PaymentErrorClassKind; message: string; retryable: boolean; status: number; code: string }

export type ResilientTransportOptions = {
  /** Same-origin route that charges the card (`handlers.pay`). */
  payUrl: string
  /** Same-origin route that re-reads the payment (`handlers.status`). Enables the status checks and `refresh`. */
  statusUrl: string
  /** Fields of the page form (delivery, contact, payment choice) that travel with the charge. */
  fields: () => Record<string, string>
  /** Called with the state of the retry/verification and with the final problem; `null` clears it. */
  onIssue?: (issue: PaymentIssue | null) => void
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  /** Automatic repeats after the first request. Default 2. */
  retries?: number
  /** Wait before each repeat (ms); the last value repeats. Default `[800, 2000]`. */
  backoffMs?: readonly number[]
  /** Status reads before declaring the result "verifying". Default 3. */
  statusPolls?: number
  /** Wait between status reads (ms). Default 2000. */
  statusPollMs?: number
  /** Extra headers for both routes. */
  headers?: Record<string, string>
  locale?: string
  messages?: Partial<PaymentRecoveryMessages>
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Has OPS decided? `pending` without an action, and `none`, are NOT decisions. */
export function isResolvedAttempt(result: PaymentAttemptResult): boolean {
  const p = result.payment
  if (p.status === 'paid' || p.status === 'failed' || p.status === 'expired' || p.status === 'cancelled') return true
  const type = p.action?.type
  return type === 'voucher' || type === 'challenge' || type === 'redirect'
}

type Failure = { kind: PaymentErrorClassKind; status: number; code: string; message: string; retryable: boolean; details?: unknown }
type ErrBody = { error?: { code?: string; message?: string; retryable?: boolean; kind?: PaymentErrorClassKind; details?: unknown; field?: string; checkout_id?: string } }

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function createResilientTransport(opts: ResilientTransportOptions): PaymentTransport {
  const doFetch = opts.fetch ?? ((u: RequestInfo | URL, i?: RequestInit) => globalThis.fetch(u, i))
  const sleep = opts.sleep ?? realSleep
  const retries = opts.retries ?? 2
  const backoff = opts.backoffMs ?? [800, 2000]
  const polls = opts.statusPolls ?? 3
  const pollMs = opts.statusPollMs ?? 2000
  const msgs = paymentRecoveryMessages(opts.locale, opts.messages)
  const text = (k: PaymentErrorClassKind) => msgs[`error.${k}`]
  const issue = (i: PaymentIssue | null) => opts.onIssue?.(i)
  const confirming = msgs['notice.confirming.title']

  /** One request. Returns the result or an already classified failure; never throws for network or HTML. */
  async function call(url: string, init: RequestInit): Promise<{ ok: PaymentAttemptResult } | { fail: Failure }> {
    let res: Response
    try {
      res = await doFetch(url, { credentials: 'same-origin', ...init, headers: { ...opts.headers, ...(init.headers as Record<string, string> | undefined) } })
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') throw err
      return { fail: { kind: 'transient', status: 0, code: 'network', message: text('transient'), retryable: true } }
    }
    const body = (await readJson(res)) as ErrBody | PaymentAttemptResult | null
    if (res.ok) {
      const r = body as PaymentAttemptResult | null
      if (r && typeof r === 'object' && r.payment && typeof r.payment.status === 'string') return { ok: r }
      return { fail: { kind: 'transient', status: 502, code: 'invalid_response', message: text('transient'), retryable: true } }
    }
    const e = (body as ErrBody | null)?.error
    if (!e) {
      // No JSON error (the proxy's HTML page, a cut connection): unknown outcome, so transient.
      const info = classifyPaymentError({ status: res.status >= 500 || res.status === 0 ? 503 : res.status })
      return { fail: { kind: info.kind, status: res.status, code: 'server_error', message: text(info.kind), retryable: info.retryable } }
    }
    // What OPS declared wins: `retryable:false` is never repeated or checked, even if the body says "transient".
    const byCode = classifyPaymentError({ status: res.status, code: e.code ?? null, field: e.field ?? null, retryable: typeof e.retryable === 'boolean' ? e.retryable : null, checkoutId: e.checkout_id ?? null, details: e.details })
    const info = e.kind && !(e.kind === 'transient' && !byCode.retryable) ? { kind: e.kind, retryable: e.retryable === true || byCode.retryable } : byCode
    return { fail: { kind: info.kind, status: res.status, code: e.code ?? 'server_error', message: e.message || text(info.kind), retryable: info.retryable, details: e.details } }
  }

  // Transients reach the hook as "network" (same key, retry button); the rest keep their HTTP status.
  const toError = (f: Failure) =>
    f.kind === 'transient'
      ? new PaymentHttpError(503, 'network', f.message, f.details, { retryable: true, kind: 'transient' })
      : new PaymentHttpError(f.status || 500, f.code, f.message, f.details, { retryable: f.retryable, kind: f.kind })

  async function resolveByStatus(signal: AbortSignal): Promise<PaymentAttemptResult | null> {
    for (let i = 0; i < polls; i++) {
      const r = await call(opts.statusUrl, { method: 'POST', signal, headers: { Accept: 'application/json' } })
      if ('ok' in r) {
        // `none` (no payment session in this browser) is not an answer: the attempt stays open with the same key.
        if (isResolvedAttempt(r.ok)) return r.ok
      } else if (!r.fail.retryable) {
        return null
      }
      if (i < polls - 1) await sleep(pollMs)
    }
    return null
  }

  return {
    async submit(request: PaymentSubmitRequest, { signal }) {
      const init: RequestInit = {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': request.idempotencyKey },
        body: JSON.stringify({ ...request, fields: opts.fields() }),
      }
      issue(null)
      let last: Failure | null = null
      for (let n = 0; n <= retries; n++) {
        const r = await call(opts.payUrl, init)
        if ('ok' in r) {
          issue(null)
          return r.ok
        }
        last = r.fail
        const waitable = last.retryable && (last.kind === 'transient' || last.kind === 'in_progress')
        if (!waitable || n === retries) break
        issue({ kind: 'confirming', message: confirming })
        await sleep(backoff[Math.min(n, backoff.length - 1)] ?? 800)
      }
      const failure = last!
      // Unknown outcome (or a checkout that already exists): what does OPS say before giving up?
      if ((failure.retryable && (failure.kind === 'transient' || failure.kind === 'in_progress')) || failure.kind === 'stale_checkout') {
        issue({ kind: 'verifying', message: confirming })
        const resolved = await resolveByStatus(signal)
        if (resolved) {
          issue(null)
          return resolved
        }
      }
      issue({ kind: failure.kind, message: failure.message, retryable: failure.retryable, status: failure.status, code: failure.code })
      throw toError(failure)
    },
    refresh: async ({ signal }) => {
      const r = await call(opts.statusUrl, { method: 'POST', signal, headers: { Accept: 'application/json' } })
      if ('ok' in r) return r.ok
      throw toError(r.fail)
    },
  }
}
