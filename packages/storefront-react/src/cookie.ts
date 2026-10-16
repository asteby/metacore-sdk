/** Default name of the cookie that holds the cart id. */
export const CART_COOKIE_NAME = 'sf_cart'

export type CartCookieOptions = {
  /** Cookie name (default `sf_cart`). */
  name?: string
  /** Lifetime in days (default 30). */
  maxAgeDays?: number
  path?: string
  domain?: string
  sameSite?: 'Lax' | 'Strict' | 'None'
  /** Defaults to true on https pages / when `sameSite` is `None`. */
  secure?: boolean
}

/**
 * Reads the cart id from a `Cookie` header. Use it in SSR loaders:
 * `getCartIdFromCookie(request.headers.get('Cookie'))`.
 */
export function getCartIdFromCookie(cookieHeader: string | null | undefined, name: string = CART_COOKIE_NAME): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== name) continue
    const raw = part.slice(eq + 1).trim().replace(/^"(.*)"$/, '$1')
    if (!raw) return null
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return null
}

/**
 * Serializes the cart cookie for a `Set-Cookie` header (SSR actions) or for
 * `document.cookie`. Pass `null` to clear it.
 */
export function serializeCartCookie(cartId: string | null, options: CartCookieOptions = {}): string {
  const name = options.name ?? CART_COOKIE_NAME
  const parts = [`${name}=${cartId ? encodeURIComponent(cartId) : ''}`]
  parts.push(`Path=${options.path ?? '/'}`)
  const maxAge = cartId ? Math.round((options.maxAgeDays ?? 30) * 86_400) : 0
  parts.push(`Max-Age=${maxAge}`)
  if (options.domain) parts.push(`Domain=${options.domain}`)
  const sameSite = options.sameSite ?? 'Lax'
  parts.push(`SameSite=${sameSite}`)
  if (options.secure ?? sameSite === 'None') parts.push('Secure')
  return parts.join('; ')
}

/** Browser-only: writes the cart cookie. No-op on the server. */
export function writeCartCookie(cartId: string | null, options: CartCookieOptions = {}): void {
  if (typeof document === 'undefined') return
  const secure = options.secure ?? (typeof location !== 'undefined' && location.protocol === 'https:')
  document.cookie = serializeCartCookie(cartId, { ...options, secure })
}

/** Browser-only: reads the cart cookie. `null` on the server. */
export function readCartCookie(name: string = CART_COOKIE_NAME): string | null {
  if (typeof document === 'undefined') return null
  return getCartIdFromCookie(document.cookie, name)
}
