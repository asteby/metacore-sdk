/**
 * "Solicitar devolución" for one order. Headless: no styles of its own, `data-sf-return-*` hooks and `classNames` slots.
 * It is a plain `<form method="post">` with named fields and a hidden `intent`, so it works without JavaScript and is
 * rendered on the server; `createReturnRequestAction` (`@asteby/storefront-react/account/server`) is its action.
 *
 * Shows a checkbox + quantity for each returnable line (`returnableLines`), a reason `<select>`, a "Notas" textarea
 * (`maxLength` 500, optional counter) and the submit button. When the order cannot be returned (`returnEligibility`) it
 * renders the reason instead of the form. Pass the action's answer as `data` to show errors next to the fields (and
 * keep what the buyer typed) or the confirmation.
 *
 * Texts: Spanish by default, English with `locale="en"`, any with `messages`.
 */
import {
  DEFAULT_RETURN_REASON,
  RETURN_NOTES_MAX,
  RETURN_REASONS,
  fillReturnMessage,
  returnEligibility,
  returnIneligibleMessage,
  returnMessages,
  returnReasonLabel,
  returnableLines,
  type Order,
  type ReturnEligibilityOptions,
  type ReturnMessages,
  type ReturnReason,
} from '@asteby/storefront'
import { useId, useState, type FormHTMLAttributes, type ReactNode } from 'react'
import { useResolvedLocale } from '../locale.js'
import { formatDate } from './orders-ui.js'
import { RETURN_FORM } from './returns-form-names.js'
import type { ReturnErrorCode, ReturnFieldErrorCode, ReturnRequestActionData } from './returns-types.js'

export type ReturnRequestFormClassNames = Partial<
  Record<
    | 'root'
    | 'form'
    | 'title'
    | 'deadline'
    | 'ineligible'
    | 'lines'
    | 'legend'
    | 'line'
    | 'lineLabel'
    | 'lineTitle'
    | 'lineVariant'
    | 'lineSku'
    | 'quantity'
    | 'quantityMax'
    | 'field'
    | 'label'
    | 'select'
    | 'textarea'
    | 'hint'
    | 'counter'
    | 'error'
    | 'summary'
    | 'success'
    | 'submit',
    string
  >
>

export type ReturnRequestFormProps = {
  order: Order
  /** The action's last answer (`useActionData()`): errors and the values to show again, or the confirmation. */
  data?: ReturnRequestActionData | null | undefined
  /** Where the form posts. Default: the current page. */
  action?: string
  /** BCP 47; defaults to the provider's, then `es-MX`. */
  locale?: string
  messages?: Partial<ReturnMessages>
  /** The store's policy, to decide if the order is still inside its window. */
  eligibility?: Omit<ReturnEligibilityOptions, 'now'>
  /** Clock, for tests. */
  now?: Date | number
  /** IANA time zone for the deadline (`America/Mexico_City`). */
  timeZone?: string
  /** Reasons offered, in order. Default: the four the API accepts. In warranty-only windows only `warranty` is offered. */
  reasons?: readonly ReturnReason[]
  /** Reason selected at first. Default `not_wanted`. */
  defaultReason?: ReturnReason
  /** Show "12 of 500" under the notes. Default `false`. */
  showNotesCount?: boolean
  /** The action is running: locks the button. */
  pending?: boolean
  /** Extra content inside the form, before the button (e.g. a CSRF input). */
  children?: ReactNode
  /** Heading level of the title. Default 2. */
  headingLevel?: 2 | 3 | 4
  classNames?: ReturnRequestFormClassNames
} & Pick<FormHTMLAttributes<HTMLFormElement>, 'onSubmit' | 'id'>

const ERROR_KEY: Record<ReturnErrorCode, keyof ReturnMessages> = {
  validation: 'error.validation',
  unauthorized: 'error.unauthorized',
  not_found: 'error.not_found',
  not_returnable: 'error.not_returnable',
  rate_limited: 'error.rate_limited',
  store_misconfigured: 'error.store_misconfigured',
  unavailable: 'error.unavailable',
}

export function ReturnRequestForm({
  order,
  data,
  action,
  locale,
  messages,
  eligibility: policy,
  now,
  timeZone,
  reasons = RETURN_REASONS,
  defaultReason = DEFAULT_RETURN_REASON,
  showNotesCount = false,
  pending = false,
  children,
  headingLevel = 2,
  classNames: cx = {},
  onSubmit,
  id,
}: ReturnRequestFormProps) {
  const uid = useId()
  const resolved = useResolvedLocale(locale)
  const m = returnMessages(resolved, messages)
  const failed = data && !data.ok ? data : null
  const values = failed?.values
  const [notesLength, setNotesLength] = useState(() => [...(values?.notes ?? '')].length)
  const Heading = `h${headingLevel}` as 'h2'

  if (data?.ok) {
    return (
      <section className={cx.root} data-sf-return="" data-sf-return-state="sent">
        <p className={cx.success} role="status" data-sf-return-success="">
          {m['form.success']}
        </p>
      </section>
    )
  }

  const verdict = returnEligibility(order, { ...policy, ...(now !== undefined ? { now } : {}) })
  if (!verdict.eligible) {
    return (
      <section className={cx.root} data-sf-return="" data-sf-return-state="ineligible" data-sf-return-reason={verdict.reason}>
        <p className={cx.ineligible} data-sf-return-ineligible="">
          {returnIneligibleMessage(verdict.reason, resolved, messages)}
        </p>
      </section>
    )
  }

  const lines = returnableLines(order)
  const offered = verdict.warrantyOnly ? reasons.filter((r) => r === 'warranty') : reasons
  const selectedReason = values?.reason && offered.includes(values.reason as ReturnReason) ? values.reason : offered.includes(defaultReason) ? defaultReason : (offered[0] ?? '')
  const deadline = verdict.deadline ? formatDate(verdict.deadline, resolved, 'date', timeZone) : null
  const fe = failed?.fieldErrors ?? {}
  const errorText = (code: ReturnFieldErrorCode | undefined, max?: number): string | null => {
    if (!code) return null
    const key = code === 'lines_required' ? 'error.lines_required' : code === 'invalid_quantity' ? 'error.invalid_quantity' : code === 'invalid_reason' ? 'error.invalid_reason' : code === 'notes_too_long' ? 'error.notes_too_long' : 'error.validation'
    return fillReturnMessage(m[key], { max: max ?? RETURN_NOTES_MAX })
  }
  const linesErr = errorText(fe.lines)
  const reasonErr = errorText(fe.reason)
  const notesErr = errorText(fe.notes)
  const summary = failed ? m[ERROR_KEY[failed.error.code]] : null
  const ids = { title: `${uid}-title`, lines: `${uid}-lines`, reason: `${uid}-reason`, reasonErr: `${uid}-reason-err`, notes: `${uid}-notes`, notesHint: `${uid}-notes-hint`, notesErr: `${uid}-notes-err`, count: `${uid}-count` }
  const notesDescribed = [ids.notesHint, showNotesCount ? ids.count : '', notesErr ? ids.notesErr : ''].filter(Boolean).join(' ')

  return (
    <section className={cx.root} data-sf-return="" data-sf-return-state="form" aria-labelledby={ids.title}>
      <Heading id={ids.title} className={cx.title} data-sf-return-title="">
        {m['form.title']}
      </Heading>
      {deadline ? (
        <p className={cx.deadline} data-sf-return-deadline="">
          {fillReturnMessage(m['eligibility.deadline'], { date: deadline })}
        </p>
      ) : null}
      {summary ? (
        <p className={cx.summary} role="alert" data-sf-return-error={failed!.error.code}>
          {summary}
        </p>
      ) : null}
      <form method="post" {...(action ? { action } : {})} {...(id ? { id } : {})} {...(onSubmit ? { onSubmit } : {})} className={cx.form} data-sf-return-form="">
        <input type="hidden" name={RETURN_FORM.intent} value="request-return" />
        <input type="hidden" name={RETURN_FORM.orderId} value={order.id} />
        <fieldset className={cx.lines} id={ids.lines} aria-describedby={linesErr ? `${ids.lines}-err` : undefined} data-sf-return-lines="">
          <legend className={cx.legend}>{m['form.lines']}</legend>
          {linesErr ? (
            <p id={`${ids.lines}-err`} className={cx.error} data-sf-return-field-error="lines">
              {linesErr}
            </p>
          ) : null}
          {lines.map((l, i) => {
            const name = l.variantTitle ? `${l.title} (${l.variantTitle})` : l.title || l.sku
            const typed = values?.lines[l.sku]
            const err = errorText(fe[`lines.${i}`], l.maxQuantity)
            const qid = `${uid}-qty-${i}`
            return (
              <div key={l.sku} className={cx.line} data-sf-return-line={l.sku}>
                <input type="hidden" name={RETURN_FORM.sku(i)} value={l.sku} />
                <label className={cx.lineLabel}>
                  <input type="checkbox" name={RETURN_FORM.selected(i)} value="1" defaultChecked={typed !== undefined} aria-label={fillReturnMessage(m['form.select'], { title: name })} />
                  <span className={cx.lineTitle}>{l.title || l.sku}</span>
                  {l.variantTitle ? <span className={cx.lineVariant}>{l.variantTitle}</span> : null}
                  <span className={cx.lineSku}>{l.sku}</span>
                </label>
                <input
                  id={qid}
                  className={cx.quantity}
                  type="number"
                  inputMode="numeric"
                  name={RETURN_FORM.quantity(i)}
                  min={1}
                  max={l.maxQuantity}
                  step={1}
                  defaultValue={typed ?? 1}
                  aria-label={fillReturnMessage(m['form.quantity'], { title: name })}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? `${qid}-err` : undefined}
                />
                <span className={cx.quantityMax}>{fillReturnMessage(m['form.maxQuantity'], { max: l.maxQuantity })}</span>
                {err ? (
                  <p id={`${qid}-err`} className={cx.error} data-sf-return-field-error={`lines.${i}`}>
                    {err}
                  </p>
                ) : null}
              </div>
            )
          })}
        </fieldset>

        <div className={cx.field} data-sf-return-field="reason">
          <label htmlFor={ids.reason} className={cx.label}>
            {m['form.reason']}
          </label>
          <select id={ids.reason} className={cx.select} name={RETURN_FORM.reason} defaultValue={selectedReason} aria-invalid={reasonErr ? true : undefined} aria-describedby={reasonErr ? ids.reasonErr : undefined}>
            {offered.map((r) => (
              <option key={r} value={r}>
                {returnReasonLabel(r, resolved, messages)}
              </option>
            ))}
          </select>
          {reasonErr ? (
            <p id={ids.reasonErr} className={cx.error} data-sf-return-field-error="reason">
              {reasonErr}
            </p>
          ) : null}
        </div>

        <div className={cx.field} data-sf-return-field="notes">
          <label htmlFor={ids.notes} className={cx.label}>
            {m['form.notes']}
          </label>
          <textarea
            id={ids.notes}
            className={cx.textarea}
            name={RETURN_FORM.notes}
            rows={4}
            maxLength={RETURN_NOTES_MAX}
            defaultValue={values?.notes ?? ''}
            onChange={showNotesCount ? (e) => setNotesLength([...e.currentTarget.value].length) : undefined}
            aria-invalid={notesErr ? true : undefined}
            aria-describedby={notesDescribed}
          />
          <p id={ids.notesHint} className={cx.hint}>
            {m['form.notesHint']}
          </p>
          {showNotesCount ? (
            <p id={ids.count} className={cx.counter} data-sf-return-count="">
              {fillReturnMessage(m['form.notesCount'], { count: notesLength, max: RETURN_NOTES_MAX })}
            </p>
          ) : null}
          {notesErr ? (
            <p id={ids.notesErr} className={cx.error} data-sf-return-field-error="notes">
              {notesErr}
            </p>
          ) : null}
        </div>

        {children}
        <button type="submit" className={cx.submit} disabled={pending} aria-disabled={pending || undefined} aria-busy={pending || undefined} data-sf-return-submit="">
          {m['form.submit']}
        </button>
      </form>
    </section>
  )
}
