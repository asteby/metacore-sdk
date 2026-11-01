/**
 * "Rastrea tu pedido": the public form that answers where a parcel is without a buyer session. By order number + email,
 * or by the guide printed on the parcel. A real `<form method="post">`: it works without JavaScript (the route action
 * answers with `tracking` / `error`, see `resolveTrackingLookup`); with JavaScript, `onSubmit` takes over so the page
 * does not reload. The result is announced politely and takes the focus. Every failure reads the same ("not found"),
 * so the page never tells a real order from an unknown one. Headless (`data-sf-tracking-lookup*`, `classNames`).
 */
import type { LegacyTrackingView, TrackingLookupInput, TrackingView } from '@asteby/storefront'
import { normalizeTrackingView, visibleTrackingShipments } from '@asteby/storefront'
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react'
import { parseTrackingForm, type TrackingFormError } from './form.js'
import { TrackingResult, type ShipmentTrackerProps, type TrackingResultClassNames } from './tracker.js'
import { useTrackingText, type TrackingTextProps } from './text.js'

export type TrackOrderLookupClassNames = Partial<
  Record<'root' | 'form' | 'title' | 'intro' | 'group' | 'legend' | 'field' | 'label' | 'input' | 'or' | 'submit' | 'error' | 'result', string>
>

export type TrackOrderLookupProps = TrackingTextProps & {
  /** Route that receives the post (the page's own path). */
  action: string
  /** `both` (default) shows the two ways, `order_email` or `tracking` only one. */
  mode?: 'both' | 'order_email' | 'tracking'
  /** What the last post answered (`{ order_number, status, shipments[] }`; the deprecated flat shape still renders). */
  result?: TrackingView | LegacyTrackingView | null
  error?: TrackingFormError | null
  retryAfter?: number
  /** A lookup is in flight (disables the button). */
  pending?: boolean
  /** Enhancement: receives the parsed input and prevents the native post. Omit to rely on the plain form. */
  onSubmit?: (input: TrackingLookupInput) => void | Promise<void>
  defaultValues?: Partial<Record<'order_number' | 'email' | 'tracking_number', string>>
  /** Replaces the default `TrackingResult` (receives the contract shape, normalised and without test shipments). */
  renderTracker?: (tracking: TrackingView) => ReactNode
  /** Props of each shipment's tracker (map loader, geocoder, carrier mark, classNames…). */
  trackerProps?: Omit<ShipmentTrackerProps, 'tracking' | 'state' | 'locale' | 'messages' | 'timeZone' | 'headingLevel' | 'label'>
  /** classNames of the result block (order title, the "no guide yet" status, the list of shipments). */
  resultClassNames?: TrackingResultClassNames
  headingLevel?: 1 | 2 | 3
  classNames?: TrackOrderLookupClassNames
}

export function TrackOrderLookup({ action, mode = 'both', result, error, retryAfter, pending, onSubmit, defaultValues, renderTracker, trackerProps, resultClassNames, headingLevel = 2, classNames: cx = {}, ...text }: TrackOrderLookupProps) {
  const { tm, tt, locale } = useTrackingText(text)
  const uid = useId().replace(/:/g, '')
  const H = `h${headingLevel}` as 'h2'
  const region = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (result || error) region.current?.focus()
  }, [result, error])

  const showOrder = mode !== 'tracking'
  const showGuide = mode !== 'order_email'
  const required = mode !== 'both'

  const submit = (e: FormEvent<HTMLFormElement>) => {
    if (!onSubmit) return
    e.preventDefault()
    const input = parseTrackingForm(new FormData(e.currentTarget))
    if (input) void onSubmit(input)
  }
  const view = result ? normalizeTrackingView(result) : null
  const errorText = error ? (error === 'rate_limited' && retryAfter ? tt('lookup.error.rate_limited_in', { seconds: retryAfter }) : tm[`lookup.error.${error}` as 'lookup.error.not_found']) : null

  return (
    <section className={cx.root} aria-labelledby={`${uid}-t`} data-sf-tracking-lookup>
      <H id={`${uid}-t`} className={cx.title}>
        {tm['lookup.title']}
      </H>
      <p className={cx.intro}>{tm['lookup.intro']}</p>
      <form method="post" action={action} className={cx.form} onSubmit={submit} aria-busy={pending ? 'true' : undefined} data-sf-tracking-form>
        {showOrder ? (
          <div className={cx.group} data-sf-tracking-group="order">
            <div className={cx.field}>
              <label htmlFor={`${uid}-o`} className={cx.label}>
                {tm['lookup.orderNumber']}
              </label>
              <input id={`${uid}-o`} className={cx.input} name="order_number" type="text" autoComplete="off" maxLength={64} required={required} defaultValue={defaultValues?.order_number ?? ''} />
            </div>
            <div className={cx.field}>
              <label htmlFor={`${uid}-e`} className={cx.label}>
                {tm['lookup.email']}
              </label>
              <input id={`${uid}-e`} className={cx.input} name="email" type="email" autoComplete="email" maxLength={254} required={required} defaultValue={defaultValues?.email ?? ''} />
            </div>
          </div>
        ) : null}
        {showOrder && showGuide ? (
          <p className={cx.or} aria-hidden="true" data-sf-tracking-or>
            {tm['lookup.or']}
          </p>
        ) : null}
        {showGuide ? (
          <div className={cx.group} data-sf-tracking-group="guide">
            <div className={cx.field}>
              <label htmlFor={`${uid}-g`} className={cx.label}>
                {tm['lookup.guide']}
              </label>
              <input id={`${uid}-g`} className={cx.input} name="tracking_number" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={64} required={required} defaultValue={defaultValues?.tracking_number ?? ''} />
            </div>
          </div>
        ) : null}
        <button type="submit" className={cx.submit} disabled={pending} data-sf-tracking-submit>
          {pending ? tm['lookup.submitting'] : tm['lookup.submit']}
        </button>
      </form>
      <div ref={region} tabIndex={-1} aria-live="polite" className={cx.result} data-sf-tracking-result>
        {errorText ? (
          <p className={cx.error} role="alert" data-sf-tracking-error={error}>
            {errorText}
          </p>
        ) : view ? (
          renderTracker ? (
            renderTracker({ ...view, shipments: visibleTrackingShipments(view) })
          ) : (
            <TrackingResult tracking={view} locale={locale} {...(text.timeZone ? { timeZone: text.timeZone } : {})} {...(text.messages ? { messages: text.messages } : {})} {...(trackerProps ? { trackerProps } : {})} {...(resultClassNames ? { classNames: resultClassNames } : {})} headingLevel={(headingLevel + 1) as 2 | 3 | 4} />
          )
        ) : null}
      </div>
    </section>
  )
}
