/**
 * `QuickAddDialog`: the "choose your option" modal of a product card. One premium pattern for every store:
 * the picture (the chosen variant's when it has one), name, rating slot, price, a variant picker with a clear state
 * (selected / sold out), a quantity stepper, the primary "Agregar al carrito" button and a visible secondary link to the
 * full product page. Headless-friendly (`data-sf-quickadd*`, `classNames`), styled by `quick-add.css` (plain CSS on the
 * store tokens, dark mode and mobile sheet included), SSR-safe (renders nothing while closed).
 *
 * Accessibility: a native `<dialog>` opened with `showModal()` through `useModalDialog` (focus trap, inert background,
 * Esc / backdrop / X close, scroll lock, focus back to the opener), the variants are real radio buttons in a fieldset
 * (arrow keys, `disabled` when sold out, the state is text + icon, never colour alone), the price announces itself
 * politely when the variant changes, and every control is at least 44 px tall.
 *
 * It does not add to the cart itself: it renders a `<form method="post" action>` carrying `variant_id`, `quantity` and the
 * `fields` (default `intent=add`), so it works without JavaScript and the store decides how to send it (`onSubmit`
 * receives the event and the selection: optimistic cart, fetcher, analytics...).
 */
import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { Image as ImageData, Money as MoneyData, Product, ProductVariant } from '@asteby/storefront'
import { Money } from '../components.js'
import { useModalDialog, type DialogCloseReason } from '../dialog.js'
import { useResolvedLocale } from '../locale.js'
import { PendingButton } from './pending-button'
import { ProductThumb } from './product-preview'
import { fillMessage, quickAddMessages, type QuickAddMessages } from './quick-add-messages'

export type QuickAddClassNames = Partial<
  Record<'dialog' | 'form' | 'header' | 'close' | 'body' | 'media' | 'info' | 'title' | 'price' | 'options' | 'option' | 'quantity' | 'footer' | 'submit' | 'link' | 'error', string>
>

export type QuickAddSelection = { variant: ProductVariant; quantity: number }

export type QuickAddLinkProps = {
  href: string
  className: string
  children: ReactNode
  onClick: () => void
  'aria-label': string
  'data-sf-quickadd-link': ''
  tabIndex?: number
  'aria-hidden'?: boolean
}

export type QuickAddDialogProps = {
  open: boolean
  /** Esc, backdrop, the X and the product link. The owner closes (`open` -> false). */
  onClose: (reason: DialogCloseReason) => void
  product: Pick<Product, 'handle' | 'title' | 'vendor' | 'featured_image' | 'images' | 'variants'>
  /** The product page, already localized (`/mx/productos/<slug>`, `/us/products/<slug>`). A function receives the chosen variant, so the page can open on it (`?variante=`). */
  productHref: string | ((variant: ProductVariant | null) => string)
  /** Readable name when it differs from `product.title` (list titles). */
  name?: string
  /** Stars and review count, in the store's own look. Omitted when the product has no rating. */
  rating?: ReactNode
  /** Preselected variant. Default: the first one available for sale. */
  initialVariantId?: string | null
  /** Text of a variant in the picker. Default: its option values joined with " / ", else its title. */
  optionLabel?: (variant: ProductVariant) => string
  /** Color / emoji swatch of a variant, drawn before its name. */
  renderSwatch?: (variant: ProductVariant) => ReactNode
  /** Formats a price with the store's rules. Default: the SDK `Money`. */
  renderPrice?: (money: MoneyData) => ReactNode
  /** The big picture. Default: `ProductThumb` (responsive, fallback). Receives the chosen variant's image or the product's. */
  renderImage?: (image: ImageData | null, variant: ProductVariant | null) => ReactNode
  /** Router-aware link (`<Link to>`); default is a plain `<a href>`. */
  renderLink?: (props: QuickAddLinkProps) => ReactNode
  /** Form submit. Call `event.preventDefault()` to take over (fetcher, optimistic cart); otherwise it is a normal POST. */
  onSubmit?: (event: FormEvent<HTMLFormElement>, selection: QuickAddSelection) => void
  /** Form action (the cart route). */
  action?: string
  /** Extra hidden fields. Default `{ intent: 'add' }`. */
  fields?: Record<string, string>
  /** The add is in flight: the button locks and shows the working text. */
  pending?: boolean
  /** Message of the last failed add (announced). */
  error?: string | null
  /** Upper bound of the stepper (also capped by the variant's stock). Default 99. */
  maxQuantity?: number
  locale?: string | null
  messages?: Partial<QuickAddMessages>
  classNames?: QuickAddClassNames
}

const defaultLabel = (v: ProductVariant) => v.selected_options.map((o) => o.value).join(' / ') || v.title

function cx(...parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join(' ') || undefined
}

const num = (m: MoneyData | null | undefined) => (m ? Number.parseFloat(m.amount) : Number.NaN)

export function QuickAddDialog(props: QuickAddDialogProps) {
  return props.open ? <QuickAddDialogOpen {...props} /> : null
}

function QuickAddDialogOpen({
  onClose,
  product,
  productHref,
  name,
  rating,
  initialVariantId,
  optionLabel = defaultLabel,
  renderSwatch,
  renderPrice,
  renderImage,
  renderLink,
  onSubmit,
  action,
  fields = { intent: 'add' },
  pending = false,
  error,
  maxQuantity = 99,
  locale,
  messages,
  classNames: cn = {},
}: QuickAddDialogProps) {
  const loc = useResolvedLocale(locale)
  const m = useMemo(() => quickAddMessages(loc, messages), [loc, messages])
  const id = useId()
  const titleId = `${id}-title`
  const priceId = `${id}-price`
  const label = name?.trim() || product.title

  const firstAvailable = product.variants.find((v) => v.available_for_sale)
  const [variantId, setVariantId] = useState<string | null>(() => {
    const wanted = initialVariantId ? product.variants.find((v) => v.id === initialVariantId && v.available_for_sale) : undefined
    return (wanted ?? firstAvailable)?.id ?? null
  })
  const [quantity, setQuantity] = useState(1)
  const variant = product.variants.find((v) => v.id === variantId) ?? null

  const initialFocus = useRef<HTMLElement | null>(null)
  const { ref, onBackdropClick } = useModalDialog({ open: true, onClose, initialFocus })

  const limit = Math.max(1, Math.min(maxQuantity, variant?.quantity_available ?? Number.POSITIVE_INFINITY))
  const qty = Math.min(Math.max(1, quantity), limit)
  const atMax = qty >= limit && variant?.quantity_available != null

  const price = (money: MoneyData) => (renderPrice ? renderPrice(money) : <Money data={money} />)
  const image = variant?.image ?? product.featured_image ?? product.images[0] ?? null
  const onSale = variant?.compare_at_price && num(variant.compare_at_price) > num(variant.price)
  const total: MoneyData | null = variant ? { ...variant.price, amount: (Math.round(num(variant.price) * 100 * qty) / 100).toFixed(2) } : null
  const stock = variant?.quantity_available
  const lowStock = variant && variant.available_for_sale && stock != null && stock > 0 && stock <= 5

  const selectVariant = (v: ProductVariant) => {
    setVariantId(v.id)
    setQuantity((q) => Math.min(q, Math.max(1, v.quantity_available ?? maxQuantity)))
  }

  const linkProps: QuickAddLinkProps = {
    href: typeof productHref === 'function' ? productHref(variant) : productHref,
    className: cx('sf-quickadd-link', cn.link) ?? 'sf-quickadd-link',
    children: m['quickadd.viewProduct'],
    onClick: () => onClose('action'),
    'aria-label': fillMessage(m['quickadd.viewProductAria'], { name: label }),
    'data-sf-quickadd-link': '',
  }
  // The picture and the name lead to the product page too (same destination as the explicit link).
  const toProduct = (children: ReactNode, extra: Partial<QuickAddLinkProps>) => {
    const p = { ...linkProps, ...extra, children }
    return renderLink ? renderLink(p) : <a {...p} />
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-sf-quickadd=""
      className={cn.dialog}
      onClick={onBackdropClick}
    >
      <form
        method="post"
        {...(action ? { action } : {})}
        data-sf-quickadd-form=""
        className={cn.form}
        onSubmit={(e) => {
          if (!variant) {
            e.preventDefault()
            return
          }
          onSubmit?.(e, { variant, quantity: qty })
        }}
      >
        {Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}

        <header data-sf-quickadd-header="" className={cn.header}>
          <p data-sf-quickadd-eyebrow="">{m['quickadd.eyebrow']}</p>
          <button type="button" data-sf-quickadd-close="" className={cn.close} onClick={() => onClose('x')} aria-label={m['quickadd.close']}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div data-sf-quickadd-body="" className={cn.body}>
          <div data-sf-quickadd-media="" className={cn.media}>
            {toProduct(renderImage ? renderImage(image, variant) : <ProductThumb image={image} name={label} size={480} fit="contain" zoom={false} decorative priority />, {
              className: 'sf-quickadd-media-link',
              'aria-label': undefined as never,
              'data-sf-quickadd-link': '',
              tabIndex: -1,
              'aria-hidden': true,
            })}
          </div>

          <div data-sf-quickadd-info="" className={cn.info}>
            {product.vendor ? <p data-sf-quickadd-vendor="">{product.vendor}</p> : null}
            <h2 id={titleId} data-sf-quickadd-title="" className={cn.title}>
              {toProduct(label, { className: 'sf-quickadd-title-link', 'aria-label': undefined as never })}
            </h2>
            {rating ? <div data-sf-quickadd-rating="">{rating}</div> : null}

            <div id={priceId} data-sf-quickadd-price="" className={cn.price} aria-live="polite" aria-atomic="true">
              {variant ? (
                <>
                  <span data-sf-quickadd-now="" data-sale={onSale || undefined}>
                    {price(variant.price)}
                  </span>
                  {onSale && variant.compare_at_price ? <s data-sf-quickadd-was="">{price(variant.compare_at_price)}</s> : null}
                  {lowStock ? <span data-sf-quickadd-stock="" data-low="">{fillMessage(m['quickadd.lowStock'], { n: stock! })}</span> : null}
                </>
              ) : (
                <span data-sf-quickadd-hint="">{m['quickadd.pick']}</span>
              )}
            </div>

            <fieldset role="radiogroup" data-sf-quickadd-options="" className={cn.options}>
              <legend>{m['quickadd.options']}</legend>
              <ul>
                {product.variants.map((v) => {
                  const available = v.available_for_sale
                  const checked = v.id === variantId
                  return (
                    <li key={v.id}>
                      <label data-sf-quickadd-option="" data-available={available} data-checked={checked || undefined} className={cn.option}>
                        <input
                          type="radio"
                          name="variant_id"
                          value={v.id}
                          checked={checked}
                          disabled={!available}
                          onChange={() => selectVariant(v)}
                          ref={checked ? (el) => void (initialFocus.current = el) : undefined}
                        />
                        <span data-sf-quickadd-card="">
                          {renderSwatch ? <span data-sf-quickadd-swatch="">{renderSwatch(v)}</span> : null}
                          <span data-sf-quickadd-text="">
                            <span data-sf-quickadd-name="">{optionLabel(v)}</span>
                            <span data-sf-quickadd-sub="">{available ? price(v.price) : m['quickadd.soldOut']}</span>
                          </span>
                          <span data-sf-quickadd-tick="" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" focusable="false">
                              <path d="m5 12.5 4.5 4.5L19 7.5" />
                            </svg>
                          </span>
                          {checked ? <span className="sf-sr-only" style={SR}>{`, ${m['quickadd.selected']}`}</span> : null}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>

            <div data-sf-quickadd-qty="" className={cn.quantity}>
              <label htmlFor={`${id}-qty`}>{m['quickadd.quantity']}</label>
              <div data-sf-quickadd-stepper="">
                <button type="button" onClick={() => setQuantity(qty - 1)} disabled={qty <= 1} aria-label={m['quickadd.decrease']} aria-controls={`${id}-qty`}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M5 12h14" /></svg>
                </button>
                <input
                  id={`${id}-qty`}
                  name="quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={limit}
                  step={1}
                  value={qty}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10)
                    setQuantity(Number.isFinite(n) ? Math.min(Math.max(1, n), limit) : 1)
                  }}
                  aria-describedby={atMax ? `${id}-max` : undefined}
                />
                <button type="button" onClick={() => setQuantity(qty + 1)} disabled={qty >= limit} aria-label={m['quickadd.increase']} aria-controls={`${id}-qty`}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>
              {atMax ? <p id={`${id}-max`} data-sf-quickadd-max="" role="status">{m['quickadd.maxReached']}</p> : null}
            </div>

            {error ? (
              <p role="alert" data-sf-quickadd-error="" className={cn.error}>
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <footer data-sf-quickadd-footer="" className={cn.footer}>
          <PendingButton
            type="submit"
            data-sf-quickadd-submit=""
            className={cn.submit}
            pending={pending}
            disabled={!variant || !variant.available_for_sale}
            kind="add"
            locale={loc}
            pendingLabel={m['quickadd.adding']}
          >
            <span>{m['quickadd.add']}</span>
            {total && qty > 1 ? <span data-sf-quickadd-total="">{price(total)}</span> : null}
          </PendingButton>
          {toProduct(m['quickadd.viewProduct'], {})}
        </footer>
      </form>
    </dialog>
  )
}

const SR = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const
