import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { useResolvedLocale } from '../locale.js'
import { whatsappText, type WhatsAppContext, type WhatsAppOpenEvent } from './context.js'
import { contactMessages, type ContactMessages } from './messages.js'
import { whatsappUrl } from './url.js'

export type WhatsAppLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target' | 'rel'> & {
  /** The WhatsApp number with its country code. Nothing is rendered when it is empty or too short. */
  phone: string | null | undefined
  /** Pre-filled text; wins over `context`. Pass `''` for none. */
  message?: string
  /** Where the shopper is (product, cart, order): picks the pre-filled text. */
  context?: WhatsAppContext | null
  /** What to show; «Escríbenos por WhatsApp» (or its override) by default. */
  children?: ReactNode
  /** Called when the shopper opens the chat (analytics). Never blocks the link. */
  onOpen?: (event: WhatsAppOpenEvent) => void
  locale?: string
  messages?: Partial<ContactMessages>
}

/**
 * An inline WhatsApp link (a button of the page, «Escríbenos»…): the same number rules and pre-filled texts as the bubble,
 * styled by the store. A plain `<a>` that opens the chat in a new tab; renders nothing without a usable number.
 */
export function WhatsAppLink({ phone, message, context, children, onOpen, onClick, locale, messages, ...rest }: WhatsAppLinkProps) {
  const loc = useResolvedLocale(locale)
  const m = contactMessages(loc, messages)
  const href = whatsappUrl(phone, message ?? whatsappText(context, m))
  if (!href) return null
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    onOpen?.({ phone: phone ?? '', context: context?.kind ?? 'generic', source: 'link' })
  }
  return (
    <a data-sf-whatsapp-link="" {...rest} href={href} target="_blank" rel="noopener noreferrer" onClick={onClick || onOpen ? handle : undefined}>
      {children ?? m['whatsapp.label']}
    </a>
  )
}
