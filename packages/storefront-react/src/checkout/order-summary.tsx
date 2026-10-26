/**
 * Order summary of a checkout: lines and the server totals (subtotal, discounts, shipping, taxes, total) exactly as
 * `cart.cost` sends them; nothing is added or recalculated. `OrderSummaryDisclosure` wraps it for phones: a collapsed
 * bar with the total at the top of the page (native `<details>`, no JavaScript, no layout shift on hydration).
 */
import type { ReactNode } from 'react'
import { formatMoney, type CartCost, type CartLine, type Money } from '@asteby/storefront'
import { useResolvedLocale } from '../locale.js'
import { ProductThumb } from '../ui/product-preview.js'

export type OrderSummaryMessages = {
  title: string
  subtotal: string
  discount: string
  shipping: string
  /** Shipping not chosen yet. */
  shippingPending: string
  /** Shipping being saved / re-read. */
  updating: string
  free: string
  taxes: string
  /** Taxes already inside the prices, `{amount}`. */
  taxesIncluded: string
  total: string
  /** `{n}` = quantity. */
  quantity: string
  show: string
  hide: string
}

const ES: OrderSummaryMessages = {
  title: 'Tu pedido',
  subtotal: 'Subtotal',
  discount: 'Descuento',
  shipping: 'Envío',
  shippingPending: 'Al elegir la entrega',
  updating: 'Actualizando…',
  free: 'Gratis',
  taxes: 'Impuestos',
  taxesIncluded: 'Incluye {amount} de impuestos',
  total: 'Total',
  quantity: 'Cantidad: {n}',
  show: 'Ver resumen del pedido',
  hide: 'Ocultar resumen del pedido',
}

const EN: OrderSummaryMessages = {
  title: 'Your order',
  subtotal: 'Subtotal',
  discount: 'Discount',
  shipping: 'Shipping',
  shippingPending: 'Calculated at delivery',
  updating: 'Updating…',
  free: 'Free',
  taxes: 'Taxes',
  taxesIncluded: 'Includes {amount} in taxes',
  total: 'Total',
  quantity: 'Quantity: {n}',
  show: 'Show order summary',
  hide: 'Hide order summary',
}

export function orderSummaryMessages(locale?: string | null, overrides?: Partial<OrderSummaryMessages> | null): OrderSummaryMessages {
  const base = (locale ?? 'es-MX').toLowerCase().startsWith('en') ? EN : ES
  return overrides ? { ...base, ...overrides } : base
}

export type OrderSummaryClassNames = Partial<
  Record<'root' | 'title' | 'lines' | 'line' | 'media' | 'qty' | 'lineTitle' | 'variant' | 'linePrice' | 'totals' | 'row' | 'discount' | 'muted' | 'free' | 'total' | 'note', string>
>

export type OrderSummaryProps = {
  lines: readonly CartLine[]
  /** `cart.cost` as the server sends it. */
  cost: CartCost
  /** The delivery is being saved and the cart re-read: shipping and total say so (`aria-busy`). */
  updating?: boolean
  /** Picture of a line (e.g. `<ProductImage>`), 48-64 px. The quantity badge sits on it. Default: `<ProductThumb>` of the line's image (fallback initial when it has none). */
  renderLineMedia?: (line: CartLine) => ReactNode
  /** Show the default picture of each line. Default true; `false` gives the text-only "2 × Name" list. */
  media?: boolean
  renderAmount?: (amount: Money) => ReactNode
  /** Heading. `false` hides it (the disclosure already names the block). */
  title?: ReactNode | false
  /** Heading level. Default 2. */
  headingLevel?: 2 | 3
  locale?: string
  messages?: Partial<OrderSummaryMessages>
  classNames?: OrderSummaryClassNames
  /** Rendered between the lines and the totals (e.g. a discount code form). */
  children?: ReactNode
}

/** The line's own picture, else the product's; `decorative` because the name is right beside it. */
function defaultLineMedia(l: CartLine): ReactNode {
  const img = l.merchandise.image ?? l.merchandise.product.featured_image ?? null
  return <ProductThumb image={img} name={l.merchandise.product.title} size={56} decorative zoom={false} />
}

const isZero = (m: Money | null | undefined) => !!m && Number(m.amount) === 0
const positive = (m: Money | null | undefined): m is Money => !!m && Number(m.amount) > 0

/** Lines and totals of the order. The total row is `aria-live`, so a new total after choosing delivery is announced. */
export function OrderSummary(props: OrderSummaryProps) {
  const { lines, cost, updating = false, media = true, renderAmount, title, headingLevel = 2, classNames: cx = {}, children } = props
  const locale = useResolvedLocale(props.locale)
  const m = orderSummaryMessages(locale, props.messages)
  const money = (v: Money) => (renderAmount ? renderAmount(v) : formatMoney(v, locale))
  const renderLineMedia = props.renderLineMedia ?? (media ? defaultLineMedia : undefined)
  const H = headingLevel === 3 ? 'h3' : 'h2'
  const discounts = cost.discounts?.filter((d) => positive(d.amount)) ?? []
  return (
    <div className={cx.root} data-sf-summary>
      {title === false ? null : (
        <H className={cx.title} data-sf-summary-title>
          {title ?? m.title}
        </H>
      )}
      <ul className={cx.lines} data-sf-summary-lines>
        {lines.map((l) => {
          const variant = l.merchandise.title && !/^default( title)?$/i.test(l.merchandise.title) ? l.merchandise.title : null
          return (
            <li key={l.id} className={cx.line} data-sf-summary-line>
              {renderLineMedia ? (
                <span className={cx.media} data-sf-summary-media>
                  {renderLineMedia(l)}
                  {l.quantity > 1 ? (
                    <span className={cx.qty} data-sf-summary-qty aria-hidden="true">
                      {l.quantity}
                    </span>
                  ) : null}
                </span>
              ) : null}
              <span data-sf-summary-line-body>
                <span className={cx.lineTitle} data-sf-summary-line-title>
                  {!renderLineMedia && l.quantity > 1 ? `${l.quantity} × ` : null}
                  {l.merchandise.product.title}
                </span>
                {variant ? (
                  <span className={cx.variant} data-sf-summary-variant>
                    {variant}
                  </span>
                ) : null}
                {renderLineMedia || l.quantity > 1 ? (
                  <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>{m.quantity.replace('{n}', String(l.quantity))}</span>
                ) : null}
              </span>
              <span className={cx.linePrice} data-sf-summary-line-price>
                {money(l.cost.total)}
              </span>
            </li>
          )
        })}
      </ul>
      {children}
      <dl className={cx.totals} data-sf-summary-totals aria-busy={updating || undefined}>
        <div className={cx.row} data-sf-summary-row="subtotal">
          <dt>{m.subtotal}</dt>
          <dd>{money(cost.subtotal)}</dd>
        </div>
        {discounts.length
          ? discounts.map((d) => (
              <div key={d.id} className={cx.row ? `${cx.row} ${cx.discount ?? ''}`.trim() : cx.discount} data-sf-summary-row="discount">
                <dt>{d.code ? `${m.discount} (${d.code})` : d.title || m.discount}</dt>
                <dd>−{money(d.amount)}</dd>
              </div>
            ))
          : positive(cost.discount) ? (
              <div className={cx.row ? `${cx.row} ${cx.discount ?? ''}`.trim() : cx.discount} data-sf-summary-row="discount">
                <dt>{m.discount}</dt>
                <dd>−{money(cost.discount)}</dd>
              </div>
            ) : null}
        <div className={cx.row} data-sf-summary-row="shipping">
          <dt>{m.shipping}</dt>
          <dd className={updating || !cost.shipping ? cx.muted : undefined}>
            {updating ? m.updating : !cost.shipping ? m.shippingPending : isZero(cost.shipping) ? <span className={cx.free}>{m.free}</span> : money(cost.shipping)}
          </dd>
        </div>
        {positive(cost.tax) && !cost.tax_included ? (
          <div className={cx.row} data-sf-summary-row="tax">
            <dt>{m.taxes}</dt>
            <dd>{money(cost.tax)}</dd>
          </div>
        ) : null}
        <div className={cx.total} data-sf-summary-row="total">
          <dt>{m.total}</dt>
          <dd aria-live="polite" data-updating={updating || undefined}>
            {money(cost.total)}
          </dd>
        </div>
      </dl>
      {positive(cost.tax) && cost.tax_included ? (
        <p className={cx.note} data-sf-summary-tax-note>
          {m.taxesIncluded.split('{amount}').flatMap((part, i) => (i === 0 ? [part] : [<span key={i}>{money(cost.tax!)}</span>, part]))}
        </p>
      ) : null}
    </div>
  )
}

export type OrderSummaryDisclosureProps = {
  /** Total shown on the collapsed bar (`cart.cost.total`). */
  total: Money
  updating?: boolean
  renderAmount?: (amount: Money) => ReactNode
  locale?: string
  messages?: Partial<OrderSummaryMessages>
  /** Start open (default closed). */
  defaultOpen?: boolean
  className?: string
  classNames?: Partial<Record<'summary' | 'label' | 'total' | 'panel', string>>
  /** Usually an `<OrderSummary title={false} … />`. */
  children: ReactNode
}

/**
 * Phones: the order summary as a collapsed bar at the top ("Show order summary · $1,234.00"). Native `<details>`:
 * works without JavaScript, the server HTML is already the final layout (no shift on hydration). Show it only on
 * narrow screens and the full summary on wide ones (the shop's CSS).
 */
export function OrderSummaryDisclosure({ total, updating, renderAmount, locale: loc, messages, defaultOpen = false, className, classNames: cx = {}, children }: OrderSummaryDisclosureProps) {
  const locale = useResolvedLocale(loc)
  const m = orderSummaryMessages(locale, messages)
  return (
    <details className={className} data-sf-summary-disclosure {...(defaultOpen ? { open: true } : {})}>
      <summary className={cx.summary} data-sf-summary-toggle>
        <span className={cx.label} data-sf-summary-toggle-label>
          <span data-sf-summary-show>{m.show}</span>
          <span data-sf-summary-hide>{m.hide}</span>
        </span>
        <span className={cx.total} data-sf-summary-toggle-total data-updating={updating || undefined}>
          {renderAmount ? renderAmount(total) : formatMoney(total, locale)}
        </span>
      </summary>
      <div className={cx.panel} data-sf-summary-panel>
        {children}
      </div>
    </details>
  )
}
