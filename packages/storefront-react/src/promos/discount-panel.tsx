import { couponsBlocked, promoProgressView, type CartPromotions, type PromotionMessages } from '@asteby/storefront'
import { CartProgressBars } from './cart-progress-bars.js'
import { CheckoutDiscountCode, DiscountCodeForm, type DiscountCodeFormProps } from './discount-code.js'

/** Where the panel is mounted. Same content everywhere; only the density and the coupon presentation change. */
export type DiscountPanelLayout = 'aside' | 'cart' | 'drawer'

export type DiscountPanelProps = {
  /** `Cart.promotions` exactly as OPS sent it. */
  promotions: CartPromotions | null | undefined
  /** `Cart.discount_codes`. */
  codes: DiscountCodeFormProps['codes']
  /**
   * `aside`: column of the checkout summary (open coupon field). `cart`: the cart page (open field). `drawer`: the side
   * mini-cart (compact bars, coupon folded under «¿Tienes un cupón?»). Default `aside`.
   */
  layout?: DiscountPanelLayout
  /** The coupon field: `open` (always visible), `collapsible` (folded) or `false` (none). Default by `layout`. */
  coupon?: 'open' | 'collapsible' | false
  /** Show the progress bars (discount by amount, free shipping). Default true. */
  bars?: boolean
  /** Show the tier milestones under the discount bar. Default true. */
  milestones?: boolean
  locale?: string
  messages?: Partial<PromotionMessages>
  /**
   * How the coupon form posts: `as` (React Router `Form` / fetcher `Form`), `action`, `busy`, `error`, `intent`, the field and
   * button classes. The shop's route action applies the code; this block has no discount logic of its own.
   */
  form?: Omit<DiscountCodeFormProps, 'codes' | 'promotions' | 'locale' | 'messages' | 'className'>
  className?: string
  classNames?: Partial<Record<'bars' | 'coupon', string>>
}

/**
 * The one discounts block of the storefront: automatic-discount and free-shipping bars (`CartProgressBars`) plus the coupon
 * field (`CheckoutDiscountCode`), the same in the checkout aside, the cart page and the mini-cart. Everything comes from
 * `Cart.promotions` / `Cart.discount_codes` (OPS decides); the shop only mounts it with props. Renders nothing when there is
 * nothing to show (no promotions and the coupon hidden, or the promotion in force blocks coupons and there are no bars).
 * The total and its breakdown by source («Descuento», «Cupón X») live in `OrderTotals`. Styled by `promos.css`.
 */
export function DiscountPanel({ promotions, codes, layout = 'aside', coupon, bars = true, milestones = true, locale, messages, form, className, classNames: cx = {} }: DiscountPanelProps) {
  const view = promoProgressView(promotions, locale, messages)
  const showBars = bars && Boolean(view.discount || view.shipping)
  const mode = coupon === undefined ? (layout === 'drawer' ? 'collapsible' : 'open') : coupon
  const blocked = couponsBlocked(promotions)
  const showCoupon = mode !== false && !blocked
  if (!showBars && !showCoupon) return null
  const shared = { ...form, codes, promotions, locale, messages } as DiscountCodeFormProps
  return (
    <div className={className} data-sf-discount-panel data-layout={layout}>
      {showBars ? <CartProgressBars promotions={promotions} locale={locale} messages={messages} showMilestones={milestones} className={cx.bars} /> : null}
      {showCoupon ? (
        mode === 'collapsible' ? (
          <CheckoutDiscountCode {...shared} variant="collapsible" className={cx.coupon} />
        ) : (
          <DiscountCodeForm {...shared} className={cx.coupon} />
        )
      ) : null}
    </div>
  )
}
