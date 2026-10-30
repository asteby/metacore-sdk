/**
 * Contact and shipping address fields of a checkout, in the order and with the autofill tokens buyers expect:
 * contact (e-mail, phone, given and family name) and address (postal code first, so it can fill state and city, then
 * state, city, colonia, street, interior and delivery references). One column on phones; the shop lays out the grid
 * with `classNames`.
 *
 * Nothing here knows a country: the postal-code format, the list of states and the postal-code lookup come from the
 * shop (region config, a same-origin route). Without them the fields are plain text and nothing is invented.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { Address, CustomerType } from '@asteby/storefront'
import { useOptionalStorefront } from '../context.js'
import { AddressLineField, type AddressSuggestMessages, type SuggestAddress } from './address-suggest.js'
import { CheckoutField, type CheckoutFieldClassNames, type FieldErrors, type FieldMessages } from './fields.js'

export type AddressFieldKey = 'zip' | 'province' | 'city' | 'neighborhood' | 'address1' | 'address2' | 'reference'
export type ContactFieldKey = 'email' | 'phone' | 'first_name' | 'last_name' | 'customer_type'

export type AddressFieldsMessages = Record<AddressFieldKey | ContactFieldKey, string> & AddressSuggestMessages & {
  provincePlaceholder: string
  neighborhoodPlaceholder: string
  address1Hint: string
  referenceHint: string
  emailHint: string
  phoneHint: string
  lookupFilled: string
  /** Note when the postal code is not in the lookup: state and city stay editable. */
  postalCodeNotFound: string
  /** Tooltip and note of a state the postal code defined (locked). */
  provinceLocked: string
  /** Tooltip and note of a city/municipality the postal code defined (locked). */
  cityLocked: string
  /** Note under a state the buyer typed that differs from the postal code's (`{value}` = the postal code's state). */
  provinceMismatch: string
  /** Same for the city/municipality. */
  cityMismatch: string
  /** Discreet action that releases the locked state so the buyer can fix the postal code. */
  changePostalCode: string
  /** Visually hidden prefix of the one-line place summary (what a screen reader hears before "Miguel Hidalgo, Ciudad de México"). */
  resolvedPlace: string
}

const ES: AddressFieldsMessages = {
  email: 'Correo',
  customer_type: 'Tipo de cliente',
  phone: 'Teléfono',
  first_name: 'Nombre',
  last_name: 'Apellidos',
  zip: 'Código postal',
  province: 'Estado',
  city: 'Ciudad o municipio',
  neighborhood: 'Colonia',
  address1: 'Calle y número',
  address2: 'Número interior o departamento',
  reference: 'Referencias para la entrega',
  provincePlaceholder: 'Elige tu estado',
  neighborhoodPlaceholder: 'Elige tu colonia',
  address1Hint: 'Por ejemplo: Av. Insurgentes Sur 1234',
  referenceHint: 'Entre qué calles, color de la fachada…',
  emailHint: 'Te enviamos aquí la confirmación y el seguimiento.',
  phoneHint: 'Solo para la paquetería, por si necesita contactarte.',
  lookupFilled: 'Completamos estado y ciudad con tu código postal.',
  postalCodeNotFound: 'No encontramos ese código postal; revísalo o escribe tu estado y ciudad.',
  provinceLocked: 'Definido por tu código postal',
  cityLocked: 'Definido por tu código postal',
  provinceMismatch: 'Tu código postal corresponde a {value}. Revisa el estado o el código postal.',
  cityMismatch: 'Tu código postal corresponde a {value}. Revisa la ciudad o el código postal.',
  changePostalCode: 'Cambiar código postal',
  resolvedPlace: 'Entrega en',
  suggestionsLabel: 'Sugerencias de dirección',
  suggestionsCount: '{n} sugerencias. Usa las flechas arriba y abajo para elegir y Enter para aceptar.',
  suggestionChosen: 'Dirección elegida: {label}',
  attribution: '© OpenStreetMap contributors',
}

const EN: AddressFieldsMessages = {
  email: 'Email',
  customer_type: 'Customer type',
  phone: 'Phone',
  first_name: 'First name',
  last_name: 'Last name',
  zip: 'Postal code',
  province: 'State',
  city: 'City',
  neighborhood: 'Neighborhood',
  address1: 'Street and number',
  address2: 'Apartment, suite',
  reference: 'Delivery notes',
  provincePlaceholder: 'Choose your state',
  neighborhoodPlaceholder: 'Choose your neighborhood',
  address1Hint: 'For example: 1234 Main St',
  referenceHint: 'Cross streets, building color…',
  emailHint: 'We send the confirmation and tracking here.',
  phoneHint: 'Only for the carrier, in case they need to reach you.',
  lookupFilled: 'We filled in state and city from your postal code.',
  postalCodeNotFound: "We couldn't find that postal code; check it or type your state and city.",
  provinceLocked: 'Set by your postal code',
  cityLocked: 'Set by your postal code',
  provinceMismatch: 'Your postal code belongs to {value}. Check the state or the postal code.',
  cityMismatch: 'Your postal code belongs to {value}. Check the city or the postal code.',
  changePostalCode: 'Change postal code',
  resolvedPlace: 'Delivering to',
  suggestionsLabel: 'Address suggestions',
  suggestionsCount: '{n} suggestions. Use the up and down arrows to choose and Enter to accept.',
  suggestionChosen: 'Address chosen: {label}',
  attribution: '© OpenStreetMap contributors',
}

export function addressFieldsMessages(locale?: string | null, overrides?: Partial<AddressFieldsMessages> | null): AddressFieldsMessages {
  const base = (locale ?? 'es-MX').toLowerCase().startsWith('en') ? EN : ES
  return overrides ? { ...base, ...overrides } : base
}

export type FieldLayoutClassNames = CheckoutFieldClassNames & {
  /** Extra class of a field that should span the whole row in a two-column grid. */
  wide?: string
  /** Extra class of a field that fits half a row. */
  half?: string
  /** The street suggestions panel, one option, the highlighted option and the attribution line (default: inline styles that follow the system colors). */
  suggestions?: string
  suggestion?: string
  suggestionActive?: string
  attribution?: string
}

type Common = {
  /** Inline errors by field name (`useFieldErrors().errors`). */
  errors?: FieldErrors
  locale?: string
  messages?: Partial<AddressFieldsMessages>
  fieldMessages?: Partial<FieldMessages>
  classNames?: FieldLayoutClassNames
}

const join = (...c: Array<string | undefined>) => c.filter(Boolean).join(' ') || undefined
const field = (cx: FieldLayoutClassNames, span: 'wide' | 'half'): CheckoutFieldClassNames => ({ ...cx, root: join(cx.root, cx[span]) })

export type ContactFieldsProps = Common & {
  defaults?: Partial<Record<ContactFieldKey, string | null>>
  /** Form names. Default: the keys. */
  names?: Partial<Record<ContactFieldKey, string>>
  /** Phone format from the shop or region (e.g. `{ pattern: '[0-9 +()-]{10,}', title: '10 dígitos' }`). */
  phone?: { pattern?: string; title?: string; minLength?: number }
  /** Explain why e-mail and phone are needed (default true). */
  hints?: boolean
  /**
   * The types a buyer can say they are, in the store's own vocabulary (`value` a short slug). When given, a «Customer type»
   * select is added (the first one is selected unless `defaults.customer_type` says otherwise; name `customer_type` unless `names.customer_type`). It classifies the buyer for marketing and
   * does not change prices. Omitted: no select.
   */
  customerTypes?: ReadonlyArray<{ value: CustomerType; label: string }>
}

/** E-mail, phone, given and family name with their autofill tokens and the right mobile keyboards. */
export function ContactFields({ defaults = {}, names = {}, errors = {}, phone, hints = true, customerTypes, locale, messages, fieldMessages: fm, classNames: cx = {} }: ContactFieldsProps) {
  const m = addressFieldsMessages(locale, messages)
  const n = (k: ContactFieldKey) => names[k] ?? k
  const common = { ...(locale ? { locale } : {}), ...(fm ? { messages: fm } : {}) }
  return (
    <>
      <CheckoutField {...common} name={n('email')} label={m.email} type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} defaultValue={defaults.email ?? ''} error={errors[n('email')] ?? null} hint={hints ? m.emailHint : undefined} classNames={field(cx, 'wide')} />
      <CheckoutField {...common} name={n('phone')} label={m.phone} type="tel" autoComplete="tel" inputMode="tel" defaultValue={defaults.phone ?? ''} error={errors[n('phone')] ?? null} hint={hints ? m.phoneHint : undefined} classNames={field(cx, 'wide')} {...(phone?.pattern ? { pattern: phone.pattern } : {})} {...(phone?.title ? { title: phone.title } : {})} {...(phone?.minLength ? { minLength: phone.minLength } : {})} />
      <CheckoutField {...common} name={n('first_name')} label={m.first_name} autoComplete="given-name" defaultValue={defaults.first_name ?? ''} error={errors[n('first_name')] ?? null} classNames={field(cx, 'half')} />
      <CheckoutField {...common} name={n('last_name')} label={m.last_name} autoComplete="family-name" defaultValue={defaults.last_name ?? ''} error={errors[n('last_name')] ?? null} classNames={field(cx, 'half')} />
      {customerTypes?.length ? (
        <CheckoutField
          {...common}
          as="select"
          name={n('customer_type')}
          label={m.customer_type}
          defaultValue={customerTypes.some((t) => t.value === defaults.customer_type) ? defaults.customer_type! : customerTypes[0]!.value}
          error={errors[n('customer_type')] ?? null}
          classNames={field(cx, 'wide')}
        >
          {customerTypes.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </CheckoutField>
      ) : null}
    </>
  )
}

/** What a postal-code lookup answers. Every field optional: only what the source knows. */
export type PostalCodeInfo = {
  province?: string | null
  city?: string | null
  neighborhoods?: readonly string[] | null
  /**
   * Every municipality the code covers, when the catalog knows more than one. With two or more the code is ambiguous:
   * `hideResolvedFields` keeps the city field editable instead of choosing for the buyer.
   */
  cities?: readonly string[] | null
  /**
   * Municipality to SHOW in the one-line summary (`hideResolvedFields`) when it differs from `city`, the value that is
   * submitted (and may feed the delivery quote). Display only: never sent.
   */
  municipality?: string | null
  /** Which provider answered (`catalog`, `osm`, ...). Informative: the form ignores it. */
  source?: string | null
}

export type AddressFieldsProps = Common & {
  defaults?: Partial<Pick<Address, 'zip' | 'province' | 'city' | 'neighborhood' | 'address1' | 'address2' | 'reference'>> | null
  /** Form names. Default: the keys (the `AddressInput` fields of the Storefront API). */
  names?: Partial<Record<AddressFieldKey | 'province_code', string>>
  /** ISO country of the address (hidden field `country_code`). */
  countryCode: string
  /** States of the country (from the region config). With them, "State" is a `<select>`; the value sent is `name`. */
  provinces?: ReadonlyArray<{ code?: string | null; name: string }> | null
  /** Postal-code format of the country (from the region config), e.g. `{ pattern: '[0-9]{5}', maxLength: 5, inputMode: 'numeric', title: '5 dígitos' }`. */
  postalCode?: { pattern?: string; maxLength?: number; inputMode?: 'numeric' | 'text'; title?: string }
  /**
   * Fills state and city (and suggests colonias) from the postal code. Default: the region pack's catalog through the
   * Storefront API (`client.postalCode`) of the surrounding `<StorefrontProvider>` when it has a browser client; pass
   * this to use another source (a same-origin route of the shop that proxies it server side). Called once the code matches `postalCode.pattern` (or on leaving the field).
   * Never overwrites what the buyer typed.
   */
  lookupPostalCode?: (zip: string) => Promise<PostalCodeInfo | null>
  /**
   * How to offer the colonias when the postal code has SEVERAL: `'datalist'` (default, suggestions on a text field) or
   * `'select'` (a real list; the field becomes a `<select>` of those colonias, unless the buyer already typed one that
   * is not in the list, which is kept as text). With exactly one colonia it is filled in either mode.
   */
  neighborhoodList?: 'datalist' | 'select'
  /** Show the colonia field: `true` (default, optional), `'required'`, or `false`. */
  neighborhood?: boolean | 'required'
  /** Show the delivery references field (default true, optional). */
  reference?: boolean
  /**
   * Once `lookupPostalCode` fills the state field (never over what the buyer already typed), lock it: a plain
   * `<input>` turns read-only; a `<select>` (from `provinces`) turns disabled with a hidden field that keeps
   * submitting its value. The state is the postal code's: the field shows a lock, the tooltip `provinceLocked` and a
   * discreet `changePostalCode` action; editing the postal code releases the lock and clears what the lookup filled
   * (also when the new code resolves nothing), so a stale state is never left behind. Default TRUE (the server
   * validates the pair again; set `false` to keep the filled state as editable as any field). Marked with
   * `data-sf-locked="1"` for the shop's own styling.
   */
  lockProvinceOnFill?: boolean
  /**
   * Same as `lockProvinceOnFill` for the city/municipality: once the lookup fills it (never over what the buyer typed) the
   * `<input>` is read-only (`readOnly` + `aria-readonly`, still submitted: never `disabled`), with the same note, tooltip
   * (`cityLocked`) and `changePostalCode` action. Only when the lookup answered a city, and it is not ambiguous
   * (`PostalCodeInfo.cities` with several): then the buyer chooses and the field stays editable. If the code resolves
   * nothing or the lookup fails the field stays editable, so a purchase is never blocked. Editing the postal code
   * re-resolves and refreshes the locked values. Default: follows `lockProvinceOnFill` (true); `false` keeps the filled city editable.
   */
  lockCityOnFill?: boolean
  /**
   * When the postal-code lookup resolves BOTH state and city/municipality (and the catalog does not return several
   * municipalities), they are not shown as inputs: one read-only line under the postal code ("Miguel Hidalgo, Ciudad de
   * México" plus a discreet `changePostalCode` link) and the values travel in hidden fields with the usual names
   * (`province`, `province_code` when the `provinces` list knows it, `city`), so the server still validates state against
   * postal code. If the code resolves nothing, is unknown, the lookup fails, the municipality is ambiguous, the state is
   * not in `provinces`, the buyer already typed a different value, or the server reports an error on state/city, the
   * inputs are shown editable (the buyer can always complete the address). Without JavaScript the form is the plain
   * inputs. Default TRUE; `false` keeps the previous behavior (inputs filled, state locked per `lockProvinceOnFill`).
   */
  hideResolvedFields?: boolean
  /**
   * Street-and-number suggestions for "Street and number" (an ARIA combobox: arrows, Enter, Escape, live region). Default:
   * the market's provider through the Storefront API (`client.addressSuggest`) of the surrounding `<StorefrontProvider>`
   * when it has a browser client; pass a function to use another source, or `false` to turn it off. Asked only from 3
   * characters, after 250 ms without typing, and never waited for past 800 ms; with no provider, a slow or a failing one
   * the field stays a plain input and nothing else changes: it never blocks a field or the payment.
   *
   * Accepting an option fills the street and number (what was typed is replaced), the postal code when it was empty
   * (which then runs the usual lookup) and the colonia only when it is one of the postal code's catalog (or the catalog
   * has none): state and city are NEVER taken from a suggestion, the postal-code catalog is the authority. It does not
   * overwrite a colonia the buyer chose or typed.
   */
  suggestAddress?: SuggestAddress | false
  /** Called after an option is accepted and applied (coordinates, `source`...): the shop may keep what it needs. */
  onSuggestionChosen?: (suggestion: import('@asteby/storefront').AddressSuggestion) => void
  /** The attribution line shown with the options. Default "© OpenStreetMap contributors" linking to the OSM copyright page; `false` hides it (only for a provider whose data needs none). */
  suggestAttribution?: ReactNode | false
  /** Rendered after the fields (e.g. "save this address"). */
  children?: ReactNode
}

/**
 * Shipping address in the order buyers fill it: postal code, state, city, colonia, street and number, interior and
 * references. Autofill tokens: `postal-code`, `address-level1/2/3`, `address-line1/2`. The postal code uses the
 * numeric keyboard when the country format is numeric.
 */
/** While the postal code defines a field the browser must not offer its own address suggestions for it. */
function suppressAutofill(el: HTMLInputElement | HTMLSelectElement) {
  if (el.dataset.sfAc === undefined) el.dataset.sfAc = el.getAttribute('autocomplete') ?? ''
  el.setAttribute('autocomplete', 'off')
}
function restoreAutofill(el: HTMLInputElement | HTMLSelectElement) {
  if (el.dataset.sfAc === undefined) return
  if (el.dataset.sfAc) el.setAttribute('autocomplete', el.dataset.sfAc)
  else el.removeAttribute('autocomplete')
  delete el.dataset.sfAc
}

/** Same state, however it is written: no accents, case, "Estado de ...", the CDMX and Estado de México aliases, or the catalog's name/code. */
function canonPlace(v: string, kind: 'province' | 'city', provinces?: readonly { name: string; code?: string | null }[] | null): string {
  let s = fold(v).replace(/[.,]/g, '').replace(/\s+/g, ' ')
  if (kind === 'province' && provinces?.length) {
    const hit = provinces.find((p) => fold(p.name).replace(/[.,]/g, '') === s || (!!p.code && fold(p.code) === s))
    if (hit) s = fold(hit.name).replace(/[.,]/g, '').replace(/\s+/g, ' ')
  }
  if (/^(cdmx|d f|df|distrito federal|ciudad de mexico|mexico city)$/.test(s)) return 'ciudad de mexico'
  if (kind === 'province') {
    if (/^(mexico|edomex|edo mex|edo de mexico|estado de mexico|state of mexico)$/.test(s)) return 'estado de mexico'
    return s.replace(/^estado de /, '')
  }
  return s.replace(/^(municipio|alcaldia|ciudad) de /, '')
}

/** Locks a field the lookup just filled: read-only for an `<input>`, disabled + a hidden mirror for a `<select>`. */
function lockField(el: HTMLInputElement | HTMLSelectElement) {
  if (el.dataset.sfLocked === '1') return
  el.dataset.sfLocked = '1'
  el.setAttribute('aria-readonly', 'true')
  suppressAutofill(el)
  if (el instanceof HTMLSelectElement) {
    // A disabled `<select>` would stop submitting its value: a hidden sibling keeps it in the form.
    const name = el.getAttribute('name')
    if (name) {
      el.dataset.sfName = name
      const hidden = document.createElement('input')
      hidden.type = 'hidden'
      hidden.dataset.sfLockMirror = '1'
      hidden.name = name
      hidden.value = el.value
      el.insertAdjacentElement('afterend', hidden)
      el.removeAttribute('name')
    }
    el.disabled = true
  } else {
    el.readOnly = true
  }
}

/** Undoes `lockField`: the field is editable again and, when the lookup filled it, empty (its value belonged to the old postal code). */
function unlockField(el: HTMLInputElement | HTMLSelectElement) {
  if (el.dataset.sfLocked !== '1') return
  delete el.dataset.sfLocked
  el.removeAttribute('aria-readonly')
  el.removeAttribute('title')
  restoreAutofill(el)
  if (el instanceof HTMLSelectElement) {
    const mirror = el.nextElementSibling
    if (mirror instanceof HTMLInputElement && mirror.dataset.sfLockMirror === '1') mirror.remove()
    if (el.dataset.sfName) el.setAttribute('name', el.dataset.sfName)
    delete el.dataset.sfName
    el.disabled = false
  } else {
    el.readOnly = false
  }
}

/** Name of the property set to `true` on every event the lookup dispatches when it fills a field. */
export const ADDRESS_FILL_EVENT_FLAG = 'sfSynthetic'

/**
 * Was this `input` event dispatched by `AddressFields` itself (a postal-code fill) and not typed by the buyer? The shop's
 * own listeners (validation, autosave, delivery re-quote...) can ignore these. Real typing has `isTrusted: true`.
 */
export function isAddressFillEvent(event: Event): boolean {
  return (event as unknown as Record<string, unknown>)[ADDRESS_FILL_EVENT_FLAG] === true
}

// Clients whose market answered "no suggestion provider": no field of the page asks again.
const unavailableClients = new WeakSet<object>()

const SR_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const
const sameText = (a: string, b: string) => fold(a) === fold(b)
const fold = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

export function AddressFields(props: AddressFieldsProps) {
  const { defaults, names = {}, errors = {}, countryCode, provinces, postalCode, lookupPostalCode, suggestAddress, onSuggestionChosen, suggestAttribution, lockProvinceOnFill = true, lockCityOnFill = lockProvinceOnFill, hideResolvedFields = true, locale, messages, fieldMessages: fm, classNames: cx = {}, children } = props
  const showNeighborhood = props.neighborhood ?? true
  const showReference = props.reference ?? true
  const m = addressFieldsMessages(locale, messages)
  const n = (k: AddressFieldKey | 'province_code') => names[k] ?? k
  const common = { ...(locale ? { locale } : {}), ...(fm ? { messages: fm } : {}) }
  const listId = useId()
  const [colonias, setColonias] = useState<readonly string[]>([])
  const [filled, setFilled] = useState(false)
  // The last complete code is not in the lookup: say so (state and city stay editable).
  const [notFound, setNotFound] = useState(false)
  const [provinceLocked, setProvinceLocked] = useState(false)
  const [cityLocked, setCityLocked] = useState(false)
  // What the buyer typed differs from the postal code's state/city: the value (the code's) to tell them about.
  const [mismatch, setMismatch] = useState<{ province?: string; city?: string }>({})
  const [coloniaSelect, setColoniaSelect] = useState(false)
  // A lookup is in flight: the fields that depend on the code are dimmed and busy so they do not look valid.
  const [pending, setPending] = useState(false)
  // State and city the postal code defined, shown as one line (not as inputs) while it holds.
  const [resolved, setResolved] = useState<{ province: string; provinceCode: string | null; city: string; place: string } | null>(null)
  const resolvedRef = useRef(false)
  // Once the lookup has decided (or released) them, the saved defaults no longer describe the address.
  const [defaultsStale, setDefaultsStale] = useState(false)
  const coloniaSelectRef = useRef(false)
  // Switching the colonia between text and list remounts the field: what it should hold is carried to the new element.
  const coloniaCarry = useRef<{ value: string; autofilled: boolean; userEdited: boolean } | null>(null)
  const lastZip = useRef<string | null>(null)
  const zipRef = useRef<HTMLDivElement>(null)
  // Default lookup: the region pack's catalog through the Storefront API of the surrounding <StorefrontProvider> (browser
  // client, `pk_` token). The prop overrides it (a same-origin route of the shop, another source).
  const sf = useOptionalStorefront()
  const providerClient = sf?.client ?? null
  const lookupDefault = providerClient ? (zip: string): Promise<PostalCodeInfo | null> => providerClient.postalCode(zip) : undefined
  const lookupRef = useRef(lookupPostalCode ?? lookupDefault)
  lookupRef.current = lookupPostalCode ?? lookupDefault
  // Street suggestions: the market's provider through the same client, unless the shop passes its own source or turns it off.
  const suggestDefault: SuggestAddress | undefined =
    providerClient && typeof providerClient.addressSuggest === 'function'
      ? async (q, ctx) => {
          if (unavailableClients.has(providerClient)) return { suggestions: [], available: false }
          const params = { q, country: ctx.country, ...(ctx.zip ? { zip: ctx.zip } : {}), ...(ctx.locale ? { locale: ctx.locale.slice(0, 2) } : {}) }
          return providerClient.addressSuggest(params, { signal: ctx.signal })
        }
      : undefined
  const suggest = suggestAddress === false ? undefined : (suggestAddress ?? suggestDefault)
  // The lookup of the code currently in flight (its colonias are not known yet).
  const lookupPending = useRef<string | null>(null)
  // ONE writer: lookup results are applied one after another, never interleaved (two lookups answering close together
  // would otherwise write the same fields and fire their events at the same time).
  const writer = useRef<Promise<void>>(Promise.resolve())
  const enqueue = (task: () => void) => {
    writer.current = writer.current.then(task).catch(() => {})
  }

  // A field the buyer edited is theirs. "Edited" means they TYPED: a real input/change (`isTrusted`) that follows their own
  // keys, paste, drop or (on a list) pointer/keys. The browser's address autofill also fires trusted input/change events but
  // with no keys on the field: that is not the buyer's text, so the postal code's state and city can still replace it.
  useEffect(() => {
    const form = zipRef.current?.closest('form')
    if (!form) return
    const field = (e: Event) => {
      const el = e.target as HTMLElement | null
      return el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el : null
    }
    const touch = (e: Event) => {
      const el = field(e)
      if (el) el.dataset.sfTyped = '1'
    }
    const key = (e: Event) => {
      const k = (e as KeyboardEvent).key
      if (k && (k.length === 1 || k === 'Backspace' || k === 'Delete' || k === 'Unidentified' || k === 'Process' || k === 'Enter' || k === ' ')) touch(e)
    }
    const beforeInput = (e: Event) => {
      const t = (e as InputEvent).inputType
      if (t && t !== 'insertReplacementText') touch(e)
    }
    const pointer = (e: Event) => {
      if (field(e) instanceof HTMLSelectElement) touch(e)
    }
    const mark = (e: Event) => {
      if (!e.isTrusted) return
      const el = field(e)
      if (!el) return
      if (el.dataset.sfTyped === '1') {
        el.dataset.sfUserEdited = '1'
        delete el.dataset.sfAutofilled
        delete el.dataset.sfBrowserFilled
      } else if (el.dataset.sfLocked !== '1') {
        // Browser autofill: not theirs, not ours either (the lookup may replace it).
        el.dataset.sfBrowserFilled = '1'
      }
    }
    const events: Array<[string, (e: Event) => void]> = [
      ['keydown', key],
      ['paste', touch],
      ['drop', touch],
      ['cut', touch],
      ['compositionstart', touch],
      ['beforeinput', beforeInput],
      ['pointerdown', pointer],
      ['input', mark],
      ['change', mark],
    ]
    for (const [name, fn] of events) form.addEventListener(name, fn, true)
    return () => {
      for (const [name, fn] of events) form.removeEventListener(name, fn, true)
    }
  }, [])

  // The state was the old postal code's: free it and drop what the lookup filled (state, city, colonia) so nothing stale stays.
  const releaseLookup = () => {
    const form = zipRef.current?.closest('form')
    if (!form) return
    const touched: Array<HTMLInputElement | HTMLSelectElement> = []
    for (const locked of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-sf-locked="1"]')) {
      unlockField(locked)
      touched.push(locked)
    }
    for (const key of ['province', 'city'] as const) {
      const el = form.elements.namedItem(n(key)) as HTMLInputElement | HTMLSelectElement | null
      if (el && !('length' in el && !(el instanceof HTMLSelectElement)) && !touched.includes(el)) touched.push(el)
    }
    setDefaultsStale(true)
    for (const el of touched) {
      restoreAutofill(el)
      // State and city belonged to the old postal code (looked up, autofilled by the browser or saved defaults): they go with it.
      // Only what the buyer TYPED stays.
      if (el.dataset.sfUserEdited === '1' || el.dataset.sfTyped === '1' || !el.value) continue
      el.value = ''
      delete el.dataset.sfAutofilled
      delete el.dataset.sfBrowserFilled
      const event = new Event('input', { bubbles: true })
      Object.defineProperty(event, ADDRESS_FILL_EVENT_FLAG, { value: true })
      el.dispatchEvent(event)
    }
    lastZip.current = null
    resolvedRef.current = false
    setResolved(null)
    setProvinceLocked(false)
    setCityLocked(false)
    setMismatch({})
    setPending(false)
    setFilled(false)
  }

  // Can the lookup answer replace the state and city inputs? Only when it is complete and unambiguous, and nothing the
  // buyer wrote would be lost: otherwise the inputs stay (degradation: never leave the address impossible to complete).
  const resolveHidden = (info: PostalCodeInfo, form: HTMLFormElement | null | undefined) => {
    if (!form || !info.province || !info.city) return null
    if ((info.cities?.length ?? 0) > 1) return null
    let province = info.province.trim()
    let provinceCode: string | null = null
    if (provinces && provinces.length) {
      const hit = provinces.find((p) => sameText(p.name, province) || (!!p.code && sameText(p.code, province)))
      if (!hit) return null
      province = hit.name
      provinceCode = hit.code ?? null
    }
    const city = info.city.trim()
    if (!province || !city) return null
    const theirs = (name: string, value: string, kind: 'province' | 'city') => {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null
      if (!el || ('length' in el && !(el instanceof HTMLSelectElement))) return false
      // Something the buyer TYPED that the code does not say: theirs, not ours to replace (browser autofill is not).
      return !!el.value && (el.dataset.sfUserEdited === '1' || el.dataset.sfTyped === '1') && canonPlace(el.value, kind, provinces) !== canonPlace(value, kind, provinces)
    }
    if (theirs(n('province'), province, 'province') || theirs(n('city'), city, 'city')) return null
    return { province, provinceCode, city, place: info.municipality?.trim() || city }
  }

  // The code resolves nothing (or the lookup failed): what belonged to the previous code is cleared, never left beside a different one.
  const notResolved = () => {
    const form = zipRef.current?.closest('form')
    const hood = form?.elements.namedItem(n('neighborhood')) as HTMLInputElement | HTMLSelectElement | null
    if (hood && !('length' in hood && !(hood instanceof HTMLSelectElement)) && hood.value && hood.dataset.sfUserEdited !== '1' && hood.dataset.sfTyped !== '1') {
      hood.value = ''
      const ev = new Event('input', { bubbles: true })
      Object.defineProperty(ev, ADDRESS_FILL_EVENT_FLAG, { value: true })
      hood.dispatchEvent(ev)
    }
    setColonias([])
    coloniaSelectRef.current = false
    setColoniaSelect(false)
    setNotFound(true)
  }

  const runLookup = (zip: string) => {
    const lookup = lookupRef.current
    if (!lookup || !zip || zip === lastZip.current) return
    if (postalCode?.pattern && !new RegExp(`^(?:${postalCode.pattern})$`).test(zip)) return
    lastZip.current = zip
    lookupPending.current = zip
    setPending(true)
    setNotFound(false)
    const form = zipRef.current?.closest('form')
    void lookup(zip).then(
      (info) => {
        if (lookupPending.current === zip) lookupPending.current = null
        if (lastZip.current === zip) setPending(false)
        if (!info) {
          if (lastZip.current === zip) notResolved()
          return
        }
        enqueue(() => {
          if (lastZip.current !== zip) return
          const fill = (name: string, value: string | null | undefined, lock?: 'province' | 'city') => {
            const el = form?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null
            if (!el || !value || ('length' in el && !(el instanceof HTMLSelectElement))) return false
            // Already locked from a previous lookup: leave it (the buyer corrects the postal code instead).
            if (el.dataset.sfLocked === '1') return false
            const hasValue = !!el.value
            const theirs = el.dataset.sfUserEdited === '1' || el.dataset.sfTyped === '1'
            if (lock) {
              // The postal code defines state and city. What the browser autofilled (same or different) never wins over it;
              // what the buyer TYPED stays only when it differs from the code's, with a note (the server validates the pair).
              if (theirs) {
                if (hasValue && canonPlace(el.value, lock, lock === 'province' ? provinces : undefined) !== canonPlace(value, lock, lock === 'province' ? provinces : undefined)) {
                  setMismatch((prev) => ({ ...prev, [lock]: value }))
                  suppressAutofill(el)
                  return false
                }
                if (!hasValue) return false
              }
            } else {
              // Never over what they edited, nor over text in the field they are typing in. A focused field that is still
              // empty (Tab from the postal code lands on the next one) is filled: nothing of theirs is overwritten.
              if (theirs || (el.ownerDocument.activeElement === el && el.value)) return false
              // Only an empty field, or one this lookup filled before: never what the buyer typed.
              if (el.value && el.dataset.sfAutofilled !== '1') return false
            }
            if (el instanceof HTMLSelectElement && ![...el.options].some((o) => o.value === value)) return false
            el.value = value
            el.dataset.sfAutofilled = '1'
            delete el.dataset.sfBrowserFilled
            if (lock) {
              // From here on the value is the catalog's, not the buyer's: a new postal code replaces it.
              delete el.dataset.sfUserEdited
              delete el.dataset.sfTyped
              setMismatch((prev) => (prev[lock] ? { ...prev, [lock]: undefined } : prev))
              suppressAutofill(el)
            }
            const event = new Event('input', { bubbles: true })
            Object.defineProperty(event, ADDRESS_FILL_EVENT_FLAG, { value: true })
            el.dispatchEvent(event)
            if (lock) {
              lockField(el)
              el.title = lock === 'city' ? m.cityLocked : m.provinceLocked
              if (lock === 'city') setCityLocked(true)
              else setProvinceLocked(true)
            }
            return true
          }
          const resolution = hideResolvedFields ? resolveHidden(info, form) : null
          if (resolution) {
            resolvedRef.current = true
            setDefaultsStale(true)
            setResolved(resolution)
          }
          const a = resolution ? false : fill(n('province'), info.province, lockProvinceOnFill ? 'province' : undefined)
          const b = resolution ? false : fill(n('city'), info.city, lockCityOnFill && (info.cities?.length ?? 0) <= 1 ? 'city' : undefined)
          // A colonia of the previous code that the new code does not list is cleared; one it lists stays.
          const hoodNow = showNeighborhood ? (form?.elements.namedItem(n('neighborhood')) as HTMLInputElement | HTMLSelectElement | null) : null
          if (hoodNow && !('length' in hoodNow && !(hoodNow instanceof HTMLSelectElement)) && hoodNow.value && hoodNow.dataset.sfUserEdited !== '1' && hoodNow.dataset.sfTyped !== '1' && (info.neighborhoods?.length ?? 0) > 0 && !info.neighborhoods!.some((c) => sameText(c, hoodNow.value))) {
            hoodNow.value = ''
            delete hoodNow.dataset.sfAutofilled
            delete hoodNow.dataset.sfBrowserFilled
          }
          // Colonia only when the code has exactly ONE: with several the buyer chooses (the list is offered, not applied).
          const only = info.neighborhoods?.length === 1 ? info.neighborhoods[0] : null
          const c = showNeighborhood ? fill(n('neighborhood'), only) : false
          setColonias(info.neighborhoods ?? [])
          const list = info.neighborhoods ?? []
          const nameEl = form?.elements.namedItem(n('neighborhood')) as HTMLInputElement | HTMLSelectElement | null
          const el = nameEl && !('length' in nameEl && !(nameEl instanceof HTMLSelectElement)) ? nameEl : null
          const typed = el ? el.value : ''
          const wantSelect = props.neighborhoodList === 'select' && showNeighborhood !== false && list.length > 1 && (!typed || list.includes(typed))
          let carried = false
          if (showNeighborhood && wantSelect !== coloniaSelectRef.current) {
            const userEdited = el?.dataset.sfUserEdited === '1'
            // The single colonia of the new code wins over a previous autofill, never over what the buyer chose.
            const value = only && !userEdited ? only : wantSelect ? (list.includes(typed) ? typed : '') : typed
            coloniaCarry.current = { value, autofilled: !userEdited && (!!only || el?.dataset.sfAutofilled === '1'), userEdited }
            carried = !!only && !userEdited
          }
          coloniaSelectRef.current = wantSelect
          setColoniaSelect(wantSelect)
          setFilled(!resolution && (a || b || c || carried))
        })
      },
      () => {
        /* lookup failed: the buyer types state and city */
        if (lookupPending.current === zip) lookupPending.current = null
        if (lastZip.current === zip) {
          setPending(false)
          notResolved()
        }
      },
    )
  }

  // An accepted street suggestion. Street and number are the point; the postal code only when empty; the colonia only from
  // the postal code's catalog (or when the catalog has none); never state or city (the catalog is the authority).
  const chooseSuggestion = (sg: import('@asteby/storefront').AddressSuggestion) => {
    const form = zipRef.current?.closest('form')
    if (!form) return
    const el = (name: string) => {
      const e = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null
      return e && !('length' in e && !(e instanceof HTMLSelectElement)) ? e : null
    }
    const write = (target: HTMLInputElement | HTMLSelectElement, value: string, autofilled: boolean) => {
      target.value = value
      if (autofilled) target.dataset.sfAutofilled = '1'
      const event = new Event('input', { bubbles: true })
      Object.defineProperty(event, ADDRESS_FILL_EVENT_FLAG, { value: true })
      target.dispatchEvent(event)
    }
    const zipEl = el(n('zip')) as HTMLInputElement | null
    const zipNow = zipEl?.value.trim() ?? ''
    // A candidate of another postal code than the one in the form is not for this address (the server drops them; so do we).
    if (sg.zip && zipNow && sg.zip.replace(/\s/g, '').toLowerCase() !== zipNow.replace(/\s/g, '').toLowerCase()) return
    const street = sg.street?.trim()
    const line = street ? [street, sg.house_number?.trim()].filter(Boolean).join(' ') : ''
    const lineEl = el(n('address1'))
    if (line && lineEl) write(lineEl, line, false)
    if (!zipNow && sg.zip && zipEl && (!postalCode?.pattern || new RegExp(`^(?:${postalCode.pattern})$`).test(sg.zip.trim()))) {
      write(zipEl, sg.zip.trim(), true)
      runLookup(sg.zip.trim())
    }
    const hood = sg.neighborhood?.trim()
    const hoodEl = showNeighborhood ? el(n('neighborhood')) : null
    if (hood && hoodEl && lookupPending.current === null && !(hoodEl.dataset.sfUserEdited === '1' || (hoodEl.value && hoodEl.dataset.sfAutofilled !== '1'))) {
      const official = colonias.find((c) => sameText(c, hood))
      // The catalog's spelling when it knows the colonia; the suggestion's only when the catalog has no colonias for this code.
      const value = official ?? (colonias.length === 0 && zipEl?.value.trim() ? hood : null)
      if (value && !(hoodEl instanceof HTMLSelectElement && ![...hoodEl.options].some((o) => o.value === value))) write(hoodEl, value, true)
    }
    onSuggestionChosen?.(sg)
  }

  // Applies the carried colonia to the field that replaced the old one (text <-> list), like any fill.
  useEffect(() => {
    const carry = coloniaCarry.current
    coloniaCarry.current = null
    if (!carry || !carry.value) return
    const form = zipRef.current?.closest('form')
    const el = form?.elements.namedItem(n('neighborhood')) as HTMLInputElement | HTMLSelectElement | null
    if (!el || ('length' in el && !(el instanceof HTMLSelectElement))) return
    if (el instanceof HTMLSelectElement && ![...el.options].some((o) => o.value === carry.value)) return
    el.value = carry.value
    if (carry.userEdited) el.dataset.sfUserEdited = '1'
    else if (carry.autofilled) el.dataset.sfAutofilled = '1'
    const event = new Event('input', { bubbles: true })
    Object.defineProperty(event, ADDRESS_FILL_EVENT_FLAG, { value: true })
    el.dispatchEvent(event)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coloniaSelect])

  useEffect(() => {
    const zip = defaults?.zip
    if (zip) runLookup(zip)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // After the fields are swapped (lookup resolved / released) the form says so, so listeners (the delivery re-quote) look again.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const form = zipRef.current?.closest('form')
    const el = (resolved ? form?.querySelector<HTMLElement>('input[type="hidden"][data-sf-resolved-field="city"]') : null) ?? zipRef.current?.querySelector('input')
    if (!el) return
    const event = new Event('input', { bubbles: true })
    Object.defineProperty(event, ADDRESS_FILL_EVENT_FLAG, { value: true })
    el.dispatchEvent(event)
  }, [resolved])

  const hasLock = (root: HTMLElement | null) => resolvedRef.current || !!root?.closest('form')?.querySelector('[data-sf-locked="1"]')
  const changeZip = () => {
    releaseLookup()
    const zipEl = zipRef.current?.querySelector('input')
    zipEl?.focus()
    zipEl?.select()
  }
  const lockHint = (text: string) => (
    <span data-sf-province-locked="" title={text}>
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: 4 }}>
        <rect x="4" y="11" width="16" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      {text}
      {' · '}
      <button type="button" data-sf-change-zip="" onClick={changeZip} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
        {m.changePostalCode}
      </button>
    </span>
  )
  const provinceHint = provinceLocked ? lockHint(m.provinceLocked) : mismatch.province ? m.provinceMismatch.replace('{value}', mismatch.province) : undefined
  const cityHint = cityLocked ? lockHint(m.cityLocked) : mismatch.city ? m.cityMismatch.replace('{value}', mismatch.city) : undefined
  const numericZip = postalCode?.inputMode === 'numeric'
  // A server error on state/city must be seen next to a field the buyer can fix: inputs come back (with what was resolved).
  const showResolved = !!resolved && !errors[n('province')] && !errors[n('city')]
  const showNotFound = notFound && !filled && !showResolved && !errors[n('zip')]
  const startOf = (key: 'province' | 'city') => (resolved ? resolved[key] : defaultsStale ? '' : (defaults?.[key] ?? ''))
  return (
    <>
      <div ref={zipRef} className={join(cx.half)} data-sf-zip>
        <CheckoutField
          {...common}
          name={n('zip')}
          label={m.zip}
          autoComplete="postal-code"
          inputMode={postalCode?.inputMode ?? 'text'}
          {...(postalCode?.pattern ? { pattern: postalCode.pattern } : {})}
          {...(postalCode?.maxLength ? { maxLength: postalCode.maxLength } : {})}
          {...(postalCode?.title ? { title: postalCode.title } : {})}
          {...(numericZip ? { autoCapitalize: 'none' } : {})}
          defaultValue={defaults?.zip ?? ''}
          error={errors[n('zip')] ?? null}
          classNames={{ ...cx, root: cx.root }}
          onInput={(e) => {
            const v = e.currentTarget.value.trim()
            // Editing the code that defined the state frees it (and what the lookup filled) before anything else.
            if (v !== lastZip.current && (lastZip.current !== null || hasLock(zipRef.current))) releaseLookup()
            if (v !== lastZip.current) {
              setNotFound(false)
              setMismatch({})
            }
            if (postalCode?.maxLength && v.length === postalCode.maxLength) runLookup(v)
          }}
          onBlur={(e) => runLookup(e.currentTarget.value.trim())}
        />
        {/* The lookup result, announced once (not on every keystroke): the one-line place, or the fill note. */}
        <div data-sf-resolved={showResolved ? '' : undefined} className={showResolved || filled || showNotFound ? join(cx.hint) : undefined}>
          <p role="status" aria-live="polite" data-sf-zip-status style={showResolved || filled || showNotFound ? (showResolved ? { display: 'inline', margin: 0 } : undefined) : SR_ONLY}>
            {showResolved && resolved ? (
              <>
                <span style={SR_ONLY}>{m.resolvedPlace} </span>
                <span data-sf-resolved-place>
                  {resolved.place}, {resolved.province}
                </span>
              </>
            ) : filled ? (
              m.lookupFilled
            ) : showNotFound ? (
              <span data-sf-zip-not-found>{m.postalCodeNotFound}</span>
            ) : (
              ''
            )}
          </p>
          {showResolved ? (
            <>
              {' · '}
              <button type="button" data-sf-change-zip="" onClick={changeZip} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}>
                {m.changePostalCode}
              </button>
            </>
          ) : null}
        </div>
      </div>
      {showResolved && resolved ? (
        <>
          <input type="hidden" name={n('province')} value={resolved.province} data-sf-resolved-field="province" />
          {resolved.provinceCode ? <input type="hidden" name={n('province_code')} value={resolved.provinceCode} data-sf-resolved-field="province_code" /> : null}
          <input type="hidden" name={n('city')} value={resolved.city} data-sf-resolved-field="city" />
        </>
      ) : null}
      {showResolved ? null : provinces && provinces.length ? (
        <CheckoutField {...common} as="select" name={n('province')} label={m.province} autoComplete="address-level1" {...(pending ? { 'aria-busy': true, 'data-sf-busy': '', style: { opacity: 0.55 } } : {})} defaultValue={startOf('province')} error={errors[n('province')] ?? null} classNames={field(cx, 'half')} hint={provinceHint}>
          <option value="" disabled>
            {m.provincePlaceholder}
          </option>
          {provinces.map((p) => (
            <option key={p.code ?? p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </CheckoutField>
      ) : (
        <CheckoutField {...common} name={n('province')} label={m.province} autoComplete="address-level1" {...(pending ? { 'aria-busy': true, 'data-sf-busy': '', style: { opacity: 0.55 } } : {})} defaultValue={startOf('province')} error={errors[n('province')] ?? null} classNames={field(cx, 'half')} hint={provinceHint} />
      )}
      {showResolved ? null : <CheckoutField {...common} name={n('city')} label={m.city} autoComplete="address-level2" {...(pending ? { 'aria-busy': true, 'data-sf-busy': '', style: { opacity: 0.55 } } : {})} defaultValue={startOf('city')} error={errors[n('city')] ?? null} classNames={field(cx, 'half')} hint={cityHint} />}
      {showNeighborhood && coloniaSelect ? (
        <CheckoutField
          {...common}
          as="select"
          name={n('neighborhood')}
          label={m.neighborhood}
          autoComplete="address-level3"
          optional={showNeighborhood !== 'required'}
          defaultValue={!defaultsStale && colonias.includes(defaults?.neighborhood ?? '') ? (defaults?.neighborhood ?? '') : ''}
          error={errors[n('neighborhood')] ?? null}
          classNames={field(cx, 'half')}
        >
          <option value="" disabled={showNeighborhood === 'required'}>
            {m.neighborhoodPlaceholder}
          </option>
          {colonias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </CheckoutField>
      ) : showNeighborhood ? (
        <CheckoutField
          {...common}
          name={n('neighborhood')}
          label={m.neighborhood}
          autoComplete="address-level3"
          optional={showNeighborhood !== 'required'}
          defaultValue={defaultsStale ? '' : (defaults?.neighborhood ?? '')}
          error={errors[n('neighborhood')] ?? null}
          classNames={field(cx, 'half')}
          {...(colonias.length && !coloniaSelect ? { list: listId } : {})}
        />
      ) : null}
      {colonias.length && !coloniaSelect ? (
        <datalist id={listId}>
          {colonias.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      ) : null}
      {suggest ? (
        <AddressLineField
          common={common}
          name={n('address1')}
          label={m.address1}
          defaultValue={defaults?.address1 ?? ''}
          error={errors[n('address1')] ?? null}
          hint={m.address1Hint}
          className={join(cx.wide)}
          classNames={{ ...cx, root: cx.root }}
          suggest={suggest}
          getContext={() => {
            const zipEl = zipRef.current?.closest('form')?.elements.namedItem(n('zip')) as HTMLInputElement | null
            return { zip: zipEl && 'value' in zipEl ? zipEl.value.trim() : '', country: countryCode, ...(locale ? { locale } : {}) }
          }}
          onChoose={chooseSuggestion}
          onUnavailable={() => {
            if (providerClient) unavailableClients.add(providerClient)
          }}
          messages={m}
          {...(suggestAttribution !== undefined ? { attribution: suggestAttribution } : {})}
        />
      ) : (
        <CheckoutField {...common} name={n('address1')} label={m.address1} autoComplete="address-line1" defaultValue={defaults?.address1 ?? ''} error={errors[n('address1')] ?? null} hint={m.address1Hint} classNames={field(cx, 'wide')} />
      )}
      <CheckoutField {...common} name={n('address2')} label={m.address2} autoComplete="address-line2" optional defaultValue={defaults?.address2 ?? ''} error={errors[n('address2')] ?? null} classNames={field(cx, 'half')} />
      {showReference ? (
        <CheckoutField {...common} name={n('reference')} label={m.reference} optional defaultValue={defaults?.reference ?? ''} error={errors[n('reference')] ?? null} hint={m.referenceHint} classNames={field(cx, 'wide')} maxLength={200} />
      ) : null}
      <input type="hidden" name="country_code" value={countryCode} />
      {children}
    </>
  )
}
