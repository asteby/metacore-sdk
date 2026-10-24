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
import type { Address } from '@asteby/storefront'
import { CheckoutField, type CheckoutFieldClassNames, type FieldErrors, type FieldMessages } from './fields.js'

export type AddressFieldKey = 'zip' | 'province' | 'city' | 'neighborhood' | 'address1' | 'address2' | 'reference'
export type ContactFieldKey = 'email' | 'phone' | 'first_name' | 'last_name'

export type AddressFieldsMessages = Record<AddressFieldKey | ContactFieldKey, string> & {
  provincePlaceholder: string
  address1Hint: string
  referenceHint: string
  emailHint: string
  phoneHint: string
  lookupFilled: string
}

const ES: AddressFieldsMessages = {
  email: 'Correo',
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
  address1Hint: 'Por ejemplo: Av. Insurgentes Sur 1234',
  referenceHint: 'Entre qué calles, color de la fachada…',
  emailHint: 'Te enviamos aquí la confirmación y el seguimiento.',
  phoneHint: 'Solo para la paquetería, por si necesita contactarte.',
  lookupFilled: 'Completamos estado y ciudad con tu código postal.',
}

const EN: AddressFieldsMessages = {
  email: 'Email',
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
  address1Hint: 'For example: 1234 Main St',
  referenceHint: 'Cross streets, building color…',
  emailHint: 'We send the confirmation and tracking here.',
  phoneHint: 'Only for the carrier, in case they need to reach you.',
  lookupFilled: 'We filled in state and city from your postal code.',
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
}

/** E-mail, phone, given and family name with their autofill tokens and the right mobile keyboards. */
export function ContactFields({ defaults = {}, names = {}, errors = {}, phone, hints = true, locale, messages, fieldMessages: fm, classNames: cx = {} }: ContactFieldsProps) {
  const m = addressFieldsMessages(locale, messages)
  const n = (k: ContactFieldKey) => names[k] ?? k
  const common = { ...(locale ? { locale } : {}), ...(fm ? { messages: fm } : {}) }
  return (
    <>
      <CheckoutField {...common} name={n('email')} label={m.email} type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} defaultValue={defaults.email ?? ''} error={errors[n('email')] ?? null} hint={hints ? m.emailHint : undefined} classNames={field(cx, 'wide')} />
      <CheckoutField {...common} name={n('phone')} label={m.phone} type="tel" autoComplete="tel" inputMode="tel" defaultValue={defaults.phone ?? ''} error={errors[n('phone')] ?? null} hint={hints ? m.phoneHint : undefined} classNames={field(cx, 'wide')} {...(phone?.pattern ? { pattern: phone.pattern } : {})} {...(phone?.title ? { title: phone.title } : {})} {...(phone?.minLength ? { minLength: phone.minLength } : {})} />
      <CheckoutField {...common} name={n('first_name')} label={m.first_name} autoComplete="given-name" defaultValue={defaults.first_name ?? ''} error={errors[n('first_name')] ?? null} classNames={field(cx, 'half')} />
      <CheckoutField {...common} name={n('last_name')} label={m.last_name} autoComplete="family-name" defaultValue={defaults.last_name ?? ''} error={errors[n('last_name')] ?? null} classNames={field(cx, 'half')} />
    </>
  )
}

/** What a postal-code lookup answers. Every field optional: only what the source knows. */
export type PostalCodeInfo = { province?: string | null; city?: string | null; neighborhoods?: readonly string[] | null }

export type AddressFieldsProps = Common & {
  defaults?: Partial<Pick<Address, 'zip' | 'province' | 'city' | 'neighborhood' | 'address1' | 'address2' | 'reference'>> | null
  /** Form names. Default: the keys (the `AddressInput` fields of the Storefront API). */
  names?: Partial<Record<AddressFieldKey, string>>
  /** ISO country of the address (hidden field `country_code`). */
  countryCode: string
  /** States of the country (from the region config). With them, "State" is a `<select>`; the value sent is `name`. */
  provinces?: ReadonlyArray<{ code?: string | null; name: string }> | null
  /** Postal-code format of the country (from the region config), e.g. `{ pattern: '[0-9]{5}', maxLength: 5, inputMode: 'numeric', title: '5 dígitos' }`. */
  postalCode?: { pattern?: string; maxLength?: number; inputMode?: 'numeric' | 'text'; title?: string }
  /**
   * Fills state and city (and suggests colonias) from the postal code, when the shop has a source (a same-origin
   * route over a postal-code catalog). Called once the code matches `postalCode.pattern` (or on leaving the field).
   * Never overwrites what the buyer typed.
   */
  lookupPostalCode?: (zip: string) => Promise<PostalCodeInfo | null>
  /** Show the colonia field: `true` (default, optional), `'required'`, or `false`. */
  neighborhood?: boolean | 'required'
  /** Show the delivery references field (default true, optional). */
  reference?: boolean
  /**
   * Once `lookupPostalCode` fills the state field (never over what the buyer already typed), lock it: a plain
   * `<input>` turns read-only; a `<select>` (from `provinces`) turns disabled with a hidden field that keeps
   * submitting its value. The buyer corrects the state by correcting the postal code. Default false: the filled
   * state stays as editable as any other field. Marked with `data-sf-locked="1"` for the shop's own styling.
   */
  lockProvinceOnFill?: boolean
  /** Rendered after the fields (e.g. "save this address"). */
  children?: ReactNode
}

/**
 * Shipping address in the order buyers fill it: postal code, state, city, colonia, street and number, interior and
 * references. Autofill tokens: `postal-code`, `address-level1/2/3`, `address-line1/2`. The postal code uses the
 * numeric keyboard when the country format is numeric.
 */
/** Locks a field the lookup just filled: read-only for an `<input>`, disabled + a hidden mirror for a `<select>`. */
function lockField(el: HTMLInputElement | HTMLSelectElement) {
  if (el.dataset.sfLocked === '1') return
  el.dataset.sfLocked = '1'
  el.setAttribute('aria-readonly', 'true')
  if (el instanceof HTMLSelectElement) {
    // A disabled `<select>` would stop submitting its value: a hidden sibling keeps it in the form.
    const name = el.getAttribute('name')
    if (name) {
      const hidden = document.createElement('input')
      hidden.type = 'hidden'
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

export function AddressFields(props: AddressFieldsProps) {
  const { defaults, names = {}, errors = {}, countryCode, provinces, postalCode, lookupPostalCode, lockProvinceOnFill, locale, messages, fieldMessages: fm, classNames: cx = {}, children } = props
  const showNeighborhood = props.neighborhood ?? true
  const showReference = props.reference ?? true
  const m = addressFieldsMessages(locale, messages)
  const n = (k: AddressFieldKey) => names[k] ?? k
  const common = { ...(locale ? { locale } : {}), ...(fm ? { messages: fm } : {}) }
  const listId = useId()
  const [colonias, setColonias] = useState<readonly string[]>([])
  const [filled, setFilled] = useState(false)
  const lastZip = useRef<string | null>(null)
  const zipRef = useRef<HTMLDivElement>(null)
  const lookupRef = useRef(lookupPostalCode)
  lookupRef.current = lookupPostalCode

  const runLookup = (zip: string) => {
    const lookup = lookupRef.current
    if (!lookup || !zip || zip === lastZip.current) return
    if (postalCode?.pattern && !new RegExp(`^(?:${postalCode.pattern})$`).test(zip)) return
    lastZip.current = zip
    const form = zipRef.current?.closest('form')
    void lookup(zip).then(
      (info) => {
        if (!info || lastZip.current !== zip) return
        const fill = (name: string, value: string | null | undefined, lock?: boolean) => {
          const el = form?.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null
          if (!el || !value || ('length' in el && !(el instanceof HTMLSelectElement))) return false
          // Already locked from a previous lookup: leave it (the buyer corrects the postal code instead).
          if (el.dataset.sfLocked === '1') return false
          // Only an empty field, or one this lookup filled before: never what the buyer typed.
          if (el.value && el.dataset.sfAutofilled !== '1') return false
          if (el instanceof HTMLSelectElement && ![...el.options].some((o) => o.value === value)) return false
          el.value = value
          el.dataset.sfAutofilled = '1'
          el.dispatchEvent(new Event('input', { bubbles: true }))
          if (lock) lockField(el)
          return true
        }
        const a = fill(n('province'), info.province, lockProvinceOnFill)
        const b = fill(n('city'), info.city)
        setColonias(info.neighborhoods ?? [])
        setFilled(a || b)
      },
      () => {
        /* no lookup: the buyer types state and city */
      },
    )
  }

  useEffect(() => {
    const zip = defaults?.zip
    if (zip) runLookup(zip)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const numericZip = postalCode?.inputMode === 'numeric'
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
            if (postalCode?.maxLength && v.length === postalCode.maxLength) runLookup(v)
          }}
          onBlur={(e) => runLookup(e.currentTarget.value.trim())}
        />
      </div>
      {provinces && provinces.length ? (
        <CheckoutField {...common} as="select" name={n('province')} label={m.province} autoComplete="address-level1" defaultValue={defaults?.province ?? ''} error={errors[n('province')] ?? null} classNames={field(cx, 'half')}>
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
        <CheckoutField {...common} name={n('province')} label={m.province} autoComplete="address-level1" defaultValue={defaults?.province ?? ''} error={errors[n('province')] ?? null} classNames={field(cx, 'half')} />
      )}
      <CheckoutField {...common} name={n('city')} label={m.city} autoComplete="address-level2" defaultValue={defaults?.city ?? ''} error={errors[n('city')] ?? null} classNames={field(cx, 'half')} />
      {showNeighborhood ? (
        <CheckoutField
          {...common}
          name={n('neighborhood')}
          label={m.neighborhood}
          autoComplete="address-level3"
          optional={showNeighborhood !== 'required'}
          defaultValue={defaults?.neighborhood ?? ''}
          error={errors[n('neighborhood')] ?? null}
          classNames={field(cx, 'half')}
          {...(colonias.length ? { list: listId } : {})}
        />
      ) : null}
      {colonias.length ? (
        <datalist id={listId}>
          {colonias.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      ) : null}
      {/* The lookup result, announced once (not on every keystroke). */}
      <p role="status" aria-live="polite" data-sf-zip-status style={filled ? undefined : { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }} className={filled ? join(cx.hint, cx.wide) : undefined}>
        {filled ? m.lookupFilled : ''}
      </p>
      <CheckoutField {...common} name={n('address1')} label={m.address1} autoComplete="address-line1" defaultValue={defaults?.address1 ?? ''} error={errors[n('address1')] ?? null} hint={m.address1Hint} classNames={field(cx, 'wide')} />
      <CheckoutField {...common} name={n('address2')} label={m.address2} autoComplete="address-line2" optional defaultValue={defaults?.address2 ?? ''} error={errors[n('address2')] ?? null} classNames={field(cx, 'half')} />
      {showReference ? (
        <CheckoutField {...common} name={n('reference')} label={m.reference} optional defaultValue={defaults?.reference ?? ''} error={errors[n('reference')] ?? null} hint={m.referenceHint} classNames={field(cx, 'wide')} maxLength={200} />
      ) : null}
      <input type="hidden" name="country_code" value={countryCode} />
      {children}
    </>
  )
}
