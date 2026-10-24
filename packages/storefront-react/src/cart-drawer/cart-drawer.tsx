import { useEffect, useId, type ElementType, type ReactNode } from 'react'
import { formatMoney, type Cart, type CartLine, type Money } from '@asteby/storefront'
import { useModalDialog } from '../dialog.js'
import { useResolvedLocale } from '../locale.js'
import { closeCartDrawer, isQuietOpen, useCartDrawer } from './store.js'
import { cartOptimistic, useOptimisticCart, type OptimisticNotice, type OptimisticRow } from './optimistic.js'

/** Textos del estado optimista. Por omisión es-MX; la tienda puede traducirlos o cambiarlos. */
export type CartDrawerOptimisticLabels = {
  /** Estado discreto en la fila provisional. */
  adding: string
  /** Anuncio `aria-live="polite"` al mostrar/confirmar la fila. */
  added: string
  /** Junto al subtotal mientras OPS no confirma. */
  calculating: string
  /** Aviso de error: «No pudimos agregar X: motivo». */
  failed: (title: string, reason: string) => string
  dismiss: string
}

export const DEFAULT_OPTIMISTIC_LABELS: CartDrawerOptimisticLabels = {
  adding: 'Agregando…',
  added: 'Agregado al carrito',
  calculating: 'calculando…',
  failed: (title, reason) => `No pudimos agregar ${title}: ${reason}`,
  dismiss: 'Descartar aviso',
}

export type CartDrawerLabels = {
  /** Título; el cajón agrega " (N)" con la cantidad de unidades. */
  title: string
  /** Texto accesible del botón de cierre. */
  close: string
  empty: string
  emptyHint?: string
  /** Texto del enlace "seguir comprando" del estado vacío (se muestra con `paths.browse`). */
  browse?: string
  subtotal: string
  /** Nota bajo el subtotal. */
  note?: string
  checkout: string
  viewCart: string
  remove: string
  increase: string
  decrease: string
}

export type CartDrawerPaths = {
  /** Página del carrito: acción de las mutaciones y destino de "ver carrito". */
  cart: string
  checkout: string
  browse?: string
  /** Enlace de la línea al producto; sin esto el título no es enlace. */
  product?: (handle: string, variantId: string) => string
}

/** Contrato de la acción de ruta del carrito de la tienda (nombres de campo e intenciones). */
export type CartDrawerFormContract = {
  intentField?: string
  lineField?: string
  quantityField?: string
  updateIntent?: string
  removeIntent?: string
}

export type CartDrawerShipping = {
  /** Mensaje ya calculado por la tienda con lo que manda OPS. */
  message: ReactNode
  /** 0..100 */
  percent: number
  reached?: boolean
  progressLabel: string
}

export type CartDrawerLineForm = {
  /** Componente de formulario (`'form'`, o `fetcher.Form` del router para mejorar sin recargar). */
  Form: ElementType
  /** Datos en vuelo del formulario, para pintar la cantidad de forma optimista. */
  formData?: FormData | null | undefined
}

export type CartDrawerLinkProps = { href: string; className?: string | undefined; children: ReactNode; onClick?: () => void }

export type CartDrawerSlot =
  | 'dialog' | 'panel' | 'header' | 'title' | 'close' | 'empty' | 'body' | 'shipping' | 'bar' | 'barFill' | 'lines' | 'line'
  | 'image' | 'lineTitle' | 'variant' | 'price' | 'qty' | 'qtyButton' | 'qtyValue' | 'remove' | 'upsell' | 'footer' | 'subtotal'
  | 'note' | 'actions' | 'checkout' | 'viewCart' | 'browse' | 'emptyTitle' | 'emptyHint' | 'shippingMessage' | 'lineMain'
  | 'notices' | 'lineHead' | 'lineText' | 'controls' | 'upsellTitle' | 'subtotalLabel' | 'subtotalValue'

export type CartDrawerIcons = { close?: ReactNode; decrease?: ReactNode; increase?: ReactNode; shipping?: ReactNode; shippingReached?: ReactNode }

export type CartDrawerProps = {
  /** `cart.cost` y cada línea vienen de OPS; el cajón no calcula nada. */
  cart: Cart | null | undefined
  labels: CartDrawerLabels
  paths: CartDrawerPaths
  form?: CartDrawerFormContract
  /** Hook que da el formulario de cada línea. Por omisión `<form method="post">` (funciona sin JavaScript). */
  useLineForm?: () => CartDrawerLineForm
  shipping?: CartDrawerShipping | null
  /** Aviso fijo cuando no hay barra de envío (p. ej. "Envío gratis"). */
  notice?: ReactNode
  /** Sección "podría interesarte" (la tienda decide qué mostrar). */
  upsell?: ReactNode
  upsellTitle?: string
  renderLine?: (line: CartLine, defaults: { controls: ReactNode; price: ReactNode; image: ReactNode }) => ReactNode
  renderImage?: (line: CartLine) => ReactNode
  renderMoney?: (money: Money) => ReactNode
  renderLink?: (props: CartDrawerLinkProps) => ReactNode
  /** Omite el variante cuando es el valor por defecto de OPS ("Default Title"). */
  isDefaultVariantTitle?: (title: string) => boolean
  icons?: CartDrawerIcons
  /** Clases por pieza (además de los `data-sf-cart-*`), para tiendas con Tailwind. */
  classNames?: Partial<Record<CartDrawerSlot, string>>
  /** Textos de las filas provisionales y de los avisos (por omisión es-MX). */
  optimisticLabels?: Partial<CartDrawerOptimisticLabels>
  locale?: string
  /** Se llama al abrir/cerrar por cualquier vía. */
  onOpenChange?: (open: boolean) => void
}

const DEFAULT_FORM: Required<CartDrawerFormContract> = {
  intentField: 'intent',
  lineField: 'line_id',
  quantityField: 'quantity',
  updateIntent: 'update',
  removeIntent: 'remove',
}

const useNativeForm = (): CartDrawerLineForm => ({ Form: 'form' })

const defaultIsDefaultVariant = (t: string) => /^default title$/i.test(t.trim())

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return
    const el = document.documentElement
    const prev = el.style.overflow
    el.style.overflow = 'hidden'
    return () => {
      el.style.overflow = prev
    }
  }, [locked])
}

/**
 * Cajón lateral del carrito ("Tu carrito (N)"). Sin textos ni marca: todo llega por props.
 * Se monta una vez (en la raíz) y se abre con `openCartDrawer()` / `useCartDrawer()`.
 * `<dialog>` modal: `role="dialog"`, `aria-modal`, foco atrapado y devuelto al abridor, Esc y clic fuera cierran,
 * el fondo no hace scroll. Las mutaciones usan la acción de ruta de la tienda (formularios nativos que
 * funcionan sin JavaScript, o el `Form` de un fetcher con `useLineForm`). Estilos: `@asteby/storefront-react/cart.css`
 * (tokens de la tienda) y/o `classNames`.
 */
export function CartDrawer(props: CartDrawerProps) {
  const { cart, labels, paths, shipping, notice, upsell, upsellTitle, icons, classNames: cx = {}, onOpenChange } = props
  const locale = useResolvedLocale(props.locale)
  const { open } = useCartDrawer()
  const opt = useOptimisticCart()
  const ol = { ...DEFAULT_OPTIMISTIC_LABELS, ...props.optimisticLabels }
  const quiet = open && isQuietOpen()
  const titleId = useId()
  const upsellId = useId()
  const { ref, onBackdropClick } = useModalDialog({ open, onClose: () => closeCartDrawer() })
  useBodyScrollLock(open)
  useEffect(() => {
    onOpenChange?.(open)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const realLines = cart?.lines.length ?? 0
  const rollbackEmpty = open && quiet && realLines === 0 && opt.rows.length === 0 && opt.notices.length > 0
  useEffect(() => {
    // Sin filas y con un aviso de fallo, un cajón vacío abierto por la acción sería engañoso: se cierra.
    if (rollbackEmpty) closeCartDrawer()
  }, [rollbackEmpty])

  if (!open) return opt.notices.length ? <OptimisticNotices notices={opt.notices} labels={ol} classNames={cx} /> : null

  const money = props.renderMoney ?? ((m: Money) => formatMoney(m, locale))
  const link = props.renderLink ?? (({ href, className, children, onClick }: CartDrawerLinkProps) => (
    <a href={href} className={className} onClick={onClick}>{children}</a>
  ))
  const pendingByVariant = new Map(opt.rows.map((r) => [r.variantId, r]))
  const count = (cart?.total_quantity ?? 0) + opt.quantity
  const lines = cart?.lines ?? []
  const extraRows = opt.rows.filter((r) => !lines.some((l) => l.merchandise.id === r.variantId))
  const pending = opt.rows.length > 0
  const empty = lines.length === 0 && extraRows.length === 0
  const close = () => closeCartDrawer()

  return (
    <dialog
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onBackdropClick}
      onClose={close}
      className={cx.dialog}
      data-sf-cart-drawer=""
    >
      <div className={cx.panel} data-sf-cart-panel="">
        <div className={cx.header} data-sf-cart-header="">
          <h2 id={titleId} tabIndex={-1} className={cx.title} data-sf-cart-title="">
            {labels.title}{count > 0 ? ` (${count})` : ''}
          </h2>
          <button type="button" onClick={close} aria-label={labels.close} className={cx.close} data-sf-cart-close="" data-sf-autofocus={quiet ? undefined : ''}>
            {icons?.close ?? <span aria-hidden="true">✕</span>}
          </button>
        </div>

        <OptimisticNotices notices={opt.notices} labels={ol} classNames={cx} />
        <OptimisticStatus kind={opt.announcement.kind} n={opt.announcement.n} text={ol.added} />

        {empty ? (
          <div className={cx.empty} data-sf-cart-empty="">
            <p className={cx.emptyTitle} data-sf-cart-empty-title="">{labels.empty}</p>
            {labels.emptyHint ? <p className={cx.emptyHint} data-sf-cart-empty-hint="">{labels.emptyHint}</p> : null}
            {paths.browse && labels.browse ? link({ href: paths.browse, className: cx.browse, children: labels.browse, onClick: close }) : null}
          </div>
        ) : (
          <>
            <div className={cx.body} data-sf-cart-body="">
              {shipping ? (
                <div className={cx.shipping} data-sf-cart-shipping="" data-reached={shipping.reached || undefined}>
                  <p className={cx.shippingMessage}>
                    {shipping.reached ? icons?.shippingReached : icons?.shipping}
                    {shipping.message}
                  </p>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(shipping.percent)}
                    aria-label={shipping.progressLabel}
                    className={cx.bar}
                    data-sf-cart-bar=""
                  >
                    <div className={cx.barFill} data-sf-cart-bar-fill="" style={{ width: `${Math.max(0, Math.min(100, shipping.percent))}%` }} />
                  </div>
                </div>
              ) : notice ? (
                <p className={[cx.shipping, cx.shippingMessage].filter(Boolean).join(" ") || undefined} data-sf-cart-shipping="" data-notice="">{icons?.shippingReached}{notice}</p>
              ) : null}

              <ul className={cx.lines} data-sf-cart-lines="">
                {lines.map((line) => (
                  <DrawerLine key={line.id} line={line} props={props} money={money} link={link} close={close} pending={pendingByVariant.get(line.merchandise.id)} pendingLabel={ol.adding} />
                ))}
                {extraRows.map((row) => (
                  <PendingLine key={`pending-${row.variantId}`} row={row} props={props} money={money} label={ol.adding} />
                ))}
              </ul>

              {upsell ? (
                <section className={cx.upsell} data-sf-cart-upsell="" aria-labelledby={upsellTitle ? upsellId : undefined}>
                  {upsellTitle ? <h3 id={upsellId} className={cx.upsellTitle}>{upsellTitle}</h3> : null}
                  {upsell}
                </section>
              ) : null}
            </div>

            <div className={cx.footer} data-sf-cart-footer="">
              <div className={cx.subtotal} data-sf-cart-subtotal="" aria-busy={pending || undefined}>
                <span className={cx.subtotalLabel}>{labels.subtotal}</span>
                <span className={cx.subtotalValue} data-sf-cart-subtotal-value="">{cart ? money(cart.cost.subtotal) : null}{pending ? <span data-sf-cart-calculating="">{cart ? ' ' : ''}{ol.calculating}</span> : null}</span>
              </div>
              {labels.note ? <p className={cx.note} data-sf-cart-note="">{labels.note}</p> : null}
              <div className={cx.actions} data-sf-cart-actions="">
                {link({ href: paths.checkout, className: cx.checkout, children: labels.checkout, onClick: close })}
                {link({ href: paths.cart, className: cx.viewCart, children: labels.viewCart, onClick: close })}
              </div>
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}

function DrawerLine({
  line,
  props,
  money,
  link,
  close,
  pending,
  pendingLabel,
}: {
  pending?: OptimisticRow | undefined
  pendingLabel: string
  line: CartLine
  props: CartDrawerProps
  money: (m: Money) => ReactNode
  link: (p: CartDrawerLinkProps) => ReactNode
  close: () => void
}) {
  const { labels, paths, icons, classNames: cx = {} } = props
  const f = { ...DEFAULT_FORM, ...props.form }
  const { Form, formData } = (props.useLineForm ?? useNativeForm)()
  const quantity = formData ? Number(formData.get(f.quantityField) ?? 0) : line.quantity + (pending?.quantity ?? 0)
  if (formData && (formData.get(f.intentField) === f.removeIntent || quantity === 0)) return null

  const merch = line.merchandise
  const isDefault = props.isDefaultVariantTitle ?? defaultIsDefaultVariant
  const title = merch.product.title
  const href = paths.product?.(merch.product.handle, merch.id)
  const img = merch.image ?? merch.product.featured_image
  const image = props.renderImage ? props.renderImage(line) : img ? (
    <img src={img.url} alt={img.alt ?? ''} width={80} height={80} loading="lazy" decoding="async" />
  ) : null

  const imageNode = <span className={cx.image} data-sf-cart-image="">{image}</span>
  const price = <span className={cx.price} data-sf-cart-price="">{money(line.cost.total)}</span>
  const controls = (
    <div className={cx.controls} data-sf-cart-controls="">
      <Form method="post" action={paths.cart} className={cx.qty} data-sf-cart-qty="">
        <input type="hidden" name={f.intentField} value={f.updateIntent} />
        <input type="hidden" name={f.lineField} value={line.id} />
        <button type="submit" name={f.quantityField} value={quantity - 1} aria-label={labels.decrease} className={cx.qtyButton} data-sf-cart-qty-button="">
          {icons?.decrease ?? <span aria-hidden="true">−</span>}
        </button>
        <span className={cx.qtyValue} aria-live="polite" data-sf-cart-qty-value="">{quantity}</span>
        <button type="submit" name={f.quantityField} value={quantity + 1} aria-label={labels.increase} className={cx.qtyButton} data-sf-cart-qty-button="">
          {icons?.increase ?? <span aria-hidden="true">+</span>}
        </button>
      </Form>
      <Form method="post" action={paths.cart} data-sf-cart-remove-form="">
        <input type="hidden" name={f.intentField} value={f.removeIntent} />
        <input type="hidden" name={f.lineField} value={line.id} />
        <button type="submit" className={cx.remove} data-sf-cart-remove="">{labels.remove}</button>
      </Form>
    </div>
  )

  if (props.renderLine) return <li key={line.id} className={cx.line} data-sf-cart-line="">{props.renderLine(line, { controls, price, image: imageNode })}</li>

  return (
    <li className={cx.line} data-sf-cart-line="">
      {imageNode}
      <div className={cx.lineMain} data-sf-cart-line-main="">
        <div className={cx.lineHead} data-sf-cart-line-head="">
          <div className={cx.lineText} data-sf-cart-line-text="">
            {href ? link({ href, className: cx.lineTitle, children: title, onClick: close }) : <span className={cx.lineTitle} data-sf-cart-line-title="">{title}</span>}
            {!isDefault(merch.title) ? <p className={cx.variant} data-sf-cart-variant="">{merch.title}</p> : null}
          </div>
          {price}
        </div>
        {controls}
        {pending ? <p className={cx.variant} data-sf-cart-pending-label="">{pendingLabel}</p> : null}
      </div>
    </li>
  )
}

/** Fila que existe solo en el navegador hasta que OPS la confirma: sin controles, con el precio unitario mostrado. */
function PendingLine({ row, props, money, label }: { row: OptimisticRow; props: CartDrawerProps; money: (m: Money) => ReactNode; label: string }) {
  const { classNames: cx = {} } = props
  const isDefault = props.isDefaultVariantTitle ?? defaultIsDefaultVariant
  return (
    <li className={cx.line} data-sf-cart-line="" data-sf-cart-line-pending="" aria-busy="true">
      <span className={cx.image} data-sf-cart-image="">
        {row.image ? <img src={row.image.url} alt={row.image.alt ?? ''} width={80} height={80} decoding="async" /> : null}
      </span>
      <div className={cx.lineMain} data-sf-cart-line-main="">
        <div className={cx.lineHead} data-sf-cart-line-head="">
          <div className={cx.lineText} data-sf-cart-line-text="">
            <span className={cx.lineTitle} data-sf-cart-line-title="">{row.title}</span>
            {row.variantTitle && !isDefault(row.variantTitle) ? <p className={cx.variant} data-sf-cart-variant="">{row.variantTitle}</p> : null}
          </div>
          {row.price ? <span className={cx.price} data-sf-cart-price="">{money(row.price)}</span> : null}
        </div>
        <p className={cx.variant} data-sf-cart-pending-label="">{label} · ×{row.quantity}</p>
      </div>
    </li>
  )
}

/** Región `aria-live="polite"`: anuncia «Agregado al carrito». Alterna un espacio fino para repetir el mismo texto. */
function OptimisticStatus({ kind, n, text }: { kind: 'added' | null; n: number; text: string }) {
  return (
    <div role="status" aria-live="polite" data-sf-cart-status="" style={VISUALLY_HIDDEN}>
      {kind === 'added' ? `${text}${n % 2 ? '' : '\u200B'}` : ''}
    </div>
  )
}

const VISUALLY_HIDDEN = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const

/** Avisos de fallo (`role="alert"`, assertive), descartables. Se pintan dentro del cajón abierto o, si está cerrado, sueltos. */
function OptimisticNotices({ notices, labels, classNames: cx }: { notices: readonly OptimisticNotice[]; labels: CartDrawerOptimisticLabels; classNames: Partial<Record<CartDrawerSlot, string>> }) {
  return (
    <div role="alert" aria-live="assertive" data-sf-cart-notices="" className={cx.notices}>
      {notices.map((n) => (
        <p key={n.id} data-sf-cart-notice="">
          <span>{labels.failed(n.title, n.reason)}</span>
          <button type="button" onClick={() => cartOptimistic.dismissNotice(n.id)} aria-label={labels.dismiss} data-sf-cart-notice-dismiss="">
            <span aria-hidden="true">✕</span>
          </button>
        </p>
      ))}
    </div>
  )
}
