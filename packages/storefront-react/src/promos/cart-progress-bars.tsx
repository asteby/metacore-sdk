import { Fragment, useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { promoProgressView, promotionMessages, type CartPromotions, type PromotionMessages } from '@asteby/storefront'
import { prefersReducedMotion } from '../dialog.js'
import { useResolvedLocale } from '../locale.js'

export type ProgressBarProps = {
  /** Visible text (also `aria-valuetext`). */
  text: string
  /** 0-100, from the server. */
  percent: number
  label: string
  showBar?: boolean
  milestones?: { id: string; label: string; threshold: string; reached: boolean; position: number }[]
  /** The remaining amount exactly as it appears in `text`; highlighted when found. */
  remainingText?: string | null
  state: string
  kind: 'discount' | 'shipping'
  className?: string
}

const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const

/** Price tag (discounts), seal with check (discount at max) and truck (shipping). Inline and decorative: the text carries the meaning. */
function PromoIcon({ kind, done }: { kind: 'discount' | 'shipping'; done: boolean }) {
  if (kind === 'shipping') {
    return (
      <svg {...svg}>
        <path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2" />
        <path d="M15 18H9" />
        <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
        <circle cx="17" cy="18" r="2" />
        <circle cx="7" cy="18" r="2" />
      </svg>
    )
  }
  return done ? (
    <svg {...svg}>
      <path d="M12 3l2.4 2 3.1-.3.9 3 2.6 1.7-1 3 1 3-2.6 1.7-.9 3-3.1-.3L12 21l-2.4-2-3.1.3-.9-3L3 14.6l1-3-1-3 2.6-1.7.9-3 3.1.3z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ) : (
    <svg {...svg}>
      <path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z" />
      <path d="m15 9-6 6" />
      <circle cx="9.5" cy="9.5" r=".5" fill="currentColor" />
      <circle cx="14.5" cy="14.5" r=".5" fill="currentColor" />
    </svg>
  )
}

/** The text with its first `amount` wrapped in a highlight span; the whole text stays the accessible one. */
function highlight(text: string, amount?: string | null): ReactNode {
  const i = amount ? text.indexOf(amount) : -1
  if (!amount || i < 0) return text
  return (
    <Fragment>
      {text.slice(0, i)}
      <strong data-sf-promo-amount>{amount}</strong>
      {text.slice(i + amount.length)}
    </Fragment>
  )
}

/** A milestone near an end is anchored to that edge of the bar, so its label never overflows the card. */
const edgeOf = (position: number) => (position <= 12 ? 'start' : position >= 88 ? 'end' : undefined)

/** Two consecutive milestones closer than this many percentage points would stack their labels, so they fan out. */
export const CROWDED_GAP = 22

/**
 * Per milestone: `end` = its label ends at its own marker (grows to the left), `start` = its label starts at its marker
 * (grows to the right). Only milestones in a crowded run get one: all but the last of the run are `end`, the last is `start`,
 * unless it is anchored to the right edge already (`data-edge="end"`), which keeps its own anchor.
 * Pure, so it is unit-testable; markers are assumed sorted by `position`.
 */
export function crowdedAnchors(positions: number[], gap = CROWDED_GAP): ('start' | 'end' | undefined)[] {
  return positions.map((pos, i) => {
    const next = positions[i + 1]
    const prev = positions[i - 1]
    if (next !== undefined && next - pos < gap) return edgeOf(pos) === 'start' ? undefined : 'end'
    if (prev !== undefined && pos - prev < gap) return edgeOf(pos) === 'end' ? undefined : 'start'
    return undefined
  })
}

/**
 * One accessible bar: color is never the only signal (text states the remaining amount; milestones are text).
 * The fill width is the server percentage; the transition is off for `prefers-reduced-motion`.
 * Styled by `@asteby/storefront-react/promos.css` (optional: the markup is just data attributes).
 */
export function PromoProgressBar({ text, percent, label, showBar = true, milestones, remainingText, state, kind, className }: ProgressBarProps) {
  const id = useId()
  const [reduced, setReduced] = useState(false)
  useEffect(() => setReduced(prefersReducedMotion()), [])
  const nextId = milestones?.find((t) => !t.reached)?.id
  const crowded = useMemo(() => crowdedAnchors((milestones ?? []).map((t) => t.position)), [milestones])
  const fill: CSSProperties = { width: `${percent}%`, transition: reduced ? 'none' : 'width 600ms ease' }
  return (
    <div className={className} data-sf-promo-bar={kind} data-state={state}>
      <div data-sf-promo-head>
        <span data-sf-promo-icon aria-hidden="true">
          <PromoIcon kind={kind} done={state === 'max'} />
        </span>
        <p id={`${id}-t`} aria-live="polite" data-sf-promo-bar-text>
          {highlight(text, remainingText)}
        </p>
        {showBar && state !== 'suppressed' && (
          <span data-sf-promo-percent aria-hidden="true">
            {percent}%
          </span>
        )}
      </div>
      {showBar && (
        <div role="progressbar" aria-label={label} aria-describedby={`${id}-t`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={text} data-sf-promo-track>
          <div style={fill} data-sf-promo-fill />
        </div>
      )}
      {showBar && milestones && milestones.length > 0 && (
        <ul data-sf-promo-milestones>
          {milestones.map((t, i) => (
            <li key={t.id} data-reached={t.reached} data-next={t.id === nextId ? true : undefined} data-edge={edgeOf(t.position)} data-crowded={crowded[i]} style={{ left: `${t.position}%` }}>
              <span data-sf-promo-dot aria-hidden="true">
                <svg {...svg} strokeWidth={3.5}>
                  <path d="m5 12 5 5 9-10" />
                </svg>
              </span>
              <span data-sf-promo-tier-label>{t.label}</span> <span data-sf-promo-tier-threshold>{t.threshold}</span>
              {t.reached && <span data-sf-sr-only style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}> ✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export type CartProgressBarsProps = {
  /** `Cart.promotions` exactly as the server sent it. */
  promotions: CartPromotions | null | undefined
  locale?: string
  messages?: Partial<PromotionMessages>
  /** Show the tier milestones under the discount bar. Default true. */
  showMilestones?: boolean
  className?: string
}

/**
 * Automatic-discount bar and free-shipping bar of the cart (or drawer). Pure view of `Cart.promotions`:
 * `remaining`, `percent` and `reached` come from OPS; the shop never subtracts or divides.
 * Renders nothing without promotions.
 */
export function CartProgressBars({ promotions, locale: localeProp, messages, showMilestones = true, className }: CartProgressBarsProps) {
  const locale = useResolvedLocale(localeProp)
  const view = useMemo(() => promoProgressView(promotions, locale, messages), [promotions, locale, messages])
  const m = promotionMessages(locale, messages)
  if (!view.discount && !view.shipping) return null
  return (
    <div className={className} data-sf-promo-bars>
      {view.discount && (
        <PromoProgressBar
          kind="discount"
          state={view.discount.state}
          text={view.discount.text}
          remainingText={view.discount.remainingText}
          percent={view.discount.percent}
          label={m['bar.discount']}
          {...(showMilestones ? { milestones: view.discount.tiers } : {})}
        />
      )}
      {view.shipping && (
        <PromoProgressBar
          kind="shipping"
          state={view.shipping.state}
          text={view.shipping.text}
          remainingText={view.shipping.remainingText}
          percent={view.shipping.percent}
          label={m['bar.shipping']}
          showBar={view.shipping.showBar}
        />
      )}
    </div>
  )
}
