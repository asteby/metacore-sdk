/** Digits of a phone number (`+52 55 5104 6865` → `525551046865`). */
export function phoneDigits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '')
}

/** A number is usable when it has at least 8 digits (shorter ones are not a callable number). */
export function isUsablePhone(phone: string | null | undefined): boolean {
  return phoneDigits(phone).length >= 8
}

/**
 * `https://wa.me/<digits>` link of a WhatsApp number, with the optional pre-filled text encoded; `null` when the number is not
 * usable. The number must carry its country code (`+52…`): wa.me does not guess it.
 */
export function whatsappUrl(phone: string | null | undefined, text?: string | null): string | null {
  const digits = phoneDigits(phone)
  if (digits.length < 8) return null
  const t = (text ?? '').trim()
  return t ? `https://wa.me/${digits}?text=${encodeURIComponent(t)}` : `https://wa.me/${digits}`
}

/** `tel:` link of a phone number (keeps a leading `+`), or `null` when the number is not usable. */
export function telHref(phone: string | null | undefined): string | null {
  const digits = phoneDigits(phone)
  if (digits.length < 8) return null
  return `tel:${(phone ?? '').trim().startsWith('+') ? '+' : ''}${digits}`
}

/**
 * Whether `pathname` is covered by a `hideOn` entry. A string matches the path itself and everything below it at a segment
 * boundary (`/pagar` hides `/pagar` and `/pagar/gracias`, not `/pagarx`); a RegExp is tested as is. No pathname → shown.
 */
export function isHiddenPath(pathname: string | null | undefined, hideOn: ReadonlyArray<string | RegExp> | undefined): boolean {
  if (!pathname || !hideOn || hideOn.length === 0) return false
  const p = pathname.split('?')[0]!.split('#')[0]!
  return hideOn.some((rule) => {
    if (typeof rule !== 'string') return rule.test(p)
    const r = rule.endsWith('/') && rule.length > 1 ? rule.slice(0, -1) : rule
    return p === r || p.startsWith(`${r}/`)
  })
}
