import type { Money, PaymentAction } from '@asteby/storefront'
import { PaymentMountCancelled } from './mount-queue.js'
import { loadPaymentSdk } from './sdk-loader.js'
import type { MountedPaymentForm, PaymentFormAdapter, PaymentFormData, PaymentFormMountOptions } from './adapter.js'

/** The `PaymentClient.kind` the addon `stripe` declares for the Payment Element. */
export const STRIPE_ELEMENTS_KIND = 'stripe_elements'

/** `PaymentAction.challenge.kind` of a PaymentIntent that needs the buyer (3DS): handled by `stripe.handleNextAction`. */
export const STRIPE_NEXT_ACTION = 'stripe_next_action'

// Minimal structural types of the parts of Stripe.js this adapter uses (no dependency on `@stripe/stripe-js`).
type StripeError = { type?: string; code?: string; decline_code?: string; message?: string }
type StripeElement = {
  mount(target: HTMLElement | string): void
  on(event: string, handler: (event?: { error?: StripeError }) => void): unknown
  destroy(): void
}
type StripeElements = {
  create(type: 'payment', options?: Record<string, unknown>): StripeElement
  update(options: Record<string, unknown>): void | Promise<void>
  submit(): Promise<{ error?: StripeError }>
}
type StripeInstance = {
  elements(options: Record<string, unknown>): StripeElements
  createConfirmationToken(options: { elements: StripeElements; params?: Record<string, unknown> }): Promise<{ confirmationToken?: { id?: unknown }; error?: StripeError }>
  handleNextAction(options: { clientSecret: string }): Promise<{ paymentIntent?: { status?: string }; error?: StripeError }>
}
export type StripeFactory = (publishableKey: string, options?: { locale?: string }) => StripeInstance

export type StripeAdapterOptions = {
  /** Exact origins allowed for `sdk_url`. Default: Stripe.js only (`https://js.stripe.com`). */
  allowedSdkOrigins?: readonly string[]
  /** Resolves the `Stripe` factory. Default: `window.Stripe`. Inject a fake in tests. */
  getSdk?: () => StripeFactory | undefined
  /** Document the script goes into (tests). Default: the global one. */
  document?: Document
}

/**
 * Currency exponents that differ from 2, as Stripe expects them in `amount` (smallest unit).
 * Zero-decimal: https://docs.stripe.com/currencies#zero-decimal. ISK and UGX are zero-decimal for people but Stripe takes
 * them as two-decimal (multiples of 100), so they keep the default 2.
 */
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])
const THREE_DECIMAL = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND'])

export function stripeCurrencyExponent(currency: string): number {
  const c = currency.toUpperCase()
  if (ZERO_DECIMAL.has(c)) return 0
  if (THREE_DECIMAL.has(c)) return 3
  return 2
}

/**
 * `Money` (decimal string from the server) -> integer in the currency's smallest unit, with string arithmetic only (no
 * floats). Never rounds: extra decimals must be zeros (`"10.500"` MXN -> 1050; `"10.505"` MXN throws). Throws for
 * anything that is not a positive, safe integer amount. The amount is the server's: this only re-expresses it.
 */
export function moneyToMinorUnits(money: Money): number {
  const currency = typeof money?.currency_code === 'string' ? money.currency_code.trim() : ''
  if (!/^[A-Za-z]{3}$/.test(currency)) throw new Error('payment form: invalid currency')
  const text = typeof money.amount === 'string' ? money.amount.trim() : ''
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text)
  if (!m) throw new Error('payment form: invalid amount')
  const exp = stripeCurrencyExponent(currency)
  const whole = m[1]!
  const frac = m[2] ?? ''
  if (frac.length > exp && /[^0]/.test(frac.slice(exp))) throw new Error('payment form: amount has more decimals than the currency')
  const digits = (whole + frac.slice(0, exp).padEnd(exp, '0')).replace(/^0+(?=\d)/, '')
  // 15 digits keeps it far below Number.MAX_SAFE_INTEGER (and far above any real charge).
  if (digits.length > 15) throw new Error('payment form: amount too large')
  const minor = Number(digits)
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error('payment form: invalid amount')
  return minor
}

/** Stripe.js locales are `es`, `en`, `es-419`, `pt-BR`...: Latin-American Spanish maps to `es-419`; otherwise the language. */
function stripeLocale(locale: string | undefined): string {
  if (!locale) return 'auto'
  const [lang, region] = locale.replace('_', '-').split('-')
  const l = (lang ?? '').toLowerCase()
  if (!/^[a-z]{2}$/.test(l)) return 'auto'
  if (l === 'es' && region && region.toUpperCase() !== 'ES') return 'es-419'
  if (l === 'pt' && region?.toUpperCase() === 'BR') return 'pt-BR'
  return l
}

/** Shop tokens (`readPaymentTheme` keys) -> Stripe Appearance API variables. Values were already checked as safe CSS. */
const APPEARANCE_VARS: Record<string, string> = {
  baseColor: 'colorPrimary',
  formBackgroundColor: 'colorBackground',
  textPrimaryColor: 'colorText',
  textSecondaryColor: 'colorTextSecondary',
  errorColor: 'colorDanger',
  successColor: 'colorSuccess',
  borderRadiusMedium: 'borderRadius',
}

export function stripeAppearance(theme: Record<string, string> | undefined, colorScheme: 'light' | 'dark' | undefined): Record<string, unknown> {
  const variables: Record<string, string> = {}
  for (const [from, to] of Object.entries(APPEARANCE_VARS)) {
    const v = theme?.[from]
    if (typeof v === 'string' && v) variables[to] = v
  }
  // The input background wins over the form background when the shop sets both (Stripe has one background variable).
  if (typeof theme?.inputBackgroundColor === 'string' && theme.inputBackgroundColor) variables.colorBackground = theme.inputBackgroundColor
  return { theme: colorScheme === 'dark' ? 'night' : 'stripe', ...(Object.keys(variables).length ? { variables } : {}) }
}

/** Only a publishable key may reach the browser. A secret / restricted key, or a key of the wrong mode, is refused. */
function checkPublishableKey(key: unknown, testMode: boolean | undefined): string {
  if (typeof key !== 'string' || !/^pk_(test|live)_[A-Za-z0-9_]+$/.test(key)) throw new Error('payment form: invalid publishable key')
  if (testMode === true && !key.startsWith('pk_test_')) throw new Error('payment form: key mode mismatch')
  if (testMode === false && !key.startsWith('pk_live_')) throw new Error('payment form: key mode mismatch')
  return key
}

const CTOKEN = /^ctoken_[A-Za-z0-9_]+$/
const CLIENT_SECRET = /^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/

/** Short, non-sensitive description of a Stripe error for logs (type / code only; never the message, never card data). */
function errText(prefix: string, e: StripeError | undefined): string {
  const safe = (v: unknown) => (typeof v === 'string' && /^[a-z0-9_]{1,64}$/.test(v) ? v : undefined)
  const parts = [safe(e?.type), safe(e?.code), safe(e?.decline_code)].filter(Boolean)
  return parts.length ? `${prefix}: ${parts.join('/')}` : prefix
}

/**
 * Stripe Payment Element adapter (deferred intent, ConfirmationToken flow).
 *
 * - The form is created with the SERVER total (`amount`, in minor units) only so Stripe can show the right methods and
 *   3DS hints; no PaymentIntent exists yet and nothing is charged in the browser.
 * - `collect()` runs `elements.submit()` (field validation) and `stripe.createConfirmationToken({ elements })`. The ONLY
 *   thing that leaves the browser is `provider_data.confirmation_token` (`ctoken_…`). The shop server creates and confirms
 *   the PaymentIntent with the amount OPS stored. `confirmPayment` is never called.
 * - `handleAction` runs `stripe.handleNextAction({ clientSecret })` for a `stripe_next_action` challenge (3DS in Stripe's
 *   own modal). Its result is NOT proof of payment: the hook reads the payment state from the server afterwards.
 */
export function stripeElementsAdapter(options: StripeAdapterOptions = {}): PaymentFormAdapter {
  const allowed = options.allowedSdkOrigins ?? ['https://js.stripe.com']
  const getSdk = options.getSdk ?? (() => (typeof window !== 'undefined' ? (window as unknown as { Stripe?: StripeFactory }).Stripe : undefined))

  return {
    kind: STRIPE_ELEMENTS_KIND,
    async load(client, { nonce, timeoutMs }) {
      // No SRI on purpose: Stripe.js is versionless and must be loaded from js.stripe.com as is.
      await loadPaymentSdk(client.sdk_url, {
        ...(nonce ? { nonce } : {}),
        timeoutMs,
        allowedOrigins: allowed,
        isLoaded: () => typeof getSdk() === 'function',
        ...(options.document ? { document: options.document } : {}),
      })
      if (typeof getSdk() !== 'function') throw new Error('payment sdk: Stripe global missing after load')
    },

    async mount(opts: PaymentFormMountOptions): Promise<MountedPaymentForm> {
      const factory = getSdk()
      if (typeof factory !== 'function') throw new Error('payment sdk: not loaded')
      if (opts.signal?.aborted) throw new PaymentMountCancelled()
      const { client, container } = opts
      const pk = checkPublishableKey(client.public_key, client.test_mode)
      const minor = moneyToMinorUnits(opts.amount)
      const currency = opts.amount.currency_code.trim().toLowerCase()

      const stripe = factory(pk, { locale: stripeLocale(opts.locale ?? client.locale) })
      const elements = stripe.elements({
        mode: 'payment',
        amount: minor,
        currency,
        paymentMethodTypes: ['card'],
        appearance: stripeAppearance(opts.theme, opts.colorScheme),
      })
      const element = elements.create('payment', {
        layout: 'tabs',
        // No wallets / Link here: the server flow is card-only and the shop's own button submits.
        wallets: { applePay: 'never', googlePay: 'never' },
        ...(opts.email ? { defaultValues: { billingDetails: { email: opts.email } } } : {}),
      })

      let gone = false
      element.on('ready', () => {
        if (gone) return
        opts.onReady()
      })
      // `loaderror`: the iframe or its config failed to load (blocked by CSP / network). The form is unusable.
      element.on('loaderror', (e) => {
        if (gone) return
        opts.onError({ critical: true, message: errText('stripe loaderror', e?.error) })
      })

      const onAbort = () => destroy()
      const destroy = () => {
        if (gone) return
        gone = true
        opts.signal?.removeEventListener('abort', onAbort)
        try {
          element.destroy()
        } catch {
          /* already gone */
        }
      }
      // Asked to stop while creating: never leave a live form behind.
      if (opts.signal?.aborted) {
        destroy()
        throw new PaymentMountCancelled()
      }
      // The hook aborts when it no longer wants this form (replaced, failed, page left): tear it down even if nobody
      // calls `unmount` (e.g. the mount finished after the hook gave up on it).
      opts.signal?.addEventListener('abort', onAbort, { once: true })
      try {
        element.mount(container)
      } catch (err) {
        destroy()
        throw err instanceof Error ? err : new Error('payment form: mount failed')
      }

      let mountedCurrency = currency
      return {
        async collect(): Promise<PaymentFormData> {
          if (gone) throw new Error('payment form is unmounted')
          // Validates the fields inside Stripe's iframes; Stripe shows the field errors itself.
          const submitted = await elements.submit()
          if (submitted?.error) throw new Error(errText('payment form incomplete', submitted.error))
          if (gone) throw new Error('payment form is unmounted')
          const res = await stripe.createConfirmationToken({ elements })
          if (res?.error) throw new Error(errText('payment form: tokenization failed', res.error))
          const id = res?.confirmationToken?.id
          if (typeof id !== 'string' || id.length > 255 || !CTOKEN.test(id)) throw new Error('payment form: invalid confirmation token')
          // Only the token travels: no amount, no card data, no device id (Stripe Radar collects its own signals).
          return { provider_data: { confirmation_token: id } }
        },
        async update(next) {
          if (gone) throw new Error('payment form is unmounted')
          const nextCurrency = next.amount.currency_code.trim().toLowerCase()
          // A different currency means a different form (methods, limits): let the hook remount it.
          if (nextCurrency !== mountedCurrency) throw new Error('payment form: currency changed')
          const amount = moneyToMinorUnits(next.amount)
          await elements.update({ amount })
          mountedCurrency = nextCurrency
        },
        async handleAction(action: PaymentAction) {
          if (gone) throw new Error('payment form is unmounted')
          const challenge = action?.challenge
          if (action?.type !== 'challenge' || challenge?.kind !== STRIPE_NEXT_ACTION) throw new Error('payment form: unsupported action')
          const clientSecret = challenge.client_secret
          if (typeof clientSecret !== 'string' || !CLIENT_SECRET.test(clientSecret)) throw new Error('payment form: invalid action')
          const res = await stripe.handleNextAction({ clientSecret })
          if (res?.error) throw new Error(errText('payment action failed', res.error))
        },
        unmount() {
          destroy()
        },
      }
    },
  }
}
