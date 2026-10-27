/**
 * Process-local guard of the invoice file route (`invoiceFileResponse`): the store's server never forwards a flood.
 *
 *  - ceiling: `limit` requests per `windowMs` per buyer + order + document + kind (default 6 / 60 s), answered 429
 *    with `Retry-After` BEFORE anything is asked of OPS;
 *  - single-flight: identical requests in flight share one upstream call (a double click is one PDF, not two);
 *  - memory: the answer is kept `cacheMs` (default 60 s) for that same buyer, so «Ver factura» followed by «Descargar»
 *    does not render the PDF twice. Private to the buyer (the key carries a hash of the session), small and bounded,
 *    and the HTTP response stays `private, no-store`: nothing is cached by the browser or a proxy.
 *
 * Needs `buyer` (any per-session secret, e.g. the customer token): it is hashed, never stored. Without it the guard is
 * off (a key without an owner could serve one buyer another's file).
 */
export type FileGuardOptions = {
  /** Per-session secret that scopes every key to one buyer. */
  buyer: string | null | undefined
  limit?: number
  windowMs?: number
  cacheMs?: number
  /** Clock, for tests. */
  now?: () => number
}

type Entry<T> = { at: number; value: T }

const MAX_KEYS = 2000
const MAX_CACHE = 16
const hits = new Map<string, number[]>()
const cache = new Map<string, Entry<unknown>>()
const flights = new Map<string, Promise<unknown>>()

async function sha(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function fileGuardKey(buyer: string, ...parts: string[]): Promise<string> {
  return sha(`${buyer.length}:${buyer}|${parts.map((p) => `${p.length}:${p}`).join('|')}`)
}

/** `null` = allowed (and counted). Otherwise the seconds to wait. */
export function takeHit(key: string, limit: number, windowMs: number, now: number): number | null {
  if (hits.size >= MAX_KEYS) {
    for (const [k, ts] of hits) if (!ts.length || now - ts[ts.length - 1]! >= windowMs) hits.delete(k)
    if (hits.size >= MAX_KEYS) hits.clear()
  }
  const kept = (hits.get(key) ?? []).filter((t) => now - t < windowMs && t <= now)
  if (kept.length >= limit) {
    hits.set(key, kept)
    return Math.max(1, Math.ceil((kept[0]! + windowMs - now) / 1000))
  }
  kept.push(now)
  hits.set(key, kept)
  return null
}

/** Runs `load` once for concurrent callers of `key`, and remembers a non-null answer for `cacheMs`. */
export async function once<T>(key: string, cacheMs: number, now: number, load: () => Promise<T>, fits: (v: T) => boolean = () => true): Promise<T> {
  const hit = cache.get(key) as Entry<T> | undefined
  if (hit && now - hit.at < cacheMs && hit.at <= now) return hit.value
  const live = flights.get(key) as Promise<T> | undefined
  if (live) return live
  const p = load()
    .then((v) => {
      if (v != null && cacheMs > 0 && fits(v)) {
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
        cache.set(key, { at: now, value: v })
      }
      return v
    })
    .finally(() => flights.delete(key))
  flights.set(key, p)
  return p
}

/** Tests. */
export function resetFileGuard(): void {
  hits.clear()
  cache.clear()
  flights.clear()
}
