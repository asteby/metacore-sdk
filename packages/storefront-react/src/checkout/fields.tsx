/**
 * Form fields of a checkout with inline validation: a labelled field that shows its own error under it, a focusable
 * error summary for the submit, and one hook that reads the browser's own constraint validation (`required`, `type`,
 * `pattern`, `minLength`...) so the rules stay in the HTML and the page keeps working without JavaScript (then the
 * browser explains the errors itself).
 *
 * WCAG 2.2: errors are identified in text next to the field (3.3.1), linked with `aria-describedby` and `aria-invalid`,
 * and the summary takes focus and links to every field (3.3.1 / 2.4.3). Validation runs when the buyer leaves a field
 * that has a value, and clears as soon as it is fixed: it never nags while typing.
 */
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type RefObject, type SelectHTMLAttributes } from 'react'

export type FieldMessages = {
  valueMissing: string
  /** Required radio group (delivery, payment). */
  choiceMissing: string
  email: string
  tel: string
  pattern: string
  /** `{n}` = minimum length. */
  tooShort: string
  /** A field the server rejected. */
  server: string
  /** Error summary title, `{n}` = number of fields. */
  summaryOne: string
  summaryMany: string
  optional: string
}

const ES: FieldMessages = {
  valueMissing: 'Completa este campo.',
  choiceMissing: 'Elige una opción.',
  email: 'Escribe un correo válido, por ejemplo nombre@correo.com.',
  tel: 'Escribe un teléfono válido.',
  pattern: 'Revisa el formato.',
  tooShort: 'Escribe al menos {n} caracteres.',
  server: 'Revisa este campo.',
  summaryOne: 'Revisa 1 campo para continuar',
  summaryMany: 'Revisa {n} campos para continuar',
  optional: '(opcional)',
}

const EN: FieldMessages = {
  valueMissing: 'Fill in this field.',
  choiceMissing: 'Choose an option.',
  email: 'Enter a valid email, like name@example.com.',
  tel: 'Enter a valid phone number.',
  pattern: 'Check the format.',
  tooShort: 'Enter at least {n} characters.',
  server: 'Check this field.',
  summaryOne: 'Check 1 field to continue',
  summaryMany: 'Check {n} fields to continue',
  optional: '(optional)',
}

/** Messages for a locale (`es*` default, `en*`), with optional overrides. */
export function fieldMessages(locale?: string | null, overrides?: Partial<FieldMessages> | null): FieldMessages {
  const base = (locale ?? 'es-MX').toLowerCase().startsWith('en') ? EN : ES
  return overrides ? { ...base, ...overrides } : base
}

/** Field name -> error text. */
export type FieldErrors = Record<string, string>

export type ErrorSummaryItem = { name: string; id: string; label: string; message: string }

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

const isControl = (el: EventTarget | null): el is Control =>
  !!el && typeof (el as Element).tagName === 'string' && ['INPUT', 'SELECT', 'TEXTAREA'].includes((el as Element).tagName) && !!(el as Control).name

/**
 * The error text for a control, from its validity. A control can bring its own text with `data-sf-error` (any
 * failure) or `title` (pattern mismatch, the HTML convention).
 */
export function validationMessage(el: Control, m: FieldMessages = ES): string | null {
  const v = el.validity
  if (!v || v.valid) return null
  const own = el.getAttribute('data-sf-error')
  if (own) return own
  if (v.valueMissing) return el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox') ? m.choiceMissing : m.valueMissing
  if (v.typeMismatch && el instanceof HTMLInputElement) return el.type === 'email' ? m.email : el.type === 'tel' ? m.tel : m.pattern
  if (v.patternMismatch) return el.getAttribute('title') || (el instanceof HTMLInputElement && el.type === 'tel' ? m.tel : m.pattern)
  if (v.tooShort && el instanceof HTMLInputElement) return m.tooShort.replace('{n}', String(el.minLength))
  return el.validationMessage || m.pattern
}

/** Visible name of a control: its `<label>`, `aria-label`, or the legend of its group (radios). */
function labelOf(el: Control): string {
  if (el instanceof HTMLInputElement && el.type === 'radio') {
    const legend = el.closest('fieldset')?.querySelector('legend')
    if (legend?.textContent) return legend.textContent.trim()
  }
  const text = el.labels?.[0]?.getAttribute('data-sf-label') ?? el.labels?.[0]?.textContent ?? el.getAttribute('aria-label') ?? el.name
  return text.trim()
}

export type UseFieldErrorsOptions = {
  locale?: string
  messages?: Partial<FieldMessages>
  /** Fields the server rejected (e.g. from the action), shown with `serverMessages[name]` or the generic text. */
  serverFields?: Iterable<string> | null
  serverMessages?: Record<string, string> | null
}

export type FieldErrorsState = {
  errors: FieldErrors
  /** Non-null after a submit with problems (or with server errors): render it in `<ErrorSummary>`. */
  summary: ErrorSummaryItem[] | null
  /** Changes every time a new summary appears, so `<ErrorSummary>` focuses it again. */
  summaryKey: number
  clear: () => void
}

/**
 * Inline validation for the page `<form>`. Listens to the form (no wrapping component): leaving a field with a value
 * checks it; typing in a field with an error clears it when fixed; a submit or `reportValidity()` with problems
 * collects them (the browser's bubbles are replaced by the inline texts) for the summary.
 */
export function useFieldErrors(formRef: RefObject<HTMLFormElement | null>, options: UseFieldErrorsOptions = {}): FieldErrorsState {
  const m = fieldMessages(options.locale, options.messages)
  const live = useRef(m)
  live.current = m
  const server = [...(options.serverFields ?? [])]
  const serverKey = server.join('|')
  const [errors, setErrors] = useState<FieldErrors>(() => Object.fromEntries(server.map((n) => [n, options.serverMessages?.[n] ?? m.server])))
  const [summary, setSummary] = useState<ErrorSummaryItem[] | null>(null)
  const [summaryKey, setSummaryKey] = useState(0)

  // Server errors (a new action result): inline texts plus a summary.
  useEffect(() => {
    if (!server.length) return
    const form = formRef.current
    const items: ErrorSummaryItem[] = []
    const next: FieldErrors = {}
    for (const name of server) {
      const msg = options.serverMessages?.[name] ?? live.current.server
      next[name] = msg
      const el = form?.elements.namedItem(name)
      const ctl = el && 'length' in el && !(el instanceof HTMLSelectElement) ? ((el as RadioNodeList)[0] as Control | undefined) : (el as Control | null)
      if (ctl) items.push({ name, id: ctl.id || name, label: labelOf(ctl), message: msg })
    }
    setErrors((e) => ({ ...e, ...next }))
    if (items.length) {
      setSummary(items)
      setSummaryKey((k) => k + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey])

  useEffect(() => {
    const form = formRef.current
    if (!form) return
    let batch: Control[] | null = null
    const set = (name: string, msg: string | null) =>
      setErrors((e) => {
        if (msg === null) {
          if (!(name in e)) return e
          const { [name]: _gone, ...rest } = e
          return rest
        }
        return e[name] === msg ? e : { ...e, [name]: msg }
      })
    const onBlur = (ev: FocusEvent) => {
      const el = ev.target
      if (!isControl(el) || (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox' || el.type === 'hidden'))) return
      // Leaving an empty field you only tabbed through is not an error yet; it is at submit.
      if (!el.value) return
      set(el.name, validationMessage(el, live.current))
    }
    const onInput = (ev: Event) => {
      const el = ev.target
      if (!isControl(el)) return
      setErrors((e) => {
        if (!(el.name in e)) return e
        const msg = el.validity.valid ? null : validationMessage(el, live.current)
        if (msg !== null) return e // keep the text until the field is fixed (no flicker while typing)
        const { [el.name]: _gone, ...rest } = e
        return rest
      })
    }
    const onInvalid = (ev: Event) => {
      const el = ev.target
      if (!isControl(el)) return
      ev.preventDefault() // the inline text replaces the browser bubble
      if (!batch) {
        batch = []
        queueMicrotask(() => {
          const list = batch ?? []
          batch = null
          const seen = new Set<string>()
          const items: ErrorSummaryItem[] = []
          const next: FieldErrors = {}
          for (const c of list) {
            if (seen.has(c.name)) continue
            seen.add(c.name)
            const msg = validationMessage(c, live.current) ?? live.current.valueMissing
            next[c.name] = msg
            items.push({ name: c.name, id: c.id || c.name, label: labelOf(c), message: msg })
          }
          setErrors((e) => ({ ...e, ...next }))
          setSummary(items)
          setSummaryKey((k) => k + 1)
        })
      }
      batch.push(el)
    }
    form.addEventListener('focusout', onBlur)
    form.addEventListener('input', onInput)
    form.addEventListener('change', onInput)
    form.addEventListener('invalid', onInvalid, true)
    return () => {
      form.removeEventListener('focusout', onBlur)
      form.removeEventListener('input', onInput)
      form.removeEventListener('change', onInput)
      form.removeEventListener('invalid', onInvalid, true)
    }
  }, [formRef])

  // The summary follows the fixes: a field fixed after the submit leaves the list.
  const shown = summary ? summary.filter((s) => s.name in errors).map((s) => ({ ...s, message: errors[s.name]! })) : null
  return {
    errors,
    summary: shown && shown.length ? shown : null,
    summaryKey,
    clear: () => {
      setErrors({})
      setSummary(null)
    },
  }
}

export type ErrorSummaryProps = {
  items: readonly ErrorSummaryItem[] | null
  /** Changes when a new summary must take focus (`useFieldErrors().summaryKey`). */
  focusKey?: number
  locale?: string
  messages?: Partial<FieldMessages>
  title?: ReactNode
  className?: string
  classNames?: Partial<Record<'title' | 'list' | 'link', string>>
}

/**
 * The list of problems after a submit, above the form: `role="alert"`, takes focus, one link per field (moves the
 * focus to it). Renders nothing without items.
 */
export function ErrorSummary({ items, focusKey, locale, messages, title, className, classNames: cx = {} }: ErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null)
  const m = fieldMessages(locale, messages)
  const has = !!items && items.length > 0
  useEffect(() => {
    if (has) ref.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey])
  if (!has) return null
  const n = items!.length
  return (
    <div ref={ref} role="alert" tabIndex={-1} className={className} data-sf-error-summary aria-labelledby="sf-error-summary-title">
      <p id="sf-error-summary-title" className={cx.title} data-sf-error-summary-title>
        {title ?? (n === 1 ? m.summaryOne : m.summaryMany.replace('{n}', String(n)))}
      </p>
      <ul className={cx.list}>
        {items!.map((it) => (
          <li key={it.name}>
            <a
              href={`#${it.id}`}
              className={cx.link}
              onClick={(e) => {
                const el = document.getElementById(it.id)
                if (!el) return
                e.preventDefault()
                el.focus()
                el.scrollIntoView?.({ block: 'center' })
              }}
            >
              {it.label}: {it.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

export type CheckoutFieldClassNames = Partial<Record<'root' | 'label' | 'optional' | 'input' | 'hint' | 'error', string>>

type BaseFieldProps = {
  name: string
  label: string
  /** Field id. Default: the name. */
  id?: string
  /** Error text (from `useFieldErrors().errors[name]` or the server). */
  error?: string | null
  /** Help under the label ("we only use it for the delivery"). */
  hint?: ReactNode
  /** Marks the label "(optional)" and drops `required`. */
  optional?: boolean
  classNames?: CheckoutFieldClassNames
  locale?: string
  messages?: Partial<FieldMessages>
}

export type CheckoutFieldProps = BaseFieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'id'> & { as?: 'input' }
export type CheckoutSelectProps = BaseFieldProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'name' | 'id'> & { as: 'select'; children: ReactNode }

/**
 * One labelled field: label (with "(optional)"), hint, the control and its error text, wired with `aria-describedby`
 * and `aria-invalid`. Required unless `optional`. `as="select"` renders a `<select>` with the given options.
 */
export function CheckoutField(props: CheckoutFieldProps | CheckoutSelectProps) {
  const { name, label, id = name, error, hint, optional = false, classNames: cx = {}, locale, messages, ...rest } = props
  const m = fieldMessages(locale, messages)
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = `${id}-error`
  const describedBy = [hintId, error ? errorId : undefined].filter(Boolean).join(' ') || undefined
  const common = {
    id,
    name,
    required: !optional,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    className: cx.input,
    'data-sf-field-control': '',
  } as const
  return (
    <div className={cx.root} data-sf-field data-invalid={error ? '' : undefined}>
      <label htmlFor={id} className={cx.label} data-sf-label={label}>
        {label}
        {optional ? (
          <span className={cx.optional} data-sf-field-optional>
            {' '}
            {m.optional}
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className={cx.hint} data-sf-field-hint>
          {hint}
        </p>
      ) : null}
      {rest.as === 'select' ? (
        (() => {
          const { as: _as, children, ...select } = rest
          return (
            <select {...select} {...common}>
              {children}
            </select>
          )
        })()
      ) : (
        (() => {
          const { as: _as, ...input } = rest as CheckoutFieldProps
          return <input {...input} {...common} />
        })()
      )}
      {/* Reserved only when there is an error: the text sits right under its field. */}
      {error ? (
        <p id={errorId} className={cx.error} data-sf-field-error>
          {error}
        </p>
      ) : null}
    </div>
  )
}
