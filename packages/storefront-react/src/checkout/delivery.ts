/**
 * Pure helpers for the "Delivery" step: how to name a carrier rate, its arrival time, which rate is the cheapest or the
 * fastest, and one human note for the quote deadline. No amounts are computed: `cost` is shown as the server sends it;
 * comparing two costs to flag the cheapest is the only arithmetic.
 */
import type { ShippingRate } from '@asteby/storefront'
import { brandName } from './brands.js'

export type DeliveryMessages = {
  /** `{n}` = business days. */
  etaOne: string
  etaMany: string
  /** `{min}` / `{max}` = business days. */
  etaRange: string
  etaUpTo: string
  etaFrom: string
  cheapest: string
  fastest: string
  free: string
  pickupTitle: string
  /** Quote deadline, `{time}` = local time. */
  quoteToday: string
  quoteTomorrow: string
  /** `{date}` = short date + time. */
  quoteLater: string
  quoteSoon: string
  partial: string
  loading: string
  /** The quote expired or changed and the rates were reloaded. */
  requoted: string
}

const ES: DeliveryMessages = {
  etaOne: 'Llega en 1 día hábil',
  etaMany: 'Llega en {n} días hábiles',
  etaRange: 'Llega en {min} a {max} días hábiles',
  etaUpTo: 'Llega en máximo {max} días hábiles',
  etaFrom: 'Llega en {min} días hábiles o más',
  cheapest: 'Más económico',
  fastest: 'Más rápido',
  free: 'Gratis',
  pickupTitle: 'Recoger en {name}',
  quoteToday: 'Precios de envío vigentes hasta las {time}.',
  quoteTomorrow: 'Precios de envío vigentes hasta mañana a las {time}.',
  quoteLater: 'Precios de envío vigentes hasta el {date}.',
  quoteSoon: 'Los precios de envío vencen pronto ({time}).',
  partial: 'No pudimos consultar todas las paqueterías. Estas son las opciones disponibles ahora.',
  loading: 'Buscando opciones de envío…',
  requoted: 'Las tarifas de envío cambiaron y ya están actualizadas. Revisa tu envío antes de pagar.',
}

const EN: DeliveryMessages = {
  etaOne: 'Arrives in 1 business day',
  etaMany: 'Arrives in {n} business days',
  etaRange: 'Arrives in {min} to {max} business days',
  etaUpTo: 'Arrives in up to {max} business days',
  etaFrom: 'Arrives in {min}+ business days',
  cheapest: 'Cheapest',
  fastest: 'Fastest',
  free: 'Free',
  pickupTitle: 'Pick up at {name}',
  quoteToday: 'Shipping prices valid until {time}.',
  quoteTomorrow: 'Shipping prices valid until tomorrow at {time}.',
  quoteLater: 'Shipping prices valid until {date}.',
  quoteSoon: 'Shipping prices expire soon ({time}).',
  partial: "We couldn't reach every carrier. These are the options available now.",
  loading: 'Looking for delivery options…',
  requoted: 'Shipping rates changed and are now up to date. Check your delivery before paying.',
}

/** Messages for a locale (`es*` default, `en*`), with optional overrides. */
export function deliveryMessages(locale?: string | null, overrides?: Partial<DeliveryMessages> | null): DeliveryMessages {
  const base = (locale ?? 'es-MX').toLowerCase().startsWith('en') ? EN : ES
  return overrides ? { ...base, ...overrides } : base
}

const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''))

/** Commercial carrier name of a rate (`fedex` → "FedEx"); `null` without carrier. */
export function rateCarrier(rate: Pick<ShippingRate, 'carrier'>): string | null {
  return brandName(rate.carrier)
}

/**
 * Service name without the carrier repeated: "FedEx Express Saver" with carrier `fedex` → "Express Saver". Falls back
 * to the title when stripping would leave nothing.
 */
export function rateService(rate: Pick<ShippingRate, 'title' | 'carrier'>): string {
  const title = rate.title.trim()
  const carrier = rateCarrier(rate)
  if (!carrier) return title
  for (const prefix of [carrier, rate.carrier ?? '']) {
    if (!prefix) continue
    if (title.toLowerCase().startsWith(prefix.toLowerCase())) {
      const rest = title.slice(prefix.length).replace(/^[\s·:|-]+/, '')
      if (rest) return rest
    }
  }
  return title
}

/** Arrival time of a rate: business days from the provider, else the server `eta` text as is. */
export function rateEta(
  rate: Pick<ShippingRate, 'eta' | 'eta_days_min' | 'eta_days_max'>,
  messages: DeliveryMessages = ES,
): string | null {
  const { eta_days_min: min, eta_days_max: max } = rate
  if (typeof min === 'number' && typeof max === 'number') {
    if (min === max) return min === 1 ? messages.etaOne : fill(messages.etaMany, { n: min })
    return fill(messages.etaRange, { min, max })
  }
  if (typeof max === 'number') return max === 1 ? messages.etaOne : fill(messages.etaUpTo, { max })
  if (typeof min === 'number') return min === 1 ? messages.etaOne : fill(messages.etaFrom, { min })
  return rate.eta ?? null
}

export type RateBadge = 'cheapest' | 'fastest'

const costOf = (r: ShippingRate) => {
  const n = Number(r.cost.amount)
  return Number.isFinite(n) ? n : null
}
const daysOf = (r: ShippingRate) => r.eta_days_max ?? r.eta_days_min ?? null

/**
 * Badges per rate id. Only with two or more rates, only when one rate is strictly the cheapest (same currency) or
 * strictly the fastest: a tie gets no badge, so the badge always tells the buyer something.
 */
export function rateBadges(rates: readonly ShippingRate[]): Map<string, RateBadge[]> {
  const out = new Map<string, RateBadge[]>()
  if (rates.length < 2) return out
  const add = (id: string, b: RateBadge) => out.set(id, [...(out.get(id) ?? []), b])
  const unique = (values: Array<[string, number | null]>) => {
    const known = values.filter((v): v is [string, number] => v[1] !== null)
    if (known.length < 2) return null
    const min = Math.min(...known.map((v) => v[1]))
    const winners = known.filter((v) => v[1] === min)
    return winners.length === 1 ? winners[0]![0] : null
  }
  const currencies = new Set(rates.map((r) => r.cost.currency_code))
  if (currencies.size === 1) {
    const id = unique(rates.map((r) => [r.id, costOf(r)]))
    if (id) add(id, 'cheapest')
  }
  const fast = unique(rates.map((r) => [r.id, daysOf(r)]))
  if (fast) add(fast, 'fastest')
  return out
}

/** Earliest `expires_at` of the rates (the deadline of the whole list), or `null`. */
export function quoteDeadline(rates: readonly Pick<ShippingRate, 'expires_at'>[]): Date | null {
  let best: Date | null = null
  for (const r of rates) {
    if (!r.expires_at) continue
    const d = new Date(r.expires_at)
    if (Number.isNaN(d.getTime())) continue
    if (!best || d < best) best = d
  }
  return best
}

export type QuoteNote = { text: string; soon: boolean }

/**
 * One human note for the quote deadline, in the buyer's time zone (or `timeZone`): "valid until 9:39 p.m.", "until
 * tomorrow at…", "until Oct 24, …", or "expire soon" within `soonMinutes` (default 15). `null` when already past.
 */
export function quoteNote(
  deadline: Date | null,
  opts: { locale?: string; now?: Date; timeZone?: string; soonMinutes?: number; messages?: DeliveryMessages } = {},
): QuoteNote | null {
  if (!deadline) return null
  const now = opts.now ?? new Date()
  const left = deadline.getTime() - now.getTime()
  if (left <= 0) return null
  const m = opts.messages ?? ES
  const locale = opts.locale ?? 'es-MX'
  const tz = opts.timeZone ? { timeZone: opts.timeZone } : {}
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', ...tz }).format(deadline)
  if (left <= (opts.soonMinutes ?? 15) * 60_000) return { text: fill(m.quoteSoon, { time }), soon: true }
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...tz }).format(d)
  if (day(deadline) === day(now)) return { text: fill(m.quoteToday, { time }), soon: false }
  if (day(deadline) === day(new Date(now.getTime() + 86_400_000))) return { text: fill(m.quoteTomorrow, { time }), soon: false }
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', ...tz }).format(deadline)
  return { text: fill(m.quoteLater, { date }), soon: false }
}

/** Error codes a server uses (or will use) when the chosen rate is no longer quotable. */
const QUOTE_CODES = new Set(['quote_expired', 'rate_expired', 'rate_changed', 'rate_unavailable', 'rate_not_found', 'stale_rate', 'invalid_rate'])

/**
 * `true` when saving a shipping rate failed because the quote expired or the rates changed, so the shop should reload
 * the rates (and keep the address) instead of showing a generic failure. Recognizes the explicit codes
 * (`quote_expired`, `rate_expired`…, any status), a `409`, and the generic `422` on the rate field that older servers
 * answer when the provider re-quoted with new ids. 5xx and other 4xx stay real failures.
 */
export function isQuoteChange(err: { status?: number; code?: string | null; field?: string | null } | null | undefined): boolean {
  if (!err) return false
  if (err.code && QUOTE_CODES.has(err.code)) return true
  if (err.status === 409) return true
  return err.status === 422 && (err.field === 'rate_id' || err.field === 'delivery' || err.field === 'delivery.rate_id' || !err.field)
}

/**
 * The rate of a fresh quote that matches the one the buyer had chosen (same carrier and service), so a re-quote keeps
 * the choice even though the provider issued new ids. `null` when that service is no longer offered.
 */
export function matchRate<R extends Pick<ShippingRate, 'id' | 'carrier' | 'service_code' | 'title'>>(previous: Pick<ShippingRate, 'carrier' | 'service_code' | 'title'> | null | undefined, rates: readonly R[]): R | null {
  if (!previous) return null
  const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
  const sameCarrier = (r: R) => norm(r.carrier) === norm(previous.carrier)
  if (previous.service_code) {
    const hit = rates.find((r) => sameCarrier(r) && norm(r.service_code) === norm(previous.service_code))
    if (hit) return hit
  }
  return rates.find((r) => sameCarrier(r) && norm(r.title) === norm(previous.title)) ?? null
}
