import type { CSSProperties } from 'react'
import { useResolvedLocale } from '../locale.js'
import { contactMessages, type ContactMessages } from './messages.js'
import { isHiddenPath, whatsappUrl } from './url.js'

export type WhatsAppBubbleClassNames = Partial<Record<'root' | 'icon', string>>

export type WhatsAppBubbleProps = {
  /** The WhatsApp number with its country code (`+525551046865`). Nothing is rendered when it is empty or too short. */
  phone: string | null | undefined
  /** Pre-filled text of the chat; the locale's default when omitted. Pass `''` for none. */
  message?: string
  /** Accessible name (and tooltip) of the link; the locale's default when omitted. */
  label?: string
  position?: 'bottom-right' | 'bottom-left'
  /** Extra distance above the bottom edge (a number is px), to clear a fixed bar of the page. */
  offset?: number | string
  /** Current path of the page; with `hideOn` it decides whether the bubble is shown (the SDK has no router). */
  pathname?: string | null
  /** Paths where the bubble is not shown: a string hides it and everything below it (`/pagar`), a RegExp is tested as is. */
  hideOn?: ReadonlyArray<string | RegExp>
  locale?: string
  messages?: Partial<ContactMessages>
  classNames?: WhatsAppBubbleClassNames
}

const px = (v: number | string): string => (typeof v === 'number' ? `${v}px` : v)

/** The WhatsApp glyph (decorative: the link carries the accessible name). */
function Glyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" width="28" height="28" aria-hidden="true" focusable="false" fill="currentColor">
      <path d="M16.04 3C9.4 3 4 8.4 4 15.03c0 2.12.56 4.19 1.62 6.02L4 28l7.1-1.86a12.02 12.02 0 0 0 4.94 1.06h.01C22.68 27.2 28 21.8 28 15.17 28 8.4 22.7 3 16.04 3Zm0 21.9h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.21-4.21 1.1 1.12-4.1-.24-.38a9.87 9.87 0 0 1-1.52-5.27c0-5.45 4.44-9.89 9.9-9.89 2.64 0 5.12 1.03 6.98 2.9a9.83 9.83 0 0 1 2.9 7c0 5.46-4.44 9.9-9.9 9.9Zm5.43-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  )
}

/**
 * Floating WhatsApp button. A plain `<a>` (works without JavaScript) that opens the chat in a new tab. It renders nothing
 * without a usable number, so a store that does not configure one is untouched. Fixed to the bottom corner with the device's
 * safe areas and without viewport-width math (a scrollbar never pushes it). Style it with the `--sf-whatsapp-*` variables of
 * `@asteby/storefront-react/contact.css` or with `classNames`.
 */
export function WhatsAppBubble({ phone, message, label, position = 'bottom-right', offset, pathname, hideOn, locale, messages, classNames }: WhatsAppBubbleProps) {
  const loc = useResolvedLocale(locale)
  const m = contactMessages(loc, messages)
  if (isHiddenPath(pathname, hideOn)) return null
  const href = whatsappUrl(phone, message ?? m['whatsapp.message'])
  if (!href) return null
  const name = label ?? m['whatsapp.label']
  const style = offset === undefined ? undefined : ({ '--sf-whatsapp-offset': px(offset) } as CSSProperties)
  return (
    <a
      data-sf-whatsapp-bubble=""
      data-position={position}
      className={classNames?.root}
      style={style}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={name}
      title={name}
    >
      <Glyph className={classNames?.icon} />
    </a>
  )
}
