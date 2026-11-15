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

/** What an `onOpen` callback receives (analytics): the number used and the context of the chat. */
export type WhatsAppOpenEvent = { phone: string; context: WhatsAppContext['kind']; source: 'bubble' | 'link'; label?: string }
