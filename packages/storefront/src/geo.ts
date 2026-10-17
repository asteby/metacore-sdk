/**
 * Geo helpers: pure TypeScript, no network and no DOM. Works in Node 20, edge
 * runtimes and browsers. Behaviour is pinned by `geo-vectors.json`, which the
 * Go side copies verbatim, so keep both implementations in sync.
 */

export type GeoPoint = { lat: number; lng: number }

/** `(0, 0)` means "unset" on this platform, so it is never a valid point. */
type MaybePoint = { lat?: number | null; lng?: number | null } | null | undefined

export type OpeningHours = {
  /** `day`: 1 = Monday ... 7 = Sunday. Several entries per day are allowed. A `close` at or before `open` crosses midnight. */
  weekly: { day: number; open: string; close: string }[]
  /** Dated overrides of the weekly rule. `closed`, or both `open` and `close`. */
  exceptions?: { date: string; closed?: true; open?: string; close?: string; note?: string }[]
}

export type OpenStatus = {
  open: boolean
  /** ISO instant (UTC) when the current interval ends; `null` when closed. */
  closesAt: string | null
  /** ISO instant (UTC) of the next opening; `null` when open or none within 8 days. */
  nextOpenAt: string | null
}

const RAD = Math.PI / 180

/** Great-circle distance in km (haversine, earth radius 6371.0088 km). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLng = (b.lng - a.lng) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * 6371.0088 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** Finite, in range and not the `(0, 0)` "unset" pair. */
export function isValidPoint(p: MaybePoint): p is GeoPoint {
  const { lat, lng } = p ?? {}
  // Number.isFinite is false for null, undefined and non-numbers.
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat!) <= 90 && Math.abs(lng!) <= 180 && !(lat === 0 && lng === 0)
}

/** `'19.43,-99.13'` (spaces allowed) to a point; `null` when malformed or invalid. */
export function parseLatLng(s: string | null | undefined): GeoPoint | null {
  const [a, b, ...rest] = (s ?? '').split(',')
  const p = !rest.length && a?.trim() && b?.trim() ? { lat: Number(a), lng: Number(b) } : null
  return isValidPoint(p) ? p : null
}

export type RankOptions<T> = {
  /** Keep items at most this far away (inclusive). */
  radiusKm?: number
  /** Keep the first N after sorting. */
  limit?: number
  /** Defaults to reading `lat` / `lng` from the item. */
  getPoint?: (item: T) => MaybePoint
}

/**
 * Sorts by distance from `origin` (stable: ties keep input order). Items without
 * a valid point are EXCLUDED, not placed last, because they have no distance.
 */
export function rankByDistance<T>(
  items: readonly T[],
  origin: GeoPoint,
  { radiusKm, limit, getPoint = (i) => i as MaybePoint }: RankOptions<T> = {},
): { item: T; distanceKm: number }[] {
  const out: { item: T; distanceKm: number }[] = []
  for (const item of items) {
    const p = getPoint(item)
    if (!isValidPoint(p)) continue
    const d = distanceKm(origin, p)
    if (radiusKm === undefined || d <= radiusKm) out.push({ item, distanceKm: d })
  }
  // Array.prototype.sort is stable (ES2019), so ties keep input order.
  out.sort((x, y) => x.distanceKm - y.distanceKm)
  return limit === undefined ? out : out.slice(0, Math.max(0, limit))
}

/** Under 1 km: meters rounded to 50 m. Otherwise km with one decimal. */
export function formatDistance(km: number, locale = 'es-MX'): string {
  const m = Math.round((km * 1000) / 50) * 50
  const [value, unit, digits] = m < 1000 ? [m, 'meter', 0] : [km, 'kilometer', 1]
  return new Intl.NumberFormat(locale, {
    style: 'unit', unit, minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(value)
}

/** Destination for directions: coordinates when valid, else the address text. */
export function directionsUrl(
  location: { lat?: number | null; lng?: number | null; address?: string | null; city?: string | null },
  { provider = 'google' }: { provider?: 'google' | 'apple' | 'geo' } = {},
): string | null {
  const ll = isValidPoint(location) ? `${location.lat},${location.lng}` : null
  const text = [location.address, location.city].filter(Boolean).join(', ')
  const dest = ll ?? text
  if (!dest) return null
  const q = encodeURIComponent(dest)
  if (provider === 'apple') return `https://maps.apple.com/?daddr=${q}`
  if (provider === 'geo') return ll ? `geo:${ll}?q=${ll}` : `geo:0,0?q=${q}`
  return `https://www.google.com/maps/dir/?api=1&destination=${q}`
}

// --- opening hours -------------------------------------------------------

const toMin = (t: string | undefined): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t ?? '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}

type Iv = [number, number]

/** Intervals in minutes; an end at or before the start crosses midnight. */
const interval = (open: string | undefined, close: string | undefined): Iv[] => {
  const s = toMin(open)
  let e = toMin(close)
  if (Number.isNaN(s) || Number.isNaN(e)) return []
  if (e <= s) e += 1440
  return [[s, e]]
}

const dayIntervals = (h: OpeningHours, day: number, date: string): Iv[] => {
  const x = h.exceptions?.find((e) => e.date === date)
  if (x?.closed) return []
  if (x && x.open && x.close) return interval(x.open, x.close)
  return h.weekly.filter((w) => w.day === day).flatMap((w) => interval(w.open, w.close))
}

/**
 * Whether the place is open at `now` in the IANA `timeZone` (throws RangeError
 * for an unknown zone). Looks 8 days ahead for the next opening. Handles
 * intervals crossing midnight, several per day, dated exceptions and DST.
 */
export function openStatus(hours: OpeningHours, timeZone: string, now: Date = new Date()): OpenStatus {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  })
  // Wall-clock minutes since the epoch as seen in `timeZone`.
  const wall = (ms: number): number => {
    const p: Record<string, number> = {}
    for (const { type, value } of fmt.formatToParts(ms)) p[type] = Number(value)
    return Date.UTC(p.year!, p.month! - 1, p.day!, (p.hour ?? 0) % 24, p.minute!) / 60000
  }
  const nowMs = now.getTime()
  const w = wall(nowMs)
  const day0 = Math.floor(w / 1440) * 1440
  // Offset from UTC, in minutes, at an instant.
  const offset = (ms: number): number => wall(ms) - Math.floor(ms / 60000)
  const toInstant = (t: number): string => {
    const guess = (t - offset(nowMs)) * 60000
    return new Date((t - offset(guess)) * 60000).toISOString()
  }

  const all: Iv[] = []
  for (let d = -1; d <= 8; d++) {
    const at = new Date((day0 + d * 1440) * 60000)
    const day = at.getUTCDay() || 7
    for (const [s, e] of dayIntervals(hours, day, at.toISOString().slice(0, 10))) all.push([day0 + d * 1440 + s, day0 + d * 1440 + e])
  }
  all.sort((a, b) => a[0] - b[0])
  const merged: Iv[] = []
  for (const iv of all) {
    const last = merged[merged.length - 1]
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1])
    else merged.push([iv[0], iv[1]])
  }
  const current = merged.find(([s, e]) => s <= w && w < e)
  if (current) return { open: true, closesAt: toInstant(current[1]), nextOpenAt: null }
  const next = merged.find(([s]) => s > w)
  return { open: false, closesAt: null, nextOpenAt: next ? toInstant(next[0]) : null }
}

type Run = { from: number; to: number; iv: Iv[] }

/** Consecutive days (1..7) with identical intervals, in week order. */
const runs = (h: OpeningHours): Run[] => {
  const out: Run[] = []
  for (let day = 1; day <= 7; day++) {
    const iv = h.weekly.filter((x) => x.day === day).flatMap((x) => interval(x.open, x.close)).sort((a, b) => a[0] - b[0])
    if (!iv.length) continue
    const last = out[out.length - 1]
    if (last && last.to === day - 1 && JSON.stringify(last.iv) === JSON.stringify(iv)) last.to = day
    else out.push({ from: day, to: day, iv })
  }
  return out
}

/** Hour (24 for an end at midnight) and padded minutes of a minute-of-day value. */
const hm = (min: number): [number, string] => [min && min % 1440 === 0 ? 24 : Math.floor(min / 60) % 24, String(min % 60).padStart(2, '0')]

/** Compact text, e.g. `Lun–Vie 9:00–19:00 · Sáb 9:00–14:00` (24 h) or `Mon–Fri 9:00 AM–7:00 PM` (en). */
export function formatOpeningHours(hours: OpeningHours, locale = 'es-MX'): string {
  const en = /^en/i.test(locale)
  const name = (d: number): string => {
    const s = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2024, 0, d)).replace(/\.$/, '')
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  const time = (min: number): string => {
    const [h, m] = hm(min)
    return en ? `${h % 12 || 12}:${m} ${h % 24 < 12 ? 'AM' : 'PM'}` : `${h}:${m}`
  }
  return runs(hours)
    .map((r) => `${name(r.from)}${r.from === r.to ? '' : '–' + name(r.to)} ${r.iv.map(([s, e]) => `${time(s)}–${time(e)}`).join(', ')}`)
    .join(' · ')
}

/** schema.org `openingHours` strings, one per interval, e.g. `Mo-Fr 09:00-19:00`. */
export function toSchemaOpeningHours(hours: OpeningHours): string[] {
  const code = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
  const t = (min: number): string => { const [h, m] = hm(min); return `${String(h).padStart(2, '0')}:${m}` }
  return runs(hours).flatMap((r) =>
    r.iv.map(([s, e]) => `${code[r.from - 1]}${r.from === r.to ? '' : '-' + code[r.to - 1]} ${t(s)}-${t(e)}`),
  )
}
