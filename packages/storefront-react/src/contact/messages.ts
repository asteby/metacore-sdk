/** Texts of the contact components (es / en). Every key can be overridden with the `messages` prop. */
const es = {
  'whatsapp.label': 'Escríbenos por WhatsApp',
  'whatsapp.message': 'Hola, necesito ayuda con mi compra.',
  'phone.label': 'Llámanos al {phone}',
}

const en: typeof es = {
  'whatsapp.label': 'Chat with us on WhatsApp',
  'whatsapp.message': 'Hi, I need help with my order.',
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
