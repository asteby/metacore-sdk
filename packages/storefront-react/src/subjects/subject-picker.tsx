/**
 * The form that saves or edits one item of a kind («Add vehicle»). It is driven by the kind's DATA: one control per
 * field, in order. A catalog field is a `<select>` whose options narrow by what was already chosen (a cascade); a year
 * with known model years is a `<select>` too, else a number; a free field is a text box. It works WITHOUT JavaScript
 * as a `<form method="post">`: «Continue» / «Save» post the values, the action answers the next level (or the errors by
 * field) and the page renders the form again with `values`. With JavaScript the cascade is live and `onSubmit` gets
 * the validated input.
 *
 * A `private` field (a licence plate) is a plain text box labelled «only you see it». It is NEVER prefilled (the server
 * only returns it masked) and an empty one keeps the stored value on edit (`<name>.clear` removes it).
 */
import { PendingButton } from '../ui/pending-button.js'
import { resolveSubject, reconcileSubjectValues, subjectOptions, type Subject, type SubjectField, type SubjectInput, type SubjectKind, type SubjectProblems, type SubjectValues } from '@asteby/storefront'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { useResolvedLocale } from '../locale.js'
import { fill, subjectMessages, type DeepPartial, type SubjectMessages } from './messages.js'
import type { SubjectActionData } from './types.js'

export type SubjectPickerClassNames = Partial<Record<'form' | 'field' | 'label' | 'control' | 'hint' | 'error' | 'actions' | 'submit' | 'cancel' | 'privateNote', string>>

export type SubjectPickerProps = {
  kind: SubjectKind
  /** The item being edited (its public values start the form); omit to add one. */
  subject?: Subject | null
  /** Values to start with (what `SubjectActionData.values` returned after an error, or a refinement without JavaScript). */
  values?: SubjectValues
  /** What the action answered: errors by field, refilled values. */
  data?: SubjectActionData | null
  /** `action` of the form (default: the current URL). */
  action?: string
  /** Field-name prefix (default `subject`: `subject.make`). */
  namePrefix?: string
  /** With JavaScript: receives the validated input; the form does not post. Without it the form posts normally. */
  onSubmit?: (input: SubjectInput, subject?: Subject | null) => void | Promise<void>
  onCancel?: () => void
  pending?: boolean
  /** Offer «use as active» (default true when the buyer already has items of this kind: the caller decides). */
  offerDefault?: boolean
  locale?: string
  messages?: DeepPartial<SubjectMessages>
  classNames?: SubjectPickerClassNames
}

const isYearField = (f: SubjectField) => f.type === 'year'
const initialValues = (kind: SubjectKind, subject?: Subject | null, values?: SubjectValues): SubjectValues => {
  const out: SubjectValues = {}
  for (const f of kind.fields) {
    if (f.private) continue // never prefilled: the server only returns it masked
    const v = values?.[f.key] ?? (subject?.attributes[f.key] as string | number | undefined)
    if (v !== undefined && v !== null) out[f.key] = v
  }
  return out
}

export function SubjectPicker(props: SubjectPickerProps) {
  const { kind, subject, data, action, namePrefix = 'subject', onSubmit, onCancel, pending, classNames: cx = {} } = props
  const locale = useResolvedLocale(props.locale)
  const m = subjectMessages(locale, props.messages).picker
  const uid = useId().replace(/:/g, '')
  const [values, setValues] = useState<SubjectValues>(() => initialValues(kind, subject, props.values ?? (data?.values as SubjectValues | undefined)))
  const [nickname, setNickname] = useState(subject?.nickname ?? '')
  const [makeDefault, setMakeDefault] = useState(false)
  const [clientProblems, setClientProblems] = useState<SubjectProblems | null>(null)
  const [clear, setClear] = useState<Record<string, boolean>>({})
  const [privates, setPrivates] = useState<Record<string, string>>({})

  const serverErrors = data?.fieldErrors ?? {}
  const problemOf = (key: string) => clientProblems?.[key] ?? serverErrors[key]
  const errorText = (code: string | undefined) => (code ? ((m.errors as Record<string, string>)[code] ?? m.errors.invalid) : undefined)
  const topError = !data?.ok && data?.error && !data.error.field ? errorText(data.error.code) : undefined

  const optionsOf = useMemo(() => (f: SubjectField) => (f.source === 'catalog' ? subjectOptions(kind, f.key, values) : []), [kind, values])

  const set = (key: string, value: string) => {
    setClientProblems(null)
    setValues((cur) => reconcileSubjectValues(kind, { ...cur, [key]: value }))
  }

  const submit = (e: FormEvent<HTMLFormElement>) => {
    if (!onSubmit) return // posts as a normal form
    e.preventDefault()
    const sent: SubjectValues = { ...values }
    for (const f of kind.fields) {
      if (!f.private) continue
      if (clear[f.key]) sent[f.key] = null
      else if (privates[f.key]) sent[f.key] = privates[f.key]
    }
    // Validate like the server does, on what the buyer typed; an edit keeps stored private values, so they are not required.
    const r = resolveSubject(kind, sent)
    if (!r.ok) {
      // An edit keeps the stored private values, so an empty private field is not missing.
      const privateKeys = new Set(kind.fields.filter((f) => f.private).map((f) => f.key))
      const blocking = Object.fromEntries(Object.entries(r.problems).filter(([key, code]) => !(subject && code === 'required' && privateKeys.has(key)))) as SubjectProblems
      if (Object.keys(blocking).length > 0) {
        setClientProblems(blocking)
        return
      }
    }
    const attributes: Record<string, unknown> = {}
    for (const f of kind.fields) {
      const v = sent[f.key]
      if (v === null && f.private) attributes[f.key] = null
      else if (v !== undefined && v !== null && v !== '') attributes[f.key] = v
    }
    void onSubmit({ kind: kind.key, attributes, nickname: nickname.trim() || null, ...(makeDefault ? { is_default: true } : {}) }, subject)
  }

  const name = (key: string) => `${namePrefix}.${key}`
  const levelKeys = kind.fields.filter((f) => f.source === 'catalog' && !isYearField(f)).map((f) => f.key)

  return (
    <form method="post" action={action} onSubmit={submit} className={cx.form} data-sf-subject-picker data-sf-subject-kind={kind.key} noValidate={!!onSubmit}>
      <input type="hidden" name="intent" value="subject-save" />
      <input type="hidden" name="kind" value={kind.key} />
      {subject ? <input type="hidden" name="id" value={subject.id} /> : null}
      {topError ? (
        <p role="alert" className={cx.error} data-sf-subject-error>
          {topError}
        </p>
      ) : null}
      {kind.fields.map((f) => {
        const id = `sf-subject-${uid}-${f.key}`
        const err = errorText(problemOf(f.key))
        const opts = optionsOf(f)
        const waiting = f.source === 'catalog' && !isYearField(f) && levelKeys.indexOf(f.key) > 0 && opts.length === 0
        const describedBy = [err ? `${id}-err` : '', f.private ? `${id}-priv` : ''].filter(Boolean).join(' ') || undefined
        let control
        if (f.private) {
          control = (
            <input
              id={id}
              name={name(f.key)}
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={f.max}
              className={cx.control}
              value={privates[f.key] ?? ''}
              onChange={(e) => setPrivates((cur) => ({ ...cur, [f.key]: e.target.value }))}
              aria-describedby={describedBy}
              aria-invalid={err ? true : undefined}
              placeholder={subject && typeof subject.attributes[f.key] === 'string' ? String(subject.attributes[f.key]) : undefined}
              data-sf-private
            />
          )
        } else if (f.source === 'catalog' && opts.length > 0) {
          control = (
            <select id={id} name={name(f.key)} className={cx.control} value={String(values[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} required={f.required} aria-describedby={describedBy} aria-invalid={err ? true : undefined}>
              <option value="">{m.choose}</option>
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )
        } else if (f.source === 'catalog' && !isYearField(f)) {
          control = (
            <select id={id} name={name(f.key)} className={cx.control} value="" disabled aria-describedby={describedBy}>
              <option value="">{waiting ? m.chooseFirst : m.choose}</option>
            </select>
          )
        } else {
          control = (
            <input
              id={id}
              name={name(f.key)}
              type={isYearField(f) ? 'number' : 'text'}
              inputMode={isYearField(f) ? 'numeric' : undefined}
              min={isYearField(f) ? 1900 : undefined}
              max={isYearField(f) ? 2100 : undefined}
              maxLength={f.max}
              className={cx.control}
              value={String(values[f.key] ?? '')}
              onChange={(e) => set(f.key, e.target.value)}
              required={f.required}
              aria-describedby={describedBy}
              aria-invalid={err ? true : undefined}
            />
          )
        }
        return (
          <div key={f.key} className={cx.field} data-sf-subject-field={f.key} data-sf-subject-year={isYearField(f) ? '' : undefined}>
            <label htmlFor={id} className={cx.label}>
              {f.label}
              {f.required ? <span aria-hidden="true"> *</span> : null}
            </label>
            {control}
            {f.private ? (
              <p id={`${id}-priv`} className={cx.privateNote ?? cx.hint} data-sf-subject-private-note>
                {m.privateNote}
                {subject && subject.attributes[f.key] !== undefined ? ` ${m.privateKeep}` : ''}
              </p>
            ) : null}
            {f.private && subject && subject.attributes[f.key] !== undefined ? (
              <label className={cx.hint} data-sf-subject-clear>
                <input type="checkbox" name={`${name(f.key)}.clear`} checked={!!clear[f.key]} onChange={(e) => setClear((cur) => ({ ...cur, [f.key]: e.target.checked }))} /> {m.privateClear}
              </label>
            ) : null}
            {err ? (
              <p id={`${id}-err`} role="alert" className={cx.error} data-sf-subject-error>
                {err}
              </p>
            ) : null}
          </div>
        )
      })}
      <div className={cx.field} data-sf-subject-field="nickname">
        <label htmlFor={`sf-subject-${uid}-nick`} className={cx.label}>
          {m.nickname}
        </label>
        <input id={`sf-subject-${uid}-nick`} name="nickname" type="text" maxLength={40} className={cx.control} value={nickname} onChange={(e) => setNickname(e.target.value)} aria-describedby={`sf-subject-${uid}-nick-h`} />
        <p id={`sf-subject-${uid}-nick-h`} className={cx.hint}>
          {m.nicknameHint}
        </p>
      </div>
      {props.offerDefault && !subject?.is_default ? (
        <label className={cx.hint} data-sf-subject-default>
          <input type="checkbox" name="is_default" value="1" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> {m.makeActive}
        </label>
      ) : null}
      <div className={cx.actions}>
        <PendingButton type="submit" className={cx.submit}  data-sf-subject-submit pending={pending} shared>
          {pending ? m.saving : m.save}
        </PendingButton>
        {/* Without JavaScript the cascade advances by posting: «Continue» shows the next level. */}
        <noscript>
          <button type="submit" name="intent" value="subject-refine" formNoValidate data-sf-subject-refine>
            {m.refine}
          </button>
        </noscript>
        {onCancel ? (
          <button type="button" className={cx.cancel} onClick={onCancel} data-sf-subject-cancel>
            {m.cancel}
          </button>
        ) : null}
      </div>
    </form>
  )
}

