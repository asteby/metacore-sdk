'use client'
/**
 * Live delivery for a one-step checkout. One hook that every shop mounts the same way: the delivery is quoted by itself
 * when the postal code resolves, the cheapest (or the same service as before) is preselected, the form always has ONE
 * delivery chosen, and the pay button knows what to say while it waits.
 *
 *   const live = useLiveDelivery({ formRef, delivery: loader.delivery, quoteUrl: '/pagar/envio', enabled: hydrated, saved })
 *   <DeliveryStatus {...live.statusProps} />
 *   <DeliveryOptions {...live.optionsProps} />
 *   <PaymentMethodSection earlyCard deliveryReady={live.deliveryReady} holdLabel={live.holdLabel} delivery={live.deliveryValue} ... />
 *   <OrderSummary quoting={live.quoting} ... />
 *
 * Transport: `quoteUrl` (the shop's route that saves the destination in the cart and answers `DeliveryOptions`) or your
 * own `quote(address, signal)`. Nothing here knows an amount, a carrier or a shop.
 */
import type { DeliveryOptions as DeliveryData, ShippingRate } from '@asteby/storefront'
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type DeliveryStatusState } from './delivery-status.js'
import { type QuoteAddress, type QuoteChange, type UseAutoQuoteOptions, defaultRate, useAutoQuote } from './auto-quote.js'
import { matchRate } from './delivery.js'
import { isPendingStreet } from './pending-street.js'

export type LiveDeliveryMessages = {
  quoting: string
  noCoverage: string
  error: string
  /** Shipping is ready but the street is empty (or the placeholder). */
  street: string
}
const ES: LiveDeliveryMessages = { quoting: 'Calculando envío…', noCoverage: 'Sin envío a este código postal', error: 'No pudimos calcular el envío', street: 'Escribe tu calle y número' }
const EN: LiveDeliveryMessages = { quoting: 'Calculating shipping…', noCoverage: 'No shipping to this postal code', error: 'We could not calculate shipping', street: 'Enter your street and number' }

export type UseLiveDeliveryOptions = {
  formRef: RefObject<HTMLFormElement | null>
  /** What the page loaded (the server read of the delivery options). Shown until the first live quote. */
  delivery: DeliveryData
  /** `true` after hydration. Without JavaScript the shop keeps its two-step form. */
  enabled: boolean
  /** POST route of the shop: receives the destination as JSON, saves it in the cart, answers `DeliveryOptions`. */
  quoteUrl?: string
  /** Your own transport instead of `quoteUrl`. */
  quote?: UseAutoQuoteOptions['quote']
  /** Form field names of the buyer, sent along with the destination. Default `first_name`, `last_name`, `phone`. */
  /** Form field name of the street. Default `address1`. Paying waits until it holds a real street (never empty, never the placeholder). */
  streetName?: string
  contactNames?: { first_name?: string; last_name?: string; phone?: string }
  /** What the cart already holds (a reload): the saved address, rate id or pickup branch id. */
  saved?: { address?: { country_code?: string; zip?: string | null; province?: string | null; city?: string | null } | null; rateId?: string | null; branchId?: string | null } | null
  /** Fields needed to quote. Default `province` and `city` (the postal code resolved them): the street never changes the price. */
  required?: UseAutoQuoteOptions['required']
  defaultCountry?: string
  debounceMs?: number
  locale?: string
  messages?: Partial<LiveDeliveryMessages>
}

export type UseLiveDeliveryResult = {
  /** The auto-quote state (status, retry, change, noCoverage…). */
  quote: ReturnType<typeof useAutoQuote>
  /** Options on screen: the last live quote, else the page's. */
  live: DeliveryData
  /** Value of the delivery radio group in the form (`rate:<id>` / `pickup:<id>` / ''). */
  deliveryValue: string
  /** Call from the form's `onChange`. */
  onFormChange: () => void
  state: DeliveryStatusState
  /** The street is a real one (not empty, not the placeholder). Always true when a pickup is chosen. */
  streetOk: boolean
  /** The shipping is quoted (or a pickup is chosen): the price is known. */
  shippingQuoted: boolean
  /** A delivery is chosen AND its price is known: pass to `PaymentMethodSection`. */
  deliveryReady: boolean
  /** Pass to `PaymentMethodSection.holdLabel`: text while the button must wait, else `undefined`. */
  holdLabel: string | undefined
  quoting: boolean
  change: QuoteChange | null
  /** Spread on `<DeliveryStatus>`. */
  statusProps: { state: DeliveryStatusState; change: QuoteChange | null; onRetry: () => void }
  /** Spread on `<DeliveryOptions>`. */
  optionsProps: { rates: readonly ShippingRate[]; pickup: DeliveryData['pickup']; free: boolean; partial: boolean; announceReady: boolean; loading: boolean; defaultValue: string | undefined }
  /** The server refused the chosen rate (expired quote): quote again keeping the same service. */
  requote: () => void
}

export function useLiveDelivery(options: UseLiveDeliveryOptions): UseLiveDeliveryResult {
  const { formRef, delivery, enabled, saved } = options
  const m = { ...((options.locale ?? 'es-MX').toLowerCase().startsWith('en') ? EN : ES), ...(options.messages ?? {}) }
  const chosenRate = useRef<ShippingRate | null>(null)
  const names = { first_name: 'first_name', last_name: 'last_name', phone: 'phone', ...(options.contactNames ?? {}) }
  const opts = useRef(options)
  opts.current = options

  const savedRate = saved?.rateId ? delivery.rates.find((r) => r.id === saved.rateId) : undefined
  const savedPickup = saved?.branchId ? delivery.pickup.find((b) => b.branch_id === saved.branchId) : undefined
  const savedValue = savedRate ? `rate:${savedRate.id}` : savedPickup ? `pickup:${savedPickup.branch_id}` : null
  const sa = saved?.address
  const hasOptions = delivery.rates.length + delivery.pickup.length > 0
  const initial = sa && hasOptions ? { delivery, address: { country_code: sa.country_code || options.defaultCountry || 'MX', zip: sa.zip ?? '', province: sa.province ?? '', city: sa.city ?? '' } } : null

  const quote = useAutoQuote({
    formRef,
    enabled,
    required: options.required ?? ['province', 'city'],
    savedValue,
    initial,
    ...(options.defaultCountry ? { defaultCountry: options.defaultCountry } : {}),
    ...(options.debounceMs ? { debounceMs: options.debounceMs } : {}),
    pickDefault: (d) => matchRate(chosenRate.current, d.rates) ?? defaultRate(d),
    quote: async (address: QuoteAddress, signal: AbortSignal) => {
      const o = opts.current
      if (o.quote) return o.quote(address, signal)
      if (!o.quoteUrl) throw new Error('useLiveDelivery: quoteUrl or quote is required')
      const f = new FormData(formRef.current ?? undefined)
      const extra = { first_name: String(f.get(names.first_name) ?? ''), last_name: String(f.get(names.last_name) ?? ''), phone: String(f.get(names.phone) ?? '') }
      const res = await fetch(o.quoteUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...address, ...extra }), signal, credentials: 'same-origin' })
      if (!res.ok) throw new Error(`quote ${res.status}`)
      return (await res.json()) as DeliveryData
    },
  })

  const live = enabled && quote.delivery ? quote.delivery : delivery
  const [deliveryValue, setDeliveryValue] = useState('')
  const read = useCallback(() => String(new FormData(formRef.current ?? undefined).get('delivery_choice') ?? ''), [formRef])
  const streetField = options.streetName ?? 'address1'
  const [street, setStreet] = useState<string | null>(null)
  // `null`: the form has no street field (the shop collects it some other way): nothing to wait for.
  const readStreet = useCallback((): string | null => {
    const v = new FormData(formRef.current ?? undefined).get(streetField)
    return typeof v === 'string' ? v : null
  }, [formRef, streetField])
  const onFormChange = useCallback(() => {
    setDeliveryValue(read())
    setStreet(readStreet())
  }, [read, readStreet])
  // Autofill and the postal-code lookup fill fields without a change event: look again when the options change.
  useEffect(() => setStreet(readStreet()), [readStreet, delivery])

  // Remember the service the buyer chose, to keep it when the carrier re-quotes with new ids.
  useEffect(() => {
    if (deliveryValue.startsWith('rate:')) {
      const r = live.rates.find((x) => `rate:${x.id}` === deliveryValue)
      if (r) chosenRate.current = r
    }
  }, [deliveryValue, live.rates])

  // New rates arrived: exactly ONE delivery is chosen (the kept one or the preselected) and the page knows it.
  useEffect(() => {
    const form = formRef.current
    if (form) {
      const radios = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="radio"][name="delivery_choice"]'))
      if (radios.length > 0 && !radios.some((r) => r.checked)) {
        const pick = radios.find((r) => r.value === quote.defaultValue) ?? radios[0]
        if (pick) pick.checked = true
      }
    }
    setDeliveryValue(read())
  }, [live.rates, live.pickup, formRef, quote.defaultValue, read])

  const pickupChosen = deliveryValue.startsWith('pickup:')
  const state: DeliveryStatusState = quote.noCoverage ? 'no_coverage' : quote.status === 'error' ? 'error' : quote.quoting ? 'quoting' : quote.status === 'ready' ? 'ready' : 'idle'
  const shippingQuoted = !enabled || pickupChosen || state === 'ready'
  const streetOk = !enabled || pickupChosen || street === null || (street.trim() !== '' && !isPendingStreet(street))
  const deliveryReady = deliveryValue !== '' && !deliveryValue.startsWith('ship:') && shippingQuoted && streetOk
  const needsStreet = enabled && !pickupChosen && state === 'ready' && !streetOk
  const holdLabel = !enabled || pickupChosen ? undefined : state === 'quoting' ? m.quoting : state === 'no_coverage' ? m.noCoverage : state === 'error' ? m.error : needsStreet ? m.street : undefined

  const requote = quote.retry
  const shownState: DeliveryStatusState = needsStreet ? 'street' : state
  const statusProps = useMemo(() => ({ state: shownState, change: quote.change, onRetry: quote.retry }), [shownState, quote.change, quote.retry])
  const optionsProps = {
    rates: live.rates,
    pickup: live.pickup,
    free: live.free === true,
    partial: live.partial === true || (live.unavailable?.length ?? 0) > 0,
    announceReady: enabled,
    loading: enabled && quote.quoting && live.rates.length > 0,
    defaultValue: quote.defaultValue ?? savedValue ?? undefined,
  }
  return { quote, live, deliveryValue, onFormChange, state: shownState, streetOk, shippingQuoted, deliveryReady, holdLabel, quoting: enabled && quote.quoting, change: quote.change, statusProps, optionsProps, requote }
}
