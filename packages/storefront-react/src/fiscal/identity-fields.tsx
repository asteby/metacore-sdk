/**
 * The fiscal data of an invoice: tax id, legal name, tax postal code, regime and invoice use. Everything comes from the
 * region (`Region.fiscal_id`): the tax id's name and format, the regimes (narrowed by person type when the shop says how
 * to tell it), the uses (narrowed by the chosen regime) and the postal code format. Nothing here names a country.
 *
 * Plain HTML controls named `<prefix>.<field>` (default `invoice.tax_id`, `invoice.legal_name`...), so the fields work
 * inside any `<form>`, with or without JavaScript; with JavaScript the region's rules also run as the buyer types.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckoutField, type CheckoutFieldClassNames, type FieldErrors } from '../checkout/fields.js'
import { useResolvedLocale } from '../locale.js'
import { entryLabel, normalizeTaxId, regimesFor, usesFor, validateFiscalValues, type FiscalProblem, type FiscalRegion } from './format.js'
import { fill, fiscalMessages, type DeepPartial, type FiscalMessages } from './messages.js'
import type { FiscalFieldName, FiscalFieldValues } from './types.js'

export type FiscalIdentityFieldsClassNames = CheckoutFieldClassNames & Partial<Record<'fieldset' | 'legend' | 'mark' | 'radios' | 'radio', string>>

export type FiscalIdentityFieldsProps = {
  region: FiscalRegion
  /** Initial values (and, when they change, the new values: e.g. after a document is read). */
  values?: Partial<FiscalFieldValues>
  onChange?: (values: FiscalFieldValues) => void
  /** Fields that were filled from a document: they get the "From your {document}" mark and stay editable. */
  fromDocument?: readonly FiscalFieldName[]
  /** Short noun of the document for the mark ("constancia"). Default: nothing specific ("tu documento"). */
  documentName?: string
  /** The document listed these regimes: show only them, as radios. */
  regimeCandidates?: readonly string[]
  /** Errors by control name (`invoice.tax_regime`), from the server or `useFieldErrors`. */
  errors?: FieldErrors
  namePrefix?: string
  /** Prefix of the control ids (default: generated). */
  idPrefix?: string
  /** Tells a person type from a tax id, to narrow the regimes (`personTypeByLength`). */
  personTypeOf?: (taxId: string) => string | null
  disabled?: boolean
  locale?: string
  messages?: DeepPartial<FiscalMessages>
  classNames?: FiscalIdentityFieldsClassNames
  /** Hides the fieldset legend (when the caller already has a heading). */
  hideLegend?: boolean
}

const FIELDS: FiscalFieldName[] = ['tax_id', 'legal_name', 'postal_code', 'tax_regime', 'use']
const EMPTY: FiscalFieldValues = { tax_id: '', legal_name: '', postal_code: '', tax_regime: '', use: '' }

function problemText(m: FiscalMessages['fields'], region: FiscalRegion, field: FiscalFieldName, p: FiscalProblem): string {
  const e = m.errors
  switch (p) {
    case 'required':
      return e.required
    case 'format':
      return field === 'tax_id'
        ? fill(e.taxIdFormat, { kind: region.fiscal_id?.label ?? '' })
        : fill(e.postalFormat, { example: region.address?.postal_code?.example ?? '' })
    case 'person_type':
      return e.personType
    case 'use_not_allowed':
      return e.useNotAllowed
    default:
      return e.unknown
  }
}

export function FiscalIdentityFields({
  region,
  values,
  onChange,
  fromDocument = [],
  documentName,
  regimeCandidates,
  errors = {},
  namePrefix = 'invoice',
  idPrefix,
  personTypeOf,
  disabled,
  locale: localeProp,
  messages,
  classNames: cx = {},
  hideLegend,
}: FiscalIdentityFieldsProps) {
  const locale = useResolvedLocale(localeProp)
  const all = fiscalMessages(locale, messages)
  const m = all.fields
  const fid = region.fiscal_id
  const reactId = useId()
  const base = idPrefix ?? `sf-fiscal-${reactId.replace(/:/g, '')}`
  const [v, setV] = useState<FiscalFieldValues>({ ...EMPTY, ...values })
  const [shown, setShown] = useState<ReadonlySet<FiscalFieldName>>(new Set())
  const root = useRef<HTMLFieldSetElement>(null)
  const valuesKey = JSON.stringify(values ?? null)
  const first = useRef(true)

  // New values from outside (a document was read): take them.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setV({ ...EMPTY, ...values })
    setShown(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey])

  const set = (patch: Partial<FiscalFieldValues>) => {
    const next = { ...v, ...patch }
    // A use the new regime does not admit is dropped, not silently kept.
    if (patch.tax_regime !== undefined && next.use && !usesFor(fid, next.tax_regime).some((u) => u.code === next.use)) next.use = ''
    setV(next)
    onChange?.(next)
  }

  const person = personTypeOf?.(v.tax_id) ?? null
  const taxIdOk = !validateFiscalValues(region, { tax_id: v.tax_id }, personTypeOf).tax_id
  const problems = useMemo(() => validateFiscalValues(region, v, personTypeOf), [region, v, personTypeOf])
  const candidates = regimeCandidates?.length ? regimeCandidates : null
  const regimes = useMemo(() => {
    const list = regimesFor(fid, taxIdOk ? person : null)
    if (candidates) return (fid?.regimes ?? []).filter((r) => candidates.includes(r.code))
    // Never hide the regime already chosen.
    return v.tax_regime && !list.some((r) => r.code === v.tax_regime) ? [...list, ...(fid?.regimes ?? []).filter((r) => r.code === v.tax_regime)] : list
  }, [fid, person, taxIdOk, candidates, v.tax_regime])
  const uses = useMemo(() => usesFor(fid, v.tax_regime), [fid, v.tax_regime])

  // Rules that block the submit (format, combination) are exposed to the browser's own validation.
  useEffect(() => {
    const el = root.current
    if (!el) return
    for (const f of FIELDS) {
      const ctl = el.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${namePrefix}.${f}"]`)
      const p = problems[f]
      ctl?.setCustomValidity?.(p && p !== 'required' ? problemText(m, region, f, p) : '')
    }
  })

  const name = (f: FiscalFieldName) => `${namePrefix}.${f}`
  const err = (f: FiscalFieldName): string | null => {
    const external = errors[name(f)]
    if (external) return external
    const p = problems[f]
    return shown.has(f) && p && p !== 'required' ? problemText(m, region, f, p) : null
  }
  const touch = (f: FiscalFieldName) => {
    if (v[f] && !shown.has(f)) setShown((s) => new Set(s).add(f))
  }
  const doc = documentName ?? ''
  const mark = (f: FiscalFieldName): ReactNode =>
    fromDocument.includes(f) && (v[f] || (f === 'tax_regime' && candidates)) ? (
      <span className={cx.mark} data-sf-from-document>
        <span aria-hidden="true">✓ </span>
        {fill(m.fromDocument, { document: doc || (locale.toLowerCase().startsWith('en') ? 'document' : 'documento') })}
      </span>
    ) : null
  const hint = (f: FiscalFieldName, text: string | undefined): ReactNode => {
    const mk = mark(f)
    if (!mk) return text
    return text ? (
      <>
        {mk} · {text}
      </>
    ) : (
      mk
    )
  }
  const postalExample = region.address?.postal_code?.example
  const numericPostal = !!postalExample && /^\d+$/.test(postalExample)

  return (
    <fieldset ref={root} className={cx.fieldset} disabled={disabled} data-sf-fiscal-fields style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
      <legend className={cx.legend} hidden={hideLegend ? true : undefined} style={hideLegend ? undefined : { padding: 0 }}>
        {m.legend}
      </legend>
      <CheckoutField
        name={name('tax_id')}
        id={`${base}-tax_id`}
        label={fid?.label || m.taxId}
        hint={hint('tax_id', m.taxIdHint)}
        value={v.tax_id}
        onChange={(e) => set({ tax_id: normalizeTaxId(e.target.value) })}
        onBlur={() => touch('tax_id')}
        error={err('tax_id')}
        classNames={cx}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="next"
        maxLength={20}
        locale={locale}
      />
      <CheckoutField
        name={name('legal_name')}
        id={`${base}-legal_name`}
        label={m.legalName}
        hint={hint('legal_name', m.legalNameHint)}
        value={v.legal_name}
        onChange={(e) => set({ legal_name: e.target.value })}
        onBlur={() => touch('legal_name')}
        error={err('legal_name')}
        classNames={cx}
        autoComplete="organization"
        enterKeyHint="next"
        maxLength={254}
        locale={locale}
      />
      <CheckoutField
        name={name('postal_code')}
        id={`${base}-postal_code`}
        label={m.postalCode}
        hint={hint('postal_code', m.postalCodeHint)}
        value={v.postal_code}
        onChange={(e) => set({ postal_code: e.target.value.trim() })}
        onBlur={() => touch('postal_code')}
        error={err('postal_code')}
        classNames={cx}
        autoComplete="postal-code"
        inputMode={numericPostal ? 'numeric' : 'text'}
        placeholder={postalExample}
        enterKeyHint="next"
        maxLength={12}
        locale={locale}
      />
      {candidates ? (
        <fieldset className={cx.radios} data-sf-fiscal-regimes aria-describedby={err('tax_regime') ? `${base}-regime-error` : undefined} style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0 }}>
          <legend className={cx.label} data-sf-label={m.regime}>
            {m.regime}
          </legend>
          <p className={cx.hint} data-sf-field-hint>
            {mark('tax_regime')} · {m.regimeFromDocument}
          </p>
          {regimes.map((r, i) => (
            <label key={r.code} className={cx.radio} data-sf-fiscal-radio>
              <input
                type="radio"
                id={i === 0 ? `${base}-tax_regime` : undefined}
                name={name('tax_regime')}
                value={r.code}
                checked={v.tax_regime === r.code}
                required
                onChange={() => set({ tax_regime: r.code })}
              />
              <span>
                {entryLabel(r, locale)} <span data-sf-fiscal-code>({r.code})</span>
              </span>
            </label>
          ))}
          {err('tax_regime') ? (
            <p id={`${base}-regime-error`} className={cx.error} data-sf-field-error>
              {err('tax_regime')}
            </p>
          ) : null}
        </fieldset>
      ) : (
        <CheckoutField
          as="select"
          name={name('tax_regime')}
          id={`${base}-tax_regime`}
          label={m.regime}
          hint={hint('tax_regime', m.regimeHint)}
          value={v.tax_regime}
          onChange={(e) => set({ tax_regime: e.target.value })}
          onBlur={() => touch('tax_regime')}
          error={err('tax_regime')}
          classNames={cx}
          locale={locale}
        >
          <option value="">{m.regimeChoose}</option>
          {regimes.map((r) => (
            <option key={r.code} value={r.code}>
              {r.code} · {entryLabel(r, locale)}
            </option>
          ))}
        </CheckoutField>
      )}
      <CheckoutField
        as="select"
        name={name('use')}
        id={`${base}-use`}
        label={m.use}
        hint={m.useHint}
        value={v.use}
        onChange={(e) => set({ use: e.target.value })}
        onBlur={() => touch('use')}
        error={err('use')}
        classNames={cx}
        locale={locale}
      >
        <option value="">{m.useChoose}</option>
        {uses.map((u) => (
          <option key={u.code} value={u.code}>
            {u.code} · {entryLabel(u, locale)}
          </option>
        ))}
      </CheckoutField>
    </fieldset>
  )
}
