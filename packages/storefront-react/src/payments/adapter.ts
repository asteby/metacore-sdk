/**
 * Replaceable ports of the embedded payment. The shop (or another provider)
 * implements these; the hook and component only talk to them.
 *
 * Two ports, on purpose:
 * - `PaymentFormAdapter` = the provider SDK in the browser (Mercado Pago Bricks, Stripe Elements...).
 *   It mounts a secure form and returns only what the SDK allows to travel (a one-use token).
 * - `PaymentTransport` = how the browser reaches the shop SERVER. The browser never calls OPS: the shop's
 *   route forwards to `client.checkouts.pay(...)` with its private token. The HTTP contract between
 *   the shop route and OPS lives in `@asteby/storefront` (`checkouts.pay`); the shop route is free to
 *   shape its own JSON as long as it answers with a `PaymentAttemptResult`.
 */
import type { Money, PaymentAction, PaymentAttemptResult, PaymentClient, PaymentErrorClassKind } from '@asteby/storefront'

export type PaymentFormError = {
  /** `true`: the form cannot be used (SDK blocked, iframe failed). The hook falls back to a redirect. */
  critical: boolean
  /** Short, non-sensitive text for logs. Never card data. */
  message?: string
}

export type PaymentFormMountOptions = {
  /** Element the provider renders into. Its `id` is set by the hook. */
  container: HTMLElement
  client: PaymentClient
  /** Total computed by the server. Only passed to the provider widget; never calculated here. */
  amount: Money
  email?: string
  locale?: string
  /** Visual tokens read from CSS variables (see `readPaymentTheme`). */
  theme?: Record<string, string>
  /** Light or dark page (see `readPaymentScheme`): the adapter picks the provider's matching base theme. */
  colorScheme?: 'light' | 'dark'
  onReady: () => void
  onError: (error: PaymentFormError) => void
  /** Aborted when this mount is no longer wanted (the form unmounted or was replaced). Adapters must not create after it. */
  signal?: AbortSignal
}

/** What a mounted form hands back at submit time. */
export type PaymentFormData = {
  /** Sent to the server as `provider_data`. Must never contain amounts or raw card data. */
  provider_data: Record<string, unknown>
  /** Anti-fraud device fingerprint, if the SDK exposes one. */
  device_session_id?: string
}

export interface MountedPaymentForm {
  /** Tokenises the card inside the provider iframes. Rejects when the form is invalid (the provider shows the field errors). */
  collect(): Promise<PaymentFormData>
  /**
   * Applies a new server total to the form that is already on screen, without remounting it. Rejects when the provider
   * cannot (the hook then remounts, queued). Absent: the hook remounts on every total change.
   */
  update?(next: { amount: Money }): Promise<void>
  /**
   * Optional: runs a pending action the provider SDK itself must drive (Stripe: `challenge.kind === 'stripe_next_action'`
   * -> `stripe.handleNextAction`, 3DS in the provider's own modal). Resolves when the SDK says the buyer finished it; rejects
   * when it failed, was cancelled or the action is not this adapter's. Neither is proof of payment: the hook always reads
   * the payment state from the server afterwards. Actions with a bank `url` (Mercado Pago 3DS) never come here.
   */
  handleAction?(action: PaymentAction): Promise<void>
  unmount(): void | Promise<void>
}

export interface PaymentFormAdapter {
  /** `PaymentClient.kind` this adapter serves. */
  readonly kind: string
  /** Loads the provider script (once). Rejects on timeout, blocked script or invalid URL. */
  load(client: PaymentClient, options: { nonce?: string; timeoutMs: number }): Promise<void>
  mount(options: PaymentFormMountOptions): Promise<MountedPaymentForm>
}

/** Everything the shop server needs for one attempt. No card data: only the provider token and choices. */
export type PaymentSubmitRequest = {
  option: 'card'
  /** Stable per attempt: the same attempt always carries the same key, so a retry never charges twice. */
  attempt: string
  idempotencyKey: string
  provider_data: Record<string, unknown>
  device_session_id?: string
  /** The total the buyer saw (the server's own number). The server answers 422 `price_mismatch` if it differs. */
  expected_total: Money
}

export type PaymentTransport = {
  submit(request: PaymentSubmitRequest, context: { signal: AbortSignal }): Promise<PaymentAttemptResult>
  /** Optional: re-reads the checkout state (3DS challenge, "in review"). Same result shape as `submit`. */
  refresh?(context: { signal: AbortSignal }): Promise<PaymentAttemptResult>
}

/** Error thrown by `createFetchTransport` for non-2xx answers; compatible with `paymentErrorView`. */
export class PaymentHttpError extends Error {
  override readonly name = 'PaymentHttpError'
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
    /** Raw `error.details` (e.g. the new `cost` of a `price_mismatch`); untrusted shape. */
    readonly details?: unknown,
    /** Optional classification from the shop's JSON body (`retryable`, `kind`). */
    extra?: { retryable?: boolean | undefined; kind?: PaymentErrorClassKind | undefined },
  ) {
    super(message ?? code)
    this.retryable = extra?.retryable
    this.kind = extra?.kind
  }
  /** `error.retryable` of the shop body: `true` repeat with the SAME key; `false` it is an answer. `undefined`: not said. */
  readonly retryable: boolean | undefined
  /** `error.kind` of the shop body (`classifyPaymentError`). */
  readonly kind: PaymentErrorClassKind | undefined
}

export type FetchTransportOptions = {
  fetch?: typeof fetch
  headers?: Record<string, string>
  /** Default `same-origin`. */
  credentials?: RequestCredentials
  /** Shapes the JSON body; the default sends the request as is. */
  buildBody?: (request: PaymentSubmitRequest) => unknown
  /** Same-origin URL that re-reads the state (enables `refresh`). */
  refreshUrl?: string
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Transport to a same-origin shop route (`POST url` with JSON). Maps `{ error: { code, message, details } }`
 * answers to `PaymentHttpError`. Network failures surface as the original `TypeError`, which the
 * hook treats as retryable with the same attempt.
 */
export function createFetchTransport(url: string, options: FetchTransportOptions = {}): PaymentTransport {
  const doFetch = (u: string, init: RequestInit) => (options.fetch ?? globalThis.fetch.bind(globalThis))(u, init)
  async function call(u: string, init: RequestInit): Promise<PaymentAttemptResult> {
    const res = await doFetch(u, { credentials: options.credentials ?? 'same-origin', ...init })
    const body = (await parse(res)) as { error?: { code?: string; message?: string; details?: unknown; retryable?: boolean; kind?: PaymentErrorClassKind } } | PaymentAttemptResult | null
    if (!res.ok) {
      const e = (body as { error?: { code?: string; message?: string; details?: unknown; retryable?: boolean; kind?: PaymentErrorClassKind } } | null)?.error
      throw new PaymentHttpError(res.status, e?.code ?? 'server_error', e?.message, e?.details, {
        retryable: typeof e?.retryable === 'boolean' ? e.retryable : undefined,
        kind: typeof e?.kind === 'string' ? e.kind : undefined,
      })
    }
    const result = body as PaymentAttemptResult | null
    if (!result || typeof result !== 'object' || !result.payment || typeof result.payment.status !== 'string') {
      throw new PaymentHttpError(502, 'invalid_response', 'Unexpected payment response')
    }
    return result
  }
  return {
    submit: (request, { signal }) =>
      call(url, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': request.idempotencyKey, ...options.headers },
        body: JSON.stringify(options.buildBody ? options.buildBody(request) : request),
      }),
    ...(options.refreshUrl
      ? {
          refresh: ({ signal }: { signal: AbortSignal }) =>
            call(options.refreshUrl!, { method: 'POST', signal, headers: { Accept: 'application/json', ...options.headers } }),
        }
      : {}),
  }
}
