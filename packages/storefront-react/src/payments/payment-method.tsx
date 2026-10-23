import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode, type RefObject } from 'react'
import { formatMoney, type Money, type PaymentOptionKey } from '@asteby/storefront'
import { useResolvedLocale } from '../locale.js'
import { createFetchTransport, type PaymentTransport } from './adapter.js'
import type { PayChoice, PayChoices } from './choices.js'
import { paymentMethodMessages, type PaymentMethodMessages } from './payment-method.messages.js'
import { PaymentBrick, type PaymentBrickHandle, type PaymentBrickProps } from './payment-brick.js'
import type { PaymentEvent } from './use-embedded-payment.js'
import type { PaymentOutcome } from '@asteby/storefront'
import { BrandMark } from '../checkout/brand-mark.js'
import { findBrand } from '../checkout/brands.js'

/** Name of the radio group that carries the chosen row (`method` or `method|option`). */
export const PAYMENT_CHOICE_FIELD = 'payment_choice'
/** Name of the radio group that carries the chosen cash point. */
export const CASH_POINT_FIELD = 'cash_point'

/** Fields of the page form (contact, delivery, address, method) for the JSON POST of the embedded payment. */
export function formFields(form: HTMLFormElement | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!form) return out
  for (const [k, v] of new FormData(form).entries()) if (typeof v === 'string') out[k] = v
  return out
}

export type PaymentMethodClassNames = Partial<
  Record<
    'root' | 'legend' | 'choice' | 'radioLabel' | 'radio' | 'labelText' | 'hint' | 'icon' | 'brands' | 'panel' | 'cashPoint' | 'cashPointInput' | 'cashMore' | 'note' | 'alert' | 'status' | 'brickWrap' | 'brick' | 'submit' | 'rebuild',
    string
  >
>

export type PaymentMethodTestIds = Partial<
  Record<'method' | 'submit' | 'cash' | 'redirectNote' | 'card' | 'syncing' | 'syncFailed' | 'rebuild' | 'noPayment', string>
>

export type PaymentMethodSectionProps = {
  /** From `buildPayChoices(payment.methods)`. */
  choices: PayChoices
  /** The server total (`cart.cost.total`). Shown on the button and passed to the card form. Never computed here. */
  amount: Money
  /** Cart (or checkout) id: scopes the stored attempt id so a reload reuses it. */
  scope?: string
  /** The page `<form>`: its fields travel with the card payment and it is validated before charging. */
  formRef: RefObject<HTMLFormElement | null>
  /** POST endpoint that charges the card (`handlers.pay` on the server). */
  payUrl: string
  /** POST endpoint that re-reads the payment (`handlers.status`). Enables the 3DS / review polling. */
  statusUrl?: string
  /** Row preselected. Default: `choices.defaultValue`. */
  defaultChoice?: string | null
  /** Value of the delivery group; the card form waits until it is `deliveryReady` and `syncDelivery` has settled. */
  delivery?: string
  /** `false` while the buyer has not chosen a delivery that fixes the total (e.g. address pending). Default true. */
  deliveryReady?: boolean
  /**
   * Saves the chosen delivery on the server cart so the server total includes it. Resolve `true` once the new total
   * has been read back (the `amount` prop is then up to date). Called once per delivery, whatever the payment row (so
   * the total on the button and in the shop's summary always holds the chosen delivery). Without it nothing waits.
   *
   * Resolve `'requote'` when the server refused the rate because the quote expired or changed and the shop is loading
   * fresh rates: the section then says so (`quoteChanged`, a status, not an error), keeps the card in the page and
   * tries again with the next delivery value. `false` is a real failure (the card degrades to the redirect).
   */
  syncDelivery?: (delivery: string) => Promise<boolean | 'requote'>
  /** A two-step checkout still collecting the address: the button reads "continue" and no card form shows. */
  addressFirst?: boolean
  /** The address must be saved again before paying. */
  retryAddress?: boolean
  /** Disables the button (the shop is not ready to take payment). */
  blocked?: boolean
  /** The page form is submitting. */
  busy?: boolean
  /** Names of fields with a server error (`payment_method`, `cash_point`). */
  invalid?: ReadonlySet<string>
  nonce?: string
  locale?: string
  messages?: Parameters<typeof paymentMethodMessages>[1]
  /** Name for a plain method (`PaymentMethod` without options). Default: the key as it comes. */
  methodLabel?: (methodKey: string) => { label: string; hint?: string }
  /** Per-row icon by option (`card`, `cash`, `wallet`, `credits`) or `plain`. Replaces the default marks of that row. */
  icons?: Partial<Record<PaymentOptionKey | 'plain', ReactNode>>
  /**
   * Brand marks (`BrandMark`): the provider's mark on its account / no-card rows and on a plain method, the cash point
   * marks on the cash row and next to each point, and `cardBrands` on the card row. Default true; `false` keeps the
   * rows text-only.
   */
  brandMarks?: boolean
  /** Card networks drawn on the card row (`visa`, `mastercard`, `amex`, `carnet`…), as the shop's provider accepts them. */
  cardBrands?: readonly string[]
  /** How to print the total on the button. Default `formatMoney`. */
  renderAmount?: (amount: Money) => ReactNode
  /** Anchor to the cart for the "rebuild" action when the cart expired. Default: plain `<a href>`. */
  rebuildHref?: string
  renderLink?: (props: { href: string; className?: string; children: ReactNode; testId?: string }) => ReactNode
  /** Called once the order is closed in the page (approved, under review or voucher). Navigate to the thank-you page. */
  onDone: (outcome: PaymentOutcome) => void
  /** The server total changed under the buyer: re-read the cart (the card form remounts with the new amount). */
  onAmountChanged?: () => void
  onEvent?: (event: PaymentEvent) => void
  classNames?: PaymentMethodClassNames
  testIds?: PaymentMethodTestIds
  /** Hide the section button (drive the form some other way). Card payments then need `PaymentMethodHandle`-less flows. */
  hideSubmit?: boolean
  /** Replaces the transport built from `payUrl` / `statusUrl`. */
  transport?: PaymentTransport
  /** Extra props for the card form (`adapter`, `adapters`, `messages`, `minHeight`, `storage`, timeouts...). */
  brickProps?: Partial<Omit<PaymentBrickProps, 'client' | 'amount' | 'transport' | 'onResult' | 'onEvent' | 'onFallback'>>
}

const useHydrated = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

/**
 * "Payment method", hybrid. Card: the provider's secure form INSIDE the page (`PaymentBrick`) with the shop's own
 * button. Cash: payment points and a voucher on order. Provider account and no-card payments redirect. Without
 * JavaScript, or if the card form does not load, everything falls back to the plain redirect flow (the page form's
 * normal submit); the cash point radios and the notes work without JavaScript with the `payments.css` sheet.
 *
 * Money: the form amount is the server total passed in `amount` (already holding the chosen delivery); nothing is added
 * or recalculated here.
 *
 * Accessibility: one labelled `fieldset` with native radios; notes in `role="status"`, problems in `role="alert"`; the
 * button explains its busy state and is never silently disabled while the card form is loading.
 */
export function PaymentMethodSection(props: PaymentMethodSectionProps) {
  const {
    choices,
    amount,
    scope,
    formRef,
    payUrl,
    statusUrl,
    delivery = '',
    deliveryReady = true,
    syncDelivery,
    addressFirst = false,
    retryAddress = false,
    blocked = false,
    busy = false,
    invalid,
    nonce,
    methodLabel,
    icons,
    brandMarks = true,
    cardBrands = [],
    renderAmount,
    rebuildHref,
    renderLink,
    onDone,
    onAmountChanged,
    onEvent,
    classNames: cx = {},
    testIds = {},
    hideSubmit,
    brickProps,
  } = props
  const locale = useResolvedLocale(props.locale)
  const m = useMemo(() => paymentMethodMessages(locale, props.messages), [locale, props.messages])
  const hydrated = useHydrated()
  const [choiceValue, setChoiceValue] = useState(props.defaultChoice ?? choices.defaultValue)
  const selected = choices.choices.find((c) => c.value === choiceValue) ?? null
  const noPayment = choices.choices.length === 0
  const tid = (k: keyof PaymentMethodTestIds) => (testIds[k] ? { 'data-testid': testIds[k] } : {})

  const [fallback, setFallback] = useState(false)
  const [ready, setReady] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [expired, setExpired] = useState(false)
  const brick = useRef<PaymentBrickHandle>(null)

  const cardChosen = selected?.mode === 'card' && !retryAddress && !addressFirst
  const cardActive = hydrated && cardChosen && !fallback

  // The server total must hold the chosen delivery before the card form mounts, and before any total is printed on the
  // button: the shop saves it on the cart and re-reads the cart. Once per delivery, for every payment row (cash and
  // redirect included, otherwise the button and the summary show the cart without shipping).
  const wantSync = hydrated && selected !== null && !addressFirst && !retryAddress && deliveryReady && Boolean(syncDelivery)
  const [sync, setSync] = useState<{ key: string; ok: boolean; requote?: boolean } | null>(null)
  const syncRef = useRef(syncDelivery)
  syncRef.current = syncDelivery
  useEffect(() => {
    if (!wantSync || !syncRef.current) return
    if (sync?.key === delivery && sync.ok) return
    let cancelled = false
    syncRef.current(delivery).then(
      (ok) => !cancelled && setSync(ok === 'requote' ? { key: delivery, ok: false, requote: true } : { key: delivery, ok }),
      () => !cancelled && setSync({ key: delivery, ok: false }),
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantSync, delivery])
  const settled = sync?.key === delivery
  const synced = !syncDelivery || (settled && sync!.ok)
  const requote = wantSync && settled && sync!.requote === true
  const syncFailed = wantSync && settled && !sync!.ok && !requote
  const brickReady = cardActive && deliveryReady && synced && !syncFailed

  const transport = useMemo(
    () =>
      props.transport ??
      createFetchTransport(payUrl, {
        ...(statusUrl ? { refreshUrl: statusUrl } : {}),
        buildBody: (request) => ({ ...request, fields: formFields(formRef.current) }),
      }),
    [props.transport, payUrl, statusUrl, formRef],
  )

  const handleEvent = (e: PaymentEvent) => {
    if (e.type === 'form_ready') setReady(true)
    if (e.type === 'submit') setProcessing(true)
    if (e.type === 'tokenize_error' || e.type === 'retry') setProcessing(e.type === 'retry')
    if (e.type === 'result' && e.status === 'rejected') setProcessing(false)
    if (e.type === 'error') {
      setProcessing(false)
      if (e.kind === 'price_mismatch') onAmountChanged?.()
      if (e.kind === 'expired') setExpired(true)
    }
    onEvent?.(e)
  }

  // While the delivery is being saved the amount is stale: the button reads without it.
  const total = wantSync && (!settled || requote) ? null : renderAmount ? renderAmount(amount) : formatMoney(amount, locale)
  const label: ReactNode = retryAddress ? (
    m.retryAddress
  ) : addressFirst ? (
    m.continue
  ) : selected?.mode === 'plain' || !selected ? (
    <>
      {m.pay}
      {total ? <> {total}</> : null}
    </>
  ) : selected.mode === 'redirect' || (selected.mode === 'card' && (fallback || syncFailed)) ? (
    m.payRedirect
  ) : (
    <>
      {m.placeOrder}
      {total ? <> {total}</> : null}
    </>
  )

  function onPayClick(event: MouseEvent<HTMLButtonElement>) {
    // Redirect, cash, plain method, or a card without a usable form: the page form's normal submit.
    if (!cardActive || syncFailed) return
    event.preventDefault()
    const form = formRef.current
    if (form && !form.reportValidity()) return // required fields: the browser explains which is missing
    if (brickReady) void brick.current?.submit()
  }

  const cardNotice = (k: 'syncing' | 'syncFailed' | 'pickDelivery' | 'requote', node: ReactNode) =>
    k === 'syncFailed' ? (
      <p role="alert" className={cx.alert} data-sf-pay-notice="sync-failed" {...tid('syncFailed')}>
        {node}
      </p>
    ) : (
      <p role="status" className={cx.status} data-sf-pay-notice={k} {...(k === 'syncing' ? tid('syncing') : {})}>
        {node}
      </p>
    )

  const Link = renderLink ?? (({ href, className, children, testId }) => (
    <a href={href} className={className} {...(testId ? { 'data-testid': testId } : {})}>
      {children}
    </a>
  ))

  return (
    <fieldset id="pago" className={cx.root} data-sf-pay-method>
      <legend className={cx.legend}>{m.legend}</legend>
      {choices.choices.map((choice) => {
        const { label: rowLabel, hint } = rowText(choice, m, methodLabel)
        const checked = choice.value === choiceValue
        const slot = choice.option ?? 'plain'
        const icon = icons?.[slot] ?? (brandMarks ? defaultIcon(choice) : null)
        const marks = brandMarks ? rowMarks(choice, cardBrands) : []
        return (
          <div key={choice.value} className={cx.choice} data-sf-pay-choice>
            <label className={cx.radioLabel}>
              <input
                type="radio"
                name={PAYMENT_CHOICE_FIELD}
                value={choice.value}
                checked={checked}
                onChange={() => setChoiceValue(choice.value)}
                aria-invalid={invalid?.has('payment_method') || undefined}
                data-mode={choice.mode}
                required
                className={cx.radio}
                {...tid('method')}
              />
              {icon ? (
                <span className={cx.icon} aria-hidden="true">
                  {icon}
                </span>
              ) : null}
              <span className={cx.labelText}>
                {rowLabel}
                {hint ? <span className={cx.hint}> {hint}</span> : null}
              </span>
              {marks.length ? (
                <span className={cx.brands} data-sf-pay-brands aria-hidden="true">
                  {marks.map((mk) => (
                    <BrandMark key={mk.key} brand={mk.key} logoUrl={mk.logoUrl ?? null} size={20} />
                  ))}
                </span>
              ) : null}
            </label>
            {/* Always in the HTML and visible only with its radio checked (payments.css :has): without JavaScript the cash point is also chosen. */}
            <ChoicePanel choice={choice} m={m} invalid={invalid} cx={cx} tid={tid} hidden={hydrated && !checked} marks={brandMarks} />
          </div>
        )
      })}

      {noPayment ? (
        <div role="alert" className={cx.alert} data-sf-pay-notice="no-payment" {...tid('noPayment')}>
          <p>
            <strong>{m.noPaymentTitle}</strong>
          </p>
          <p>{m.noPayment}</p>
        </div>
      ) : null}

      {cardChosen && hydrated && choices.cardClient ? (
        <div className={cx.brickWrap} data-sf-pay-card {...tid('card')}>
          {fallback
            ? null
            : !deliveryReady
              ? cardNotice('pickDelivery', m.pickDeliveryFirst)
              : syncFailed
                ? cardNotice('syncFailed', m.syncFailed)
                : requote
                  ? cardNotice('requote', m.quoteChanged)
                  : !synced
                  ? cardNotice('syncing', m.updatingTotal)
                  : null}
          {brickReady || fallback ? (
            <PaymentBrick
              {...brickProps}
              ref={brick}
              client={choices.cardClient}
              amount={amount}
              transport={transport}
              {...(nonce ? { nonce } : {})}
              locale={locale}
              {...(scope ? { scope } : {})}
              enabled={brickReady}
              {...(cx.brick ? { className: cx.brick } : {})}
              onEvent={handleEvent}
              onFallback={() => setFallback(true)}
              onResult={(o) => {
                // Approved, under review or voucher: the order is already closed and the receipt is in the cookie.
                if (o.kind === 'approved' || o.kind === 'in_review' || o.kind === 'voucher') onDone(o)
              }}
            />
          ) : null}
          <p className={cx.note}>{m.secureCard}</p>
          {expired && rebuildHref ? Link({ href: rebuildHref, ...(cx.rebuild ? { className: cx.rebuild } : {}), children: m.rebuildCart, ...(testIds.rebuild ? { testId: testIds.rebuild } : {}) }) : null}
        </div>
      ) : null}

      {noPayment || choices.choices.some((c) => c.option) ? null : <p className={cx.note}>{m.paymentNote}</p>}

      {hideSubmit ? null : (
        <button
          type="submit"
          onClick={onPayClick}
          className={cx.submit}
          disabled={busy || blocked}
          aria-disabled={blocked || (brickReady && (!ready || processing)) || undefined}
          aria-busy={processing || undefined}
          data-sf-pay-method-submit
          {...tid('submit')}
        >
          {busy || processing ? m.processing : label}
        </button>
      )}
    </fieldset>
  )
}

function rowText(choice: PayChoice, m: PaymentMethodMessages, methodLabel: PaymentMethodSectionProps['methodLabel']): { label: string; hint?: string } {
  if (choice.mode === 'plain') return methodLabel ? methodLabel(choice.methodKey) : { label: choice.methodKey }
  return { label: choice.label ?? (choice.option ? m.options[choice.option] : undefined) ?? choice.option ?? choice.methodKey }
}

function ChoicePanel({
  choice,
  m,
  invalid,
  cx,
  tid,
  hidden,
  marks = true,
}: {
  choice: PayChoice
  m: PaymentMethodMessages
  invalid: ReadonlySet<string> | undefined
  cx: PaymentMethodClassNames
  tid: (k: keyof PaymentMethodTestIds) => { 'data-testid'?: string }
  hidden: boolean
  marks?: boolean
}) {
  if (choice.mode === 'redirect') {
    return (
      <p className={cx.panel} hidden={hidden} data-sf-pay-panel="redirect" {...tid('redirectNote')}>
        {m.redirectNote}
      </p>
    )
  }
  if (choice.mode !== 'cash') return null
  const main = choice.points.filter((p) => p.group === 'main')
  const more = choice.points.filter((p) => p.group !== 'main')
  const row = (p: PayChoice['points'][number], i: number, first: boolean) => (
    <label key={p.id} className={cx.cashPoint} data-sf-pay-point>
      <input type="radio" name={CASH_POINT_FIELD} value={p.id} defaultChecked={first && i === 0} className={cx.cashPointInput} aria-invalid={invalid?.has('cash_point') || undefined} />
      {marks ? <BrandMark brand={p.payment_point || p.id} logoUrl={p.logo_url ?? null} size={22} /> : null}
      <span>{p.label}</span>
    </label>
  )
  return (
    <div className={cx.panel} hidden={hidden} data-sf-pay-panel="cash" {...tid('cash')}>
      <fieldset>
        <legend>{m.cashPoints}</legend>
        <div data-sf-pay-points>{main.map((p, i) => row(p, i, true))}</div>
        {more.length ? (
          <details>
            <summary className={cx.cashMore} style={{ minHeight: 44 }}>
              {m.cashMore}
            </summary>
            <div data-sf-pay-points>{more.map((p, i) => row(p, i, false))}</div>
          </details>
        ) : null}
      </fieldset>
      <p className={cx.note}>{m.cashNote}</p>
    </div>
  )
}

const glyph = (d: string) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false" data-sf-pay-glyph>
    <path d={d} />
  </svg>
)
const CARD_GLYPH = 'M3 6.5h18v11H3zM3 10h18M6.5 14.5h4'
const CASH_GLYPH = 'M3 7h18v10H3zM12 14.5a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5zM6 10v4M18 10v4'

/** Leading icon of a row: the provider's mark on its own account / no-card rows; a neutral glyph for card and cash. */
function defaultIcon(choice: PayChoice): ReactNode {
  if (choice.mode === 'card') return glyph(CARD_GLYPH)
  if (choice.mode === 'cash') return glyph(CASH_GLYPH)
  return findBrand(choice.methodKey) ? <BrandMark brand={choice.methodKey} size={20} /> : null
}

/** Trailing marks of a row: card networks on the card row, the first cash points on the cash row. */
function rowMarks(choice: PayChoice, cardBrands: readonly string[]): Array<{ key: string; logoUrl?: string | null }> {
  if (choice.mode === 'card') return cardBrands.map((key) => ({ key }))
  if (choice.mode === 'cash') {
    const seen = new Set<string>()
    const out: Array<{ key: string; logoUrl?: string | null }> = []
    for (const p of choice.points) {
      const key = p.payment_point || p.id
      if (p.group !== 'main' || seen.has(key)) continue
      seen.add(key)
      out.push({ key, logoUrl: p.logo_url ?? null })
      if (out.length === 4) break
    }
    return out
  }
  return []
}
