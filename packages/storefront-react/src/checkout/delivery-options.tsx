import { useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { formatMoney, type Money, type PickupOption, type ShippingRate } from '@asteby/storefront'
import { useResolvedLocale } from '../locale.js'
import { BrandMark } from './brand-mark.js'
import {
  deliveryMessages,
  quoteDeadline,
  quoteNote,
  rateBadges,
  rateCarrier,
  rateEta,
  rateService,
  type DeliveryMessages,
  type RateBadge,
} from './delivery.js'

export type DeliveryOptionsClassNames = Partial<
  Record<
    | 'root'
    | 'option'
    | 'radio'
    | 'mark'
    | 'body'
    | 'title'
    | 'carrier'
    | 'service'
    | 'eta'
    | 'badges'
    | 'badge'
    | 'price'
    | 'free'
    | 'note'
    | 'partial'
    | 'skeleton',
    string
  >
>

export type DeliveryOptionsProps = {
  rates: readonly ShippingRate[]
  pickup?: readonly PickupOption[]
  /** Radio group name. Default `delivery_choice`. */
  name?: string
  /** Form value of a rate. Default `rate:<id>`. */
  rateValue?: (rate: ShippingRate) => string
  /** Form value of a pickup branch. Default `pickup:<branch_id>`. */
  pickupValue?: (branch: PickupOption) => string
  /** Uncontrolled preselection. Default: the first rate. `null`: nothing preselected. */
  defaultValue?: string | null
  /** Controlled value (use with `onValueChange`). */
  value?: string
  onValueChange?: (value: string) => void
  /** Some provider did not answer (`DeliveryOptions.partial`): one neutral note above the list. */
  partial?: boolean
  /** The previous quote expired or changed and these rates are fresh: one status note above the list. */
  requoted?: boolean
  /** Rates are being quoted again: skeleton rows (no rates yet) or the current rows dimmed, `aria-busy`. */
  loading?: boolean
  /** Quote deadline note: `always` (default), only when it is `soon`, or `never`. */
  quoteNote?: 'always' | 'soon' | 'never'
  /** Time zone of the note. Default: the buyer's browser. */
  timeZone?: string
  /** Show the carrier marks. Default true. */
  marks?: boolean
  /** Cheapest / fastest badges. Default true. */
  badges?: boolean
  required?: boolean
  locale?: string
  messages?: Partial<DeliveryMessages>
  renderAmount?: (amount: Money) => ReactNode
  classNames?: DeliveryOptionsClassNames
  /** `data-testid` of every radio. */
  testId?: string
  /** Rows the shop renders before the rates (e.g. "home delivery, rates after the address"). */
  children?: ReactNode
}

const SR_ONLY: CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }

const useHydrated = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

function PickupGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 32" width={Math.round(size * 1.5)} height={size} aria-hidden="true" focusable="false" style={{ flex: 'none' }} data-sf-brand-mark="pickup">
      <rect x="0.5" y="0.5" width="47" height="31" rx="5" fill="var(--sf-brand-mark-bg, #E7E9EE)" stroke="var(--sf-brand-mark-ring, rgb(127 127 127 / 0.35))" />
      <path d="M15 13.5 17 9h14l2 4.5M15 13.5h18M15 13.5V23h18v-9.5M21 23v-5h6v5" fill="none" stroke="var(--sf-brand-mark-fg, #2B2F38)" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The rates and pickup branches of "Delivery" as native radios: carrier mark and commercial name, readable service,
 * arrival time, cheapest / fastest badges, price as the server sends it, and ONE note for the quote deadline in the
 * buyer's time zone. Works without JavaScript (plain radios in the page form); the note appears after hydration in a
 * reserved line, so it never shifts the layout.
 *
 * Wrap it in the shop's own `<fieldset><legend>`. Style it with `classNames` and/or the default sheet
 * `@asteby/storefront-react/checkout.css`.
 */
export function DeliveryOptions(props: DeliveryOptionsProps) {
  const {
    rates,
    pickup = [],
    name = 'delivery_choice',
    rateValue = (r) => `rate:${r.id}`,
    pickupValue = (b) => `pickup:${b.branch_id}`,
    value,
    onValueChange,
    partial = false,
    requoted = false,
    loading = false,
    timeZone,
    marks = true,
    badges: showBadges = true,
    required = true,
    renderAmount,
    classNames: cx = {},
    testId,
    children,
  } = props
  const locale = useResolvedLocale(props.locale)
  const m = useMemo(() => deliveryMessages(locale, props.messages), [locale, props.messages])
  const hydrated = useHydrated()
  const badges = useMemo(() => (showBadges ? rateBadges(rates) : new Map<string, RateBadge[]>()), [rates, showBadges])
  const firstValue = rates[0] ? rateValue(rates[0]) : null
  const defaultValue = props.defaultValue === undefined ? firstValue : props.defaultValue
  const amount = (money: Money) => (Number(money.amount) === 0 ? <span className={cx.free} data-sf-delivery-free>{m.free}</span> : renderAmount ? renderAmount(money) : formatMoney(money, locale))
  const mode = props.quoteNote ?? 'always'
  const deadline = mode === 'never' ? null : quoteDeadline(rates)
  const note = hydrated && deadline ? quoteNote(deadline, { locale, messages: m, ...(timeZone ? { timeZone } : {}) }) : null
  const shownNote = note && (mode === 'always' || note.soon) ? note : null

  const radio = (v: string) => (
    <input
      type="radio"
      name={name}
      value={v}
      required={required}
      className={cx.radio}
      {...(value !== undefined ? { checked: value === v, onChange: () => onValueChange?.(v) } : { defaultChecked: v === defaultValue, ...(onValueChange ? { onChange: () => onValueChange(v) } : {}) })}
      {...(testId ? { 'data-testid': testId } : {})}
    />
  )

  return (
    <div className={cx.root} data-sf-delivery aria-busy={loading || undefined}>
      {partial ? (
        <p role="status" className={cx.partial} data-sf-delivery-partial>
          {m.partial}
        </p>
      ) : null}
      {requoted ? (
        <p role="status" className={cx.partial} data-sf-delivery-requoted>
          {m.requoted}
        </p>
      ) : null}
      {loading ? (
        <span style={SR_ONLY} role="status" data-sf-delivery-loading>
          {m.loading}
        </span>
      ) : null}
      {children}
      {loading && rates.length === 0
        ? [0, 1, 2].map((i) => <div key={i} className={cx.skeleton} data-sf-delivery-skeleton aria-hidden="true" />)
        : null}
      {rates.map((rate) => {
        const carrier = rateCarrier(rate)
        const service = rateService(rate)
        const eta = rateEta(rate, m)
        const own = badges.get(rate.id) ?? []
        return (
          <label key={rate.id} className={cx.option} data-sf-delivery-option data-loading={loading || undefined}>
            {radio(rateValue(rate))}
            {marks ? <BrandMark brand={rate.carrier ?? rate.provider ?? rate.title} size={28} {...(cx.mark ? { className: cx.mark } : {})} /> : null}
            <span className={cx.body} data-sf-delivery-body>
              <span className={cx.title} data-sf-delivery-title>
                {carrier ? (
                  <>
                    <span className={cx.carrier} data-sf-delivery-carrier>
                      {carrier}
                    </span>{' '}
                    <span className={cx.service} data-sf-delivery-service>
                      {service}
                    </span>
                  </>
                ) : (
                  <span className={cx.carrier} data-sf-delivery-carrier>
                    {service}
                  </span>
                )}
              </span>
              {eta ? (
                <span className={cx.eta} data-sf-delivery-eta>
                  {eta}
                </span>
              ) : null}
              {own.length ? (
                <span className={cx.badges} data-sf-delivery-badges>
                  {own.map((b) => (
                    <span key={b} className={cx.badge} data-sf-delivery-badge={b}>
                      {b === 'cheapest' ? m.cheapest : m.fastest}
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
            <span className={cx.price} data-sf-delivery-price>
              {amount(rate.cost)}
            </span>
          </label>
        )
      })}
      {pickup.map((b) => (
        <label key={b.branch_id} className={cx.option} data-sf-delivery-option data-sf-delivery-pickup>
          {radio(pickupValue(b))}
          {marks ? <PickupGlyph size={28} /> : null}
          <span className={cx.body} data-sf-delivery-body>
            <span className={cx.title} data-sf-delivery-title>
              <span className={cx.carrier} data-sf-delivery-carrier>
                {m.pickupTitle.replace('{name}', b.name)}
              </span>
            </span>
            {b.address || b.city ? (
              <span className={cx.eta} data-sf-delivery-eta>
                {[b.address, b.city].filter(Boolean).join(', ')}
              </span>
            ) : null}
          </span>
          <span className={cx.price} data-sf-delivery-price>
            <span className={cx.free} data-sf-delivery-free>
              {m.free}
            </span>
          </span>
        </label>
      ))}
      {deadline ? (
        <p className={cx.note} data-sf-delivery-note data-soon={shownNote?.soon || undefined} aria-live="polite">
          {shownNote?.text ?? ''}
        </p>
      ) : null}
    </div>
  )
}
