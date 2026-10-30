import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { useResolvedLocale } from '../locale.js'
import { contactMessages, fillContactText, type ContactMessages } from './messages.js'
import { telHref } from './url.js'

export type PhoneLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'> & {
  /** The number as the store keeps it (`+52 55 5104 6865`). Nothing is rendered when it is empty or too short. */
  phone: string | null | undefined
  /** What to show; the number itself by default. */
  children?: ReactNode
  locale?: string
  messages?: Partial<ContactMessages>
}

/** A `tel:` link: works without JavaScript, and reads «Llámanos al …» to screen readers. */
export function PhoneLink({ phone, children, locale, messages, className, ...rest }: PhoneLinkProps) {
  const loc = useResolvedLocale(locale)
  const href = telHref(phone)
  if (!href) return null
  const shown = (phone ?? '').trim()
  const m = contactMessages(loc, messages)
  return (
    <a data-sf-phone-link="" {...rest} href={href} className={className} aria-label={fillContactText(m['phone.label'], { phone: shown })}>
      {children ?? shown}
    </a>
  )
}
