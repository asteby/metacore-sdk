/**
 * Lines of an order, as the customer recognises them: picture, name, variant, SKU, quantity and the line total.
 * Headless (`data-sf-order-lines`), built on the shared `ProductPreview`. A line without picture or whose product no
 * longer exists is still a complete row (designed placeholder, "Producto no disponible"), and a malformed line from
 * the server is skipped instead of breaking the page.
 */
import type { Order, OrderLine } from '@asteby/storefront'
import { ProductPreview, ProductThumbStack, type ProductPreviewClassNames, type ProductThumbImage } from '../ui/product-preview.js'
import { fill } from './orders-messages.js'
import { moneyText, str, useAccountText, type AccountTextProps } from './orders-ui.js'

/** The picture of a line when it carries a usable URL. */
export function lineImage(line: Partial<OrderLine> | null | undefined): ProductThumbImage | null {
  const img = line?.image
  if (!img || typeof img !== 'object') return null
  const url = str((img as { url?: unknown }).url)
  if (!url) return null
  const alt = str((img as { alt?: unknown }).alt)
  const w = Number((img as { width?: unknown }).width)
  const h = Number((img as { height?: unknown }).height)
  return { url, alt, ...(Number.isFinite(w) && w > 0 ? { width: w } : {}), ...(Number.isFinite(h) && h > 0 ? { height: h } : {}) }
}

function validLines(order: Pick<Order, 'lines'> | { lines?: unknown }): OrderLine[] {
  return (Array.isArray(order.lines) ? order.lines : []).filter((l): l is OrderLine => !!l && typeof l === 'object')
}

export type OrderLinesClassNames = Partial<Record<'root' | 'list' | 'item', string>> & { preview?: ProductPreviewClassNames }

export type OrderLinesProps = AccountTextProps & {
  order: Pick<Order, 'lines'>
  /** Product page of a line (return `null` for none). */
  lineHref?: (line: OrderLine) => string | null | undefined
  /** Thumb side in px. Default 64. */
  size?: number
  /** Heading of the list for screen readers. */
  label?: string
  classNames?: OrderLinesClassNames
}

export function OrderLines({ order, lineHref, size = 64, label, classNames: cx = {}, ...text }: OrderLinesProps) {
  const { m, locale } = useAccountText(text)
  const lines = validLines(order)
  if (lines.length === 0) return null
  return (
    <div className={cx.root} data-sf-order-lines="">
      <ul className={cx.list} aria-label={label ?? m['order.lines']} data-sf-order-lines-list="">
        {lines.map((l, i) => {
          const qty = Number.isFinite(l.quantity) && l.quantity > 0 ? l.quantity : 1
          const unit = moneyText(l.unit, locale)
          const variant = str(l.variant_title)
          return (
            <li key={`${str(l.sku) ?? ''}-${i}`} className={cx.item} data-sf-order-line="">
              <ProductPreview
                image={lineImage(l)}
                name={str(l.title) ?? ''}
                variant={variant && !/^default( title)?$/i.test(variant) ? variant : null}
                sku={str(l.sku)}
                quantity={qty}
                quantityLabel={m['order.line.quantity']}
                unavailableLabel={m['order.line.unavailable']}
                unitPrice={unit ? fill(m['order.line.each'], { price: unit }) : null}
                total={moneyText(l.total, locale)}
                href={lineHref?.(l) ?? null}
                size={size}
                {...(cx.preview ? { classNames: cx.preview } : {})}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The products of an order as overlapped pictures with "+N": the glance of an order card. */
export function OrderProductsStack({ order, size = 44, max = 4, className, ...text }: AccountTextProps & { order: Pick<Order, 'lines'>; size?: number; max?: number; className?: string }) {
  const { m } = useAccountText(text)
  const lines = validLines(order)
  if (lines.length === 0) return null
  return (
    <ProductThumbStack
      items={lines.map((l) => ({ image: lineImage(l), name: str(l.title) }))}
      size={size}
      max={max}
      moreLabel={m['order.productsMore']}
      {...(className ? { className } : {})}
    />
  )
}
