import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react'
import {
  availabilityMessages,
  availabilityView,
  cartLineProblemView,
  formatAvailabilityMessage,
  isStorefrontError,
  resolveAvailability,
  type Availability,
  type AvailabilityMessages,
  type AvailabilityView,
  type Cart,
  type CartLine,
  type CartLineProblem as CartLineProblemData,
  type InsufficientStockLine,
  type ResolveAvailabilityOptions,
  type StorefrontClient,
} from '@asteby/storefront'
import { useOptionalCart } from './cart.js'
import { useOptionalStorefront } from './context.js'

// Headless: no styles and no class names; state is exposed through `data-*`.
// The server decides the state; every text comes from `availabilityView` /
// `availabilityMessages` (es/en by key, overridable per key with `messages`).

const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/** Visually hidden text for screen readers. */
export function SrOnly({ children }: { children: ReactNode }) {
  return <span style={SR_ONLY}>{children}</span>
}

type AvailabilitySource = Parameters<typeof resolveAvailability>[0]

export type AvailabilityInput = {
  /** Availability sent by the server. */
  availability?: Availability | null
  /** Variant or product: used when `availability` is absent (polyfill for servers older than contract 1.1). */
  source?: AvailabilitySource | null
  /** Polyfill only: shop-level low-stock threshold (never hard-coded here). */
  lowStockThreshold?: number | null
  /** BCP 47; defaults to the provider locale, then `es-MX`. */
  locale?: string
  /** Per-key text overrides. */
  messages?: Partial<AvailabilityMessages>
}

function useLocale(locale: string | undefined): string {
  const sf = useOptionalStorefront()
  return locale ?? sf?.locale ?? 'es-MX'
}

function pickAvailability({ availability, source, lowStockThreshold }: AvailabilityInput): Availability | null {
  const opts: ResolveAvailabilityOptions = { lowStockThreshold: lowStockThreshold ?? null }
  if (availability) return availability
  return source ? resolveAvailability(source, opts) : null
}

/** `AvailabilityView` for a server `availability` or a variant/product (polyfilled). `null` when nothing is given. */
export function useAvailability(input: AvailabilityInput): AvailabilityView | null {
  const locale = useLocale(input.locale)
  const a = pickAvailability(input)
  return useMemo(
    () => (a ? availabilityView(a, locale, { messages: input.messages ?? null }) : null),
    // `a` is rebuilt from props each render; key by its content
    [JSON.stringify(a), locale, input.messages],
  )
}

// ---------------------------------------------------------------------------
// AvailabilityBadge
// ---------------------------------------------------------------------------

export type AvailabilityBadgeProps = AvailabilityInput & {
  /**
   * `card` (listing): renders `null` for plain `in_stock` so cards are not saturated.
   * `detail` (product page): always renders, with the ETA and the order cap.
   */
  placement?: 'card' | 'detail'
  /** Announce changes (e.g. after the client refreshes the stock): `role="status"`. */
  live?: boolean
} & Omit<ComponentPropsWithoutRef<'span'>, 'children'>

/**
 * Availability label. `data-availability` is the status and `data-tone` the tone, so a
 * card can dim its image with CSS (`[data-availability=out_of_stock]`).
 */
export function AvailabilityBadge({
  availability, source, lowStockThreshold, locale, messages, placement = 'detail', live, ...rest
}: AvailabilityBadgeProps) {
  const view = useAvailability({ availability, source, lowStockThreshold, locale, messages })
  const loc = useLocale(locale)
  if (!view) return null
  if (placement === 'card' && !view.showOnCard) return null
  const m = availabilityMessages(loc, messages)
  return (
    <span
      data-availability={view.status}
      data-tone={view.tone}
      data-placement={placement}
      {...(live ? { role: 'status' } : {})}
      {...rest}
    >
      <span aria-hidden={view.srText !== view.label ? true : undefined}>{view.label}</span>
      {view.srText !== view.label && <SrOnly>{view.srText}</SrOnly>}
      {placement === 'detail' && view.sublabel && <> <span data-availability-note="eta">{view.sublabel}</span></>}
      {placement === 'detail' && view.maxPerOrder !== null && view.status !== 'out_of_stock' && (
        <> <span data-availability-note="max">{formatAvailabilityMessage(m.max_per_order, { n: view.maxPerOrder })}</span></>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// VariantOptionState
// ---------------------------------------------------------------------------

export type VariantOptionStateProps = AvailabilityInput & {
  /** The option text (e.g. the flavor). */
  children: ReactNode
} & Omit<ComponentPropsWithoutRef<'span'>, 'children'>

/**
 * Content for one option of a flavor/variant selector. A sold-out option is struck through
 * (`<s>`) and announced as "agotado" to screen readers; it stays selectable so the buyer can
 * see it and subscribe. Backorder / preorder options get a visible tag. Plain in-stock: just the text.
 * Without any availability it renders `children` untouched.
 */
export function VariantOptionState({ children, availability, source, lowStockThreshold, locale, messages, ...rest }: VariantOptionStateProps) {
  const a = pickAvailability({ availability, source, lowStockThreshold })
  const loc = useLocale(locale)
  if (!a) return <span {...rest}>{children}</span>
  const m = availabilityMessages(loc, messages)
  const status = availabilityView(a, loc, { messages: messages ?? null }).status
  if (status === 'out_of_stock') {
    return (
      <span data-availability={status} {...rest}>
        <s>{children}</s>
        <SrOnly> ({m['option.sold_out']})</SrOnly>
      </span>
    )
  }
  if (status === 'backorder' || status === 'preorder') {
    return (
      <span data-availability={status} {...rest}>
        {children} <span data-availability-tag>({m[status === 'backorder' ? 'option.backorder' : 'option.preorder']})</span>
      </span>
    )
  }
  return (
    <span data-availability={status} {...rest}>
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// RestockNotifyForm ("Avísame cuando vuelva")
// ---------------------------------------------------------------------------

export type RestockNotifyFormProps = AvailabilityInput & {
  sku: string
  /** Market (country) of the buyer, if the shop has several. */
  market?: string
  /** Offer a phone / WhatsApp field next to the email. Default false (email only). */
  allowPhone?: boolean
  /**
   * Destination of the native POST. Without JavaScript the browser posts `sku`, `email`, `phone`, `locale`,
   * `market` and `consent` there, so the shop's own route can call `client.restock.subscribe`. Default: the current page.
   */
  action?: string
  /** Client override (defaults to the `StorefrontProvider` client). */
  client?: StorefrontClient
  /** With JavaScript the form submits through the SDK; set `false` to always post natively. */
  enhance?: boolean
  onSubscribed?: () => void
  onError?: (error: unknown) => void
} & Omit<ComponentPropsWithoutRef<'form'>, 'action' | 'method' | 'onSubmit' | 'children'>

/**
 * Subscription form. Renders `null` unless the server says `notify_available` and the state is
 * `out_of_stock`. Works without JavaScript (native POST); with it, submits via the SDK and shows
 * the result in place (`role="status"` / `role="alert"`).
 */
export function RestockNotifyForm({
  sku, market, allowPhone = false, action, client: clientProp, enhance = true, onSubscribed, onError,
  availability, source, lowStockThreshold, locale, messages, ...rest
}: RestockNotifyFormProps) {
  const sf = useOptionalStorefront()
  const view = useAvailability({ availability, source, lowStockThreshold, locale, messages })
  const loc = useLocale(locale)
  const id = useId()
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  if (!view?.showNotify) return null
  const m = availabilityMessages(loc, messages)
  const client = clientProp ?? sf?.client ?? null

  if (state === 'done') {
    return (
      <p role="status" data-restock="done">
        {m['notify.done']}
      </p>
    )
  }

  const submit = enhance && client
    ? (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        const email = String(form.get('email') ?? '').trim()
        const phone = String(form.get('phone') ?? '').trim()
        if (!email && !phone) {
          setState('error')
          return
        }
        setState('sending')
        client.restock
          .subscribe({ sku, locale: loc, consent: true, ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(market ? { market } : {}) })
          .then(() => {
            setState('done')
            onSubscribed?.()
          })
          .catch((err: unknown) => {
            setState('error')
            onError?.(err)
          })
      }
    : undefined

  return (
    <form method="post" {...(action !== undefined ? { action } : {})} {...rest} onSubmit={submit} data-restock={state}>
      <fieldset>
        <legend>{m['notify.title']}</legend>
        <input type="hidden" name="sku" value={sku} />
        <input type="hidden" name="locale" value={loc} />
        {market && <input type="hidden" name="market" value={market} />}
        <p>
          <label htmlFor={`${id}-email`}>{m['notify.email']}</label>{' '}
          <input id={`${id}-email`} name="email" type="email" autoComplete="email" required={!allowPhone} />
        </p>
        {allowPhone && (
          <p>
            <label htmlFor={`${id}-phone`}>{m['notify.phone']}</label>{' '}
            <input id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" />
          </p>
        )}
        <p>
          <input id={`${id}-consent`} name="consent" type="checkbox" value="true" required />{' '}
          <label htmlFor={`${id}-consent`}>{m['notify.consent']}</label>
        </p>
        <button type="submit" disabled={state === 'sending'} aria-busy={state === 'sending' || undefined}>
          {m['notify.submit']}
        </button>
        {state === 'error' && <p role="alert">{m['notify.error']}</p>}
      </fieldset>
    </form>
  )
}

// ---------------------------------------------------------------------------
// CartLineProblem
// ---------------------------------------------------------------------------

export type CartLineProblemProps = {
  /** The cart line; its `problem` is shown. Renders `null` when there is none. */
  line: Pick<CartLine, 'id' | 'quantity'> & { problem?: CartLineProblemData | null }
  locale?: string
  messages?: Partial<AvailabilityMessages>
  /** Defaults to `useCart().updateLines` when inside a `CartProvider`. */
  onAdjust?: (lineId: string, quantity: number) => void | Promise<unknown>
  /** Defaults to `useCart().removeLines` when inside a `CartProvider`. */
  onRemove?: (lineId: string) => void | Promise<unknown>
} & Omit<ComponentPropsWithoutRef<'div'>, 'children'>

/**
 * Problem of one cart line, shown as soon as the cart loads (before checkout): "Ya no hay existencias" or
 * "Solo puedes llevar N", with "Ajustar a N" (only when the server lets the number be seen) and "Quitar".
 */
export function CartLineProblem({ line, locale, messages, onAdjust, onRemove, ...rest }: CartLineProblemProps) {
  const cart = useOptionalCart()
  const loc = useLocale(locale)
  if (!line.problem) return null
  const view = cartLineProblemView(line.problem, loc, { messages: messages ?? null, lineQuantity: line.quantity })
  const adjust = onAdjust ?? (cart ? (id: string, q: number) => cart.updateLines([{ id, quantity: q }]) : undefined)
  const remove = onRemove ?? (cart ? (id: string) => cart.removeLines([id]) : undefined)
  return (
    <div data-cart-line-problem={view.code} {...rest}>
      <p>{view.message}</p>
      {view.adjustTo !== null && adjust && (
        <button type="button" onClick={() => void adjust(line.id, view.adjustTo!)}>
          {view.adjustLabel}
        </button>
      )}
      {remove && (
        <button type="button" onClick={() => void remove(line.id)}>
          {view.removeLabel}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// StockConflictAlert (recoverable 409 insufficient_stock)
// ---------------------------------------------------------------------------

export type StockConflictAlertProps = {
  /** Error to inspect. Defaults to `useCart().error`. Renders `null` unless it is a `409 insufficient_stock`. */
  error?: unknown
  /** Cart used to name the affected lines. Defaults to `useCart().cart`. */
  cart?: Cart | null
  locale?: string
  messages?: Partial<AvailabilityMessages>
  onAdjust?: (lineId: string, quantity: number) => void | Promise<unknown>
  onRemove?: (lineId: string) => void | Promise<unknown>
  onDismiss?: () => void
  /** Move focus to the alert when it appears (default true). */
  autoFocus?: boolean
} & Omit<ComponentPropsWithoutRef<'div'>, 'children' | 'role' | 'tabIndex'>

/**
 * Recoverable stock conflict. The cart and the form data are NOT touched: it shows our own text (never the raw
 * `error.message`), the affected lines with "Ajustar a N" / "Quitar", and takes focus (`role="alert"`) without
 * moving the page. Drop it above the checkout form: `<StockConflictAlert />` reads the error from the cart.
 */
export function StockConflictAlert({
  error: errorProp, cart: cartProp, locale, messages, onAdjust, onRemove, onDismiss, autoFocus = true, ...rest
}: StockConflictAlertProps) {
  const cartCtx = useOptionalCart()
  const loc = useLocale(locale)
  const ref = useRef<HTMLDivElement>(null)
  const error = errorProp !== undefined ? errorProp : (cartCtx?.error ?? null)
  const cart = cartProp !== undefined ? cartProp : (cartCtx?.cart ?? null)
  const active = isStorefrontError(error) && error.code === 'insufficient_stock'
  useEffect(() => {
    if (active && autoFocus) ref.current?.focus({ preventScroll: true })
  }, [active, error, autoFocus])
  if (!active) return null
  const m = availabilityMessages(loc, messages)
  const lines: InsufficientStockLine[] = error.stockLines
  const adjust = onAdjust ?? (cartCtx ? (id: string, q: number) => cartCtx.updateLines([{ id, quantity: q }]) : undefined)
  const remove = onRemove ?? (cartCtx ? (id: string) => cartCtx.removeLines([id]) : undefined)
  return (
    <div ref={ref} role="alert" tabIndex={-1} data-stock-conflict {...rest}>
      <p>
        <strong>{m['conflict.title']}</strong>
      </p>
      <p>{m['conflict.body']}</p>
      {lines.length > 0 && (
        <ul>
          {lines.map((l) => {
            const cartLine = cart?.lines.find((x) => (l.line_id ? x.id === l.line_id : x.merchandise.sku === l.sku))
            const lineId = l.line_id ?? cartLine?.id ?? null
            const view = cartLineProblemView(l, loc, { messages: messages ?? null, ...(cartLine ? { lineQuantity: cartLine.quantity } : {}) })
            return (
              <li key={`${l.sku}:${l.line_id ?? ''}`} data-cart-line-problem={view.code}>
                <span>{cartLine ? `${cartLine.merchandise.product.title}${cartLine.merchandise.title ? ` (${cartLine.merchandise.title})` : ''}` : l.sku}</span>
                {': '}
                <span>{view.message}</span>
                {lineId && view.adjustTo !== null && adjust && (
                  <>
                    {' '}
                    <button type="button" onClick={() => void adjust(lineId, view.adjustTo!)}>
                      {view.adjustLabel}
                    </button>
                  </>
                )}
                {lineId && remove && (
                  <>
                    {' '}
                    <button type="button" onClick={() => void remove(lineId)}>
                      {view.removeLabel}
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {onDismiss && (
        <button type="button" onClick={onDismiss}>
          {m['conflict.dismiss']}
        </button>
      )}
    </div>
  )
}
