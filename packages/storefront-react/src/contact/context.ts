import { fillContactText, type ContactMessages } from './messages.js'

/**
 * Where the shopper opens WhatsApp from: the pre-filled text names what they are looking at, so the store does not have to
 * ask. Every text comes from the `whatsapp.message*` messages (overridable per store).
 */
export type WhatsAppContext =
  | { kind: 'generic' }
  | { kind: 'product'; title: string; sku?: string | null; url?: string | null }
  | { kind: 'cart'; count: number; total?: string | null }
  | { kind: 'order'; number: string }

/** The pre-filled chat text of a context. Extra whitespace (an empty `{sku}` or `{url}`) is collapsed. */
export function whatsappText(context: WhatsAppContext | null | undefined, m: ContactMessages): string {
  const tidy = (s: string) => s.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').replace(/\s+([.,)])/g, '$1').trim()
  switch (context?.kind) {
    case 'product':
      return tidy(
        fillContactText(m['whatsapp.message.product'], {
          title: context.title.trim(),
          sku: context.sku?.trim() ? ` (SKU ${context.sku.trim()})` : '',
          url: context.url?.trim() ?? '',
        }),
      )
    case 'cart':
      return tidy(fillContactText(m['whatsapp.message.cart'], { count: context.count, total: context.total?.trim() ?? '' }))
    case 'order':
      return tidy(fillContactText(m['whatsapp.message.order'], { number: context.number.trim() }))
    default:
      return m['whatsapp.message']
  }
}

type Loose = Record<string, unknown> | null | undefined
const obj = (v: unknown): Loose => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null)

export type WhatsAppContextOptions = {
  /** Absolute URL of a product page from its handle (the store's routes); without it the text carries no link. */
  productUrl?: (handle: string) => string
  /** How a money total reads (`{ amount, currency_code }`); `Intl` currency format of `locale` by default. */
  formatMoney?: (money: { amount: string; currency_code: string }) => string
  locale?: string
}

/**
 * The chat context of the page from the router's loader data (`useMatches().map((m) => m.loaderData)`, outermost first): the
 * deepest `product`, `order` or non-empty `cart` wins; anything else is `generic`. Pure: the SDK has no router.
 */
export function whatsappContextFrom(entries: ReadonlyArray<unknown>, options: WhatsAppContextOptions = {}): WhatsAppContext {
  const money =
    options.formatMoney ??
    ((m: { amount: string; currency_code: string }) => {
      try {
        return new Intl.NumberFormat(options.locale ?? 'es-MX', { style: 'currency', currency: m.currency_code }).format(Number(m.amount))
      } catch {
        return `${m.amount} ${m.currency_code}`
      }
    })
  for (let i = entries.length - 1; i >= 0; i--) {
    const data = obj(entries[i])
    if (!data) continue
    const product = obj(data.product)
    if (product && typeof product.title === 'string' && product.title.trim()) {
      const variants = Array.isArray(product.variants) ? product.variants : []
      const sku = variants.length === 1 ? obj(variants[0])?.sku : null
      const handle = typeof product.handle === 'string' ? product.handle : ''
      return {
        kind: 'product',
        title: product.title,
        sku: typeof sku === 'string' ? sku : null,
        url: handle && options.productUrl ? options.productUrl(handle) : null,
      }
    }
    const order = obj(data.order)
    if (order && typeof order.number === 'string' && order.number.trim()) return { kind: 'order', number: order.number }
    const cart = obj(data.cart)
    const count = typeof cart?.total_quantity === 'number' ? cart.total_quantity : 0
    if (cart && count > 0) {
      const total = obj(obj(cart.cost)?.total)
      const t = total && typeof total.amount === 'string' && typeof total.currency_code === 'string' ? money(total as { amount: string; currency_code: string }) : null
      return { kind: 'cart', count, total: t }
    }
  }
  return { kind: 'generic' }
}

/** What an `onOpen` callback receives (analytics): the number used and the context of the chat. */
export type WhatsAppOpenEvent = { phone: string; context: WhatsAppContext['kind']; source: 'bubble' | 'link'; label?: string }
