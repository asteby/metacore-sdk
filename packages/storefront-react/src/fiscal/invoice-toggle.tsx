/**
 * "I need an invoice" for the checkout (collapsed by default). Expanded it shows, in this order:
 *   - the buyer's saved fiscal data as a card (masked tax id) with "Change" / "Use other details";
 *   - otherwise the document reader (upload the tax document, review, confirm) with manual entry as the way out;
 *   - or the plain fields when the store reads no document.
 * It reports the state with `onChange` (including the label for the pay button: "Pay and invoice") and posts the data as
 * `invoice.*` fields of the surrounding `<form>`, so the checkout action can send it with `createInvoiceAction`.
 */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import type { FiscalDocumentEvidence, FiscalIdentity, IdentityDocumentSpec, InvoiceRequest, InvoicingCapabilities } from '@asteby/storefront'
import { useResolvedLocale } from '../locale.js'
import { IdentityDocumentReader, type IdentityDocumentReaderClassNames } from './document-reader.js'
import { entryLabel, maskTaxId, toInvoiceRequest, validateFiscalValues, type FiscalRegion } from './format.js'
import { FiscalIdentityFields } from './identity-fields.js'
import { fiscalMessages, type DeepPartial, type FiscalMessages } from './messages.js'
import type { FiscalActionData, FiscalFieldValues } from './types.js'

export type InvoiceToggleState = {
  requested: boolean
  /** The data to send as `CheckoutInput.invoice` / `carts.setInvoice`; `null` when none is requested or it is not ready. */
  invoice: InvoiceRequest | null
  /** All the data is there and valid for the region (the server still checks it). */
  ready: boolean
  source: 'profile' | 'document' | 'manual' | null
  /** "Pay" or "Pay and invoice": the label for the pay button. */
  payLabel: string
}

export type InvoiceToggleClassNames = IdentityDocumentReaderClassNames & Partial<Record<'toggle' | 'body' | 'card' | 'cardRow' | 'cardTitle' | 'unavailable', string>>

export type InvoiceToggleProps = {
  region: FiscalRegion & { country_code?: string }
  /** `loadFiscalContext(...).invoicing`. `available: false` or `checkout: 'off'` renders nothing. */
  capabilities?: InvoicingCapabilities | null
  /** The buyer's saved fiscal data (`customer.fiscal`). */
  profile?: FiscalIdentity | null
  defaultRequested?: boolean
  onChange?: (state: InvoiceToggleState) => void
  /** Result of the shop's action (server errors by field, a document read without JS). */
  data?: FiscalActionData | null
  /** The buyer is signed in: they can save the data to their account. */
  canSave?: boolean
  workerSrc?: string
  /** Enables the no-JS document upload. */
  serverUpload?: boolean
  /** Link (e.g. `?invoice=1`) that opens the section when JavaScript is not available. */
  noJsHref?: string
  document?: IdentityDocumentSpec
  documentName?: string
  personTypeOf?: (taxId: string) => string | null
  /** Label of the pay button when no invoice is asked. Default from the messages. */
  payLabel?: string
  namePrefix?: string
  locale?: string
  messages?: DeepPartial<FiscalMessages>
  classNames?: InvoiceToggleClassNames
  now?: () => Date
}

type Mode = 'profile' | 'edit-profile' | 'read' | 'manual'

const profileValues = (p: FiscalIdentity): FiscalFieldValues => ({
  tax_id: p.tax_id,
  legal_name: p.legal_name,
  postal_code: p.postal_code,
  tax_regime: p.tax_regime,
  use: p.invoice_use ?? '',
})

export function InvoiceToggle(props: InvoiceToggleProps) {
  const { region, capabilities, profile, onChange, data, canSave, workerSrc, serverUpload, noJsHref, personTypeOf, namePrefix = 'invoice', messages, classNames: cx = {}, now } = props
  const locale = useResolvedLocale(props.locale)
  const all = fiscalMessages(locale, messages)
  const m = all.toggle
  const fid = region.fiscal_id
  // `identity_documents` lists the kinds the store reads; empty means none. Without capabilities, what the region publishes.
  const spec = props.document ?? fid?.documents?.find((d) => !capabilities || capabilities.identity_documents.includes(d.kind)) ?? undefined
  const canRead = !!spec
  const usable = !!profile && !!profile.invoice_use
  const startMode: Mode = data?.extraction ? 'read' : usable ? 'profile' : profile ? 'edit-profile' : canRead ? 'read' : 'manual'

  const bodyId = `sf-invoice-${useId().replace(/:/g, '')}`
  const [requested, setRequested] = useState(!!props.defaultRequested || !!data?.extraction || !!data?.fieldErrors)
  const [mode, setMode] = useState<Mode>(startMode)
  const [values, setValues] = useState<FiscalFieldValues>(profile ? profileValues(profile) : { tax_id: '', legal_name: '', postal_code: '', tax_regime: '', use: '' })
  const [confirmed, setConfirmed] = useState<{ values: FiscalFieldValues; evidence: FiscalDocumentEvidence | null; save: boolean } | null>(null)
  const [save, setSave] = useState(false)
  const emit = useRef(onChange)
  emit.current = onChange

  const payDefault = props.payLabel ?? m.payDefault
  const state = useMemo<InvoiceToggleState>(() => {
    if (!requested) return { requested: false, invoice: null, ready: false, source: null, payLabel: payDefault }
    const country = region.country_code
    const label = m.payAndInvoice
    if (mode === 'profile' && profile) {
      const inv = toInvoiceRequest(profileValues(profile), profile.country_code || country)
      if (profile.document) inv.document = profile.document
      return { requested: true, invoice: inv, ready: true, source: 'profile', payLabel: label }
    }
    if (mode === 'read') {
      if (!confirmed) return { requested: true, invoice: null, ready: false, source: null, payLabel: label }
      const inv = toInvoiceRequest(confirmed.values, country)
      if (confirmed.evidence) inv.document = confirmed.evidence
      if (confirmed.save) inv.save = true
      return { requested: true, invoice: inv, ready: true, source: confirmed.evidence ? 'document' : 'manual', payLabel: label }
    }
    const ready = Object.keys(validateFiscalValues(region, values, personTypeOf)).length === 0
    const inv = toInvoiceRequest(values, country)
    if (save) inv.save = true
    return { requested: true, invoice: ready ? inv : null, ready, source: 'manual', payLabel: label }
  }, [requested, mode, profile, confirmed, values, save, region, personTypeOf, payDefault, m.payAndInvoice])

  const key = JSON.stringify(state)
  useEffect(() => {
    emit.current?.(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  if (capabilities && (!capabilities.available || capabilities.checkout === 'off')) return null

  const profileCard = profile && (
    <div className={cx.card} data-sf-invoice-profile>
      <p className={cx.cardTitle} data-sf-invoice-profile-title>
        {m.profileTitle}
      </p>
      <dl>
        <Row cx={cx} label={fid?.label || m.fieldsOf.taxId} value={<span data-sf-masked>{maskTaxId(profile.tax_id)}</span>} />
        <Row cx={cx} label={m.fieldsOf.legalName} value={profile.legal_name} />
        <Row cx={cx} label={m.fieldsOf.postalCode} value={profile.postal_code} />
        <Row cx={cx} label={m.fieldsOf.regime} value={labelOf(fid?.regimes, profile.tax_regime, locale)} />
        <Row cx={cx} label={m.fieldsOf.use} value={labelOf(fid?.invoice_uses, profile.invoice_use ?? '', locale)} />
      </dl>
      {/* The saved data also travels as fields, so the checkout works without JavaScript. */}
      <input type="hidden" name={`${namePrefix}.tax_id`} value={profile.tax_id} />
      <input type="hidden" name={`${namePrefix}.legal_name`} value={profile.legal_name} />
      <input type="hidden" name={`${namePrefix}.postal_code`} value={profile.postal_code} />
      <input type="hidden" name={`${namePrefix}.tax_regime`} value={profile.tax_regime} />
      <input type="hidden" name={`${namePrefix}.use`} value={profile.invoice_use ?? ''} />
      {profile.document ? <input type="hidden" name={`${namePrefix}.document`} value={JSON.stringify(profile.document)} /> : null}
      <div className={cx.actions} data-sf-invoice-actions>
        <button type="button" className={cx.secondary} onClick={() => setMode('edit-profile')} data-sf-invoice-change>
          {m.change}
        </button>
        <button
          type="button"
          className={cx.link}
          onClick={() => {
            setValues({ tax_id: '', legal_name: '', postal_code: '', tax_regime: '', use: '' })
            setConfirmed(null)
            setMode(canRead ? 'read' : 'manual')
          }}
          data-sf-invoice-other
        >
          {m.useOther}
        </button>
      </div>
    </div>
  )

  const saveBox = canSave ? (
    <label data-sf-invoice-save>
      <input type="checkbox" name={`${namePrefix}.save`} checked={save} onChange={(e) => setSave(e.target.checked)} />
      <span>{all.reader.saveToAccount}</span>
    </label>
  ) : null
  const backToProfile =
    profile && usable && mode !== 'profile' ? (
      <button
        type="button"
        className={cx.link}
        onClick={() => {
          setValues(profileValues(profile))
          setMode('profile')
        }}
        data-sf-invoice-back
      >
        {m.useSaved}
      </button>
    ) : null

  const body = !requested ? null : (
    <div id={bodyId} className={cx.body} data-sf-invoice-body>
      <input type="hidden" name={`${namePrefix}.requested`} value="true" />
      {mode === 'profile' ? (
        profileCard
      ) : mode === 'read' ? (
        <>
          <IdentityDocumentReader
            region={region}
            {...(spec ? { document: spec } : {})}
            {...(workerSrc ? { workerSrc } : {})}
            {...(data ? { data } : {})}
            {...(canSave !== undefined ? { canSave } : {})}
            {...(serverUpload ? { serverUpload } : {})}
            {...(props.documentName ? { documentName: props.documentName } : {})}
            {...(personTypeOf ? { personTypeOf } : {})}
            {...(now ? { now } : {})}
            onManual={() => {
              setValues({ tax_id: '', legal_name: '', postal_code: '', tax_regime: '', use: '' })
              setMode('manual')
            }}
            onConfirm={(r) => {
              setConfirmed(r)
            }}
            namePrefix={namePrefix}
            locale={locale}
            {...(messages ? { messages } : {})}
            classNames={cx}
          />
          {confirmed ? (
            <p role="status" data-sf-invoice-confirmed>
              <span aria-hidden="true">✓ </span>
              {m.profileTitle}
            </p>
          ) : null}
          {backToProfile}
        </>
      ) : (
        <>
          <h3 className={cx.cardTitle}>{m.manualTitle}</h3>
          <FiscalIdentityFields
            region={region}
            values={values}
            onChange={setValues}
            errors={Object.fromEntries(Object.entries(data?.fieldErrors ?? {}).map(([k, v]) => [k, all.server.errors[v] ?? v]))}
            namePrefix={namePrefix}
            {...(personTypeOf ? { personTypeOf } : {})}
            locale={locale}
            {...(messages ? { messages } : {})}
            classNames={cx}
            hideLegend
          />
          {saveBox}
          <p className={cx.privacy} data-sf-invoice-privacy>
            {m.privacy}
          </p>
          {backToProfile}
        </>
      )}
    </div>
  )

  return (
    <section className={cx.toggle} data-sf-invoice-toggle aria-label={m.label}>
      <label data-sf-invoice-label>
        <input
          type="checkbox"
          name={`${namePrefix}.want`}
          checked={requested}
          aria-controls={requested ? bodyId : undefined}
          onChange={(e) => setRequested(e.target.checked)}
        />
        <span>{m.label}</span>
      </label>
      {noJsHref && !requested ? (
        <noscript>
          <a href={noJsHref} data-sf-invoice-nojs>
            {m.label}
          </a>
        </noscript>
      ) : null}
      {body}
    </section>
  )
}

function Row({ label, value, cx }: { label: string; value: ReactNode; cx: InvoiceToggleClassNames }) {
  return (
    <div className={cx.cardRow} data-sf-invoice-row>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function labelOf(list: { code: string; label: string; label_en?: string; person_types: string[] }[] | undefined, code: string, locale: string): string {
  const e = list?.find((x) => x.code === code)
  return e ? `${e.code} · ${entryLabel(e, locale)}` : code
}
