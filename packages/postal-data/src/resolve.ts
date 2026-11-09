import { lookupMxPostalCode } from './mx'
import { lookupUsPostalCode } from './us'
import type { PostalInfo } from './types'

export type ResolvePostalOptions = {
  /** ISO 3166-1 alpha-2 of the market the buyer is in (`MX`, `US`; case insensitive). */
  country: string
  zip: string
  /**
   * The official catalog for MEXICO (OPS' region pack: `storefront.postalCode(zip)`). Asked first; the offline catalog
   * answers only when it throws, times out or does not know the code. Never asked for a US ZIP: OPS' catalog is Mexican
   * and a ZIP like 90210 would match a Mexican code and name the wrong state.
   */
  official?: (zip: string, ctx: { signal: AbortSignal }) => Promise<PostalInfo | null | undefined>
  /** Cap for `official`, short on purpose: the buyer waits for the autocomplete while typing. Default 3000 ms. */
  officialTimeoutMs?: number
}

export type ResolvedPostal = {
  info: PostalInfo | null
  /** Who answered: the official catalog, the offline fallback, or nobody. */
  source: 'official' | 'offline' | null
  /** The official catalog was asked and failed (error or timeout): the caller should cache a miss only briefly. */
  officialFailed: boolean
}

/**
 * One rule for every shop: US -> offline ZIP catalog; MX -> official first, offline fallback; other markets -> nothing
 * (the form accepts what the buyer types). No HTTP concerns here: the shop's route owns cache headers and the client.
 */
export async function resolvePostalCode(opts: ResolvePostalOptions): Promise<ResolvedPostal> {
  const country = opts.country.trim().toUpperCase()
  const zip = opts.zip.trim()
  if (country === 'US') {
    const info = await lookupUsPostalCode(zip).catch(() => null)
    return { info, source: info ? 'offline' : null, officialFailed: false }
  }
  if (country !== 'MX' || !/^\d{5}$/.test(zip)) return { info: null, source: null, officialFailed: false }
  let officialFailed = false
  if (opts.official) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), opts.officialTimeoutMs ?? 3000)
    try {
      const official = await Promise.race([
        opts.official(zip, { signal: ctrl.signal }),
        new Promise<never>((_, reject) => ctrl.signal.addEventListener('abort', () => reject(new Error('timeout')))),
      ])
      if (official) return { info: official, source: 'official', officialFailed: false }
    } catch {
      officialFailed = true
    } finally {
      clearTimeout(timer)
    }
  }
  const info = await lookupMxPostalCode(zip).catch(() => null)
  return { info, source: info ? 'offline' : null, officialFailed: officialFailed && !info }
}
