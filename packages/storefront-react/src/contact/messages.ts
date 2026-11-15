/** Texts of the contact components (es / en). Every key can be overridden with the `messages` prop. */
const es = {
  'whatsapp.label': 'Escríbenos por WhatsApp',
  'whatsapp.message': 'Hola, necesito ayuda con mi compra.',
  /** Pre-filled text from a product page. `{title}`, `{sku}` (already « (SKU …)» or empty) and `{url}`. */
  'whatsapp.message.product': 'Hola, me interesa {title}{sku}. {url}',
  /** Pre-filled text from the cart. `{count}` items and `{total}` (formatted by the store). */
  'whatsapp.message.cart': 'Hola, tengo {count} artículo(s) en mi carrito ({total}) y quiero ayuda para comprar.',
  /** Pre-filled text about an order. `{number}`. */
  'whatsapp.message.order': 'Hola, tengo una duda sobre mi pedido {number}.',
  /** Heading of the branch menu when the store has several WhatsApp numbers. */
  'whatsapp.choose': '¿Con qué sucursal quieres hablar?',
  'phone.label': 'Llámanos al {phone}',
}

const en: typeof es = {
  'whatsapp.label': 'Chat with us on WhatsApp',
  'whatsapp.message': 'Hi, I need help with my order.',
  'whatsapp.message.product': "Hi, I'm interested in {title}{sku}. {url}",
  'whatsapp.message.cart': 'Hi, I have {count} item(s) in my cart ({total}) and I need help to buy.',
  'whatsapp.message.order': 'Hi, I have a question about my order {number}.',
  'whatsapp.choose': 'Which store do you want to chat with?',
  'phone.label': 'Call us at {phone}',
}

export type ContactMessages = typeof es
export type ContactMessageKey = keyof ContactMessages

/** The messages of a locale (`en*` → English, anything else → Spanish) with the host's overrides on top. */
export function contactMessages(locale: string, overrides?: Partial<ContactMessages>): ContactMessages {
  const base = /^en\b/i.test(locale) ? en : es
  return overrides ? { ...base, ...overrides } : base
}

export function fillContactText(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ''))
}
