'use client'
/**
 * One-step delivery: as soon as the address is complete the shipping rates load by themselves (debounced), the default
 * rate is preselected and payment is ready. No "continue" button, no choosing again.
 *
 * The hook is transport-agnostic: the shop gives `quote(address)` (save the address in the cart, read the delivery
 * options) and renders the result with `<DeliveryOptions>`. Only the fields that change the price re-quote (country,
 * postal code, state, city): editing the street number, the phone or the reference does not. Free shipping and fixed
 * prices come from the server (`DeliveryOptions.free` / `.fixed`, configured per organization): nothing here knows an
 * amount.
 */
import type { DeliveryOptions, ShippingRate } from '@asteby/storefront'
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { matchRate } from './delivery.js'

/** What the shop reads from the address fields of the form. Keys follow the `name` of each input. */
export type QuoteAddress = {
  country_code: string
  zip: string
  province: string
  city: string
  neighborhood: string
  address1: string
  [key: string]: string
}

export type AutoQuoteStatus =
  /** Address incomplete: nothing is quoted yet. */
  | 'idle'
  /** Complete address, waiting for the buyer to stop typing. */
  | 'waiting'
  | 'loading'
  | 'ready'
  | 'error'

export type UseAutoQuoteOptions = {
  /** The form that holds the address inputs (events are listened to on it). */
  formRef: RefObject<HTMLFormElement | null>
  /**
   * Saves the address and returns the delivery options for it. Receives an `AbortSignal` that fires when a newer
   * quote replaces this one: ignore its result then (the hook already does).
   *
   * Only price fields re-quote, so the address saved here can lag behind the form (street, number, reference): the
   * shop's submit must save the full address again before choosing the delivery and paying. The server validates the
   * chosen rate against the saved address (a rate of another postal code is refused), so a stale quote never sets a price.
   */
  quote: (address: QuoteAddress, signal: AbortSignal) => Promise<DeliveryOptions>
  /** `name` of each address input. Default: `country_code`, `zip`, `province`, `city`, `neighborhood`, `address1`. */
  names?: Partial<Record<'country_code' | 'zip' | 'province' | 'city' | 'neighborhood' | 'address1', string>>
  /** Fields that must be filled to quote. Default: all of the six names above except `country_code`. */
  required?: ReadonlyArray<keyof QuoteAddress>
  /** A postal code is valid to quote. Default: 5 digits. */
  validPostalCode?: (zip: string) => boolean
  /** Country used when the form has no country input. Default `MX`. */
  defaultCountry?: string
  /** Quiet time after the last keystroke. Default 600 ms. */
  debounceMs?: number
  /** Picks the preselected rate. Default: {@link defaultRate} (the cheapest). */
  pickDefault?: (delivery: DeliveryOptions) => ShippingRate | null
  /** The rate (`rate:<id>`) already saved in the cart: kept when the quote still offers it. */
  savedValue?: string | null
  enabled?: boolean
  /** Fires with the options of every successful quote. */
  onQuoted?: (delivery: DeliveryOptions) => void
}

export type UseAutoQuoteResult = {
  status: AutoQuoteStatus
  /** The last good quote (kept while a new one loads, so the list does not flash). `null` before the first. */
  delivery: DeliveryOptions | null
  /** `rate:<id>` to preselect (the saved rate if still offered, else the default), `null` when none. */
  defaultValue: string | null
  /** The address the current `delivery` was quoted for. */
  quotedFor: QuoteAddress | null
  /** Quote again now (retry button). */
  retry: () => void
  /** Plain-language status for a live region ("Buscando…", "Listo", …) keys, not text. */
  announce: 'searching' | 'ready' | 'free' | 'error' | null
}

export const DEFAULT_QUOTE_NAMES = {
  country_code: 'country_code',
  zip: 'zip',
  province: 'province',
  city: 'city',
  neighborhood: 'neighborhood',
  address1: 'address1',
} as const

const DEFAULT_REQUIRED = ['zip', 'province', 'city', 'neighborhood', 'address1'] as const

/** Only these change the price of a shipment; any other field of the form (street, phone, reference…) never re-quotes. */
export const QUOTE_KEYS = ['country_code', 'zip', 'province', 'city'] as const

const norm = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

/** Identity of a quote: equal fingerprints share the same rates. */
export function quoteFingerprint(a: Pick<QuoteAddress, (typeof QUOTE_KEYS)[number]>): string {
  return QUOTE_KEYS.map((k) => norm(a[k] ?? '')).join('|')
}

/** The default rate: the cheapest one that is not a pickup (ties keep the server order, which already puts the best first). */
export function defaultRate(delivery: Pick<DeliveryOptions, 'rates'>): ShippingRate | null {
  let best: ShippingRate | null = null
  for (const r of delivery.rates) {
    if (r.pickup) continue
    if (!best || Number(r.cost.amount) < Number(best.cost.amount)) best = r
  }
  return best
}

/** Reads the address from the form; `null` when it is not complete yet. */
export function readQuoteAddress(
  form: HTMLFormElement | null,
  opts: Pick<UseAutoQuoteOptions, 'names' | 'required' | 'validPostalCode' | 'defaultCountry'> = {},
): QuoteAddress | null {
  if (!form) return null
  const names = { ...DEFAULT_QUOTE_NAMES, ...opts.names }
  const data = new FormData(form)
  const get = (name: string) => String(data.get(name) ?? '').trim()
  const address: QuoteAddress = {
    country_code: get(names.country_code) || opts.defaultCountry || 'MX',
    zip: get(names.zip),
    province: get(names.province),
    city: get(names.city),
    neighborhood: get(names.neighborhood),
    address1: get(names.address1),
  }
  const valid = opts.validPostalCode ?? ((z: string) => /^\d{5}$/.test(z))
  if (!valid(address.zip)) return null
  for (const k of opts.required ?? DEFAULT_REQUIRED) if (!address[k]) return null
  return address
}

export function useAutoQuote(options: UseAutoQuoteOptions): UseAutoQuoteResult {
  const { formRef, debounceMs = 600, enabled = true } = options
  const [status, setStatus] = useState<AutoQuoteStatus>('idle')
  const [delivery, setDelivery] = useState<DeliveryOptions | null>(null)
  const [quotedFor, setQuotedFor] = useState<QuoteAddress | null>(null)
  const opts = useRef(options)
  opts.current = options
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inflight = useRef<AbortController | null>(null)
  const quotedFp = useRef<string | null>(null)
  const pendingFp = useRef<string | null>(null)

  const run = useCallback((address: QuoteAddress, fp: string) => {
    inflight.current?.abort()
    const ctl = new AbortController()
    inflight.current = ctl
    pendingFp.current = fp
    setStatus('loading')
    opts.current
      .quote(address, ctl.signal)
      .then((d) => {
        if (ctl.signal.aborted) return
        quotedFp.current = fp
        pendingFp.current = null
        setDelivery(d)
        setQuotedFor(address)
        setStatus('ready')
        opts.current.onQuoted?.(d)
      })
      .catch(() => {
        if (ctl.signal.aborted) return
        pendingFp.current = null
        // The next change of the address (or the retry button) quotes again.
        quotedFp.current = null
        setStatus('error')
      })
  }, [])

  const evaluate = useCallback(
    (force: boolean) => {
      const address = readQuoteAddress(formRef.current, opts.current)
      if (!address) {
        if (timer.current) clearTimeout(timer.current)
        timer.current = null
        inflight.current?.abort()
        pendingFp.current = null
        // The last quote no longer describes what the form says (e.g. the postal code is being edited): not ready to
        // pay. Completing the same address again is `ready` at once (same fingerprint, nothing is asked).
        setStatus('idle')
        return
      }
      const fp = quoteFingerprint(address)
      // Same price-relevant fields as the quote we have (or are getting): nothing to ask again.
      if (!force && (fp === quotedFp.current || fp === pendingFp.current)) {
        if (timer.current) clearTimeout(timer.current)
        timer.current = null
        if (fp === quotedFp.current) setStatus('ready')
        return
      }
      if (timer.current) clearTimeout(timer.current)
      if (force) {
        timer.current = null
        run(address, fp)
        return
      }
      setStatus('waiting')
      timer.current = setTimeout(() => {
        timer.current = null
        // The form may have changed while we waited.
        const latest = readQuoteAddress(formRef.current, opts.current)
        if (latest) run(latest, quoteFingerprint(latest))
      }, debounceMs)
    },
    [debounceMs, formRef, run],
  )

  useEffect(() => {
    const form = formRef.current
    if (!enabled || !form) return
    const onChange = () => evaluate(false)
    form.addEventListener('input', onChange)
    form.addEventListener('change', onChange)
    // Autofill and the postal-code lookup fill fields without typing: look once at mount and on the SDK's fill event.
    const first = setTimeout(onChange, 0)
    return () => {
      clearTimeout(first)
      form.removeEventListener('input', onChange)
      form.removeEventListener('change', onChange)
      if (timer.current) clearTimeout(timer.current)
      inflight.current?.abort()
    }
  }, [enabled, evaluate, formRef])

  const retry = useCallback(() => evaluate(true), [evaluate])

  const defaultValue = useMemo(() => {
    if (!delivery) return null
    const saved = opts.current.savedValue
    if (saved?.startsWith('rate:')) {
      const hit = delivery.rates.find((r) => `rate:${r.id}` === saved)
      if (hit) return `rate:${hit.id}`
    }
    const pick = (opts.current.pickDefault ?? defaultRate)(delivery)
    return pick ? `rate:${pick.id}` : null
  }, [delivery, options.savedValue])

  const announce: UseAutoQuoteResult['announce'] =
    status === 'loading' || status === 'waiting' ? 'searching' : status === 'error' ? 'error' : status === 'ready' ? (delivery?.free ? 'free' : 'ready') : null

  return { status, delivery, defaultValue, quotedFor, retry, announce }
}

