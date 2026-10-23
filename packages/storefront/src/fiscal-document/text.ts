/**
 * Text helpers of the rules engine. Pure; no DOM, no network.
 */

const FOLD: Record<string, string> = {}
for (const [from, to] of [
  ['áàâãä', 'a'], ['éèêë', 'e'], ['íìîï', 'i'], ['óòôõö', 'o'], ['úùûü', 'u'], ['ñ', 'n'], ['ç', 'c'],
] as const) for (const ch of from) FOLD[ch] = to

/** Lowercases, strips Latin accents and collapses whitespace; the base of every phrase comparison (punctuation is kept). */
export function foldText(s: string): string {
  let out = ''
  for (const ch of s.toLowerCase()) out += FOLD[ch] ?? ch
  return out.split(/\s+/).filter(Boolean).join(' ')
}

/** Whole days from `iso` (`YYYY-MM-DD`) to `now`; `null` for an invalid date. Negative: in the future. */
export function ageInDays(isoDate: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) return null
  const then = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.floor((today - then) / 86_400_000)
}

/** Hex SHA-256 of the bytes (Web Crypto: browsers, Node 20+, edge runtimes). */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle
  if (!subtle) throw new TypeError('sha256Hex: Web Crypto (crypto.subtle) is not available')
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const digest = await subtle.digest('SHA-256', bytes as unknown as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
