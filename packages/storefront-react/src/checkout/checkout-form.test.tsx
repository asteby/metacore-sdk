// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import axe from 'axe-core'
import { useRef } from 'react'
import type { CartCost, CartLine } from '@asteby/storefront'
import { AddressFields, ContactFields, ErrorSummary, isAddressFillEvent, OrderSummary, OrderSummaryDisclosure, useFieldErrors, type PostalCodeInfo } from './index.js'

afterEach(cleanup)

const AXE = { rules: { 'color-contrast': { enabled: false } } }

function Form({
  lookup,
  serverFields,
  provinces,
  lockProvinceOnFill,
  lockCityOnFill,
  locale,
  neighborhoodList,
  hideResolvedFields = false,
  defaults,
}: {
  lookup?: (zip: string) => Promise<PostalCodeInfo | null>
  serverFields?: string[]
  provinces?: { name: string }[]
  lockProvinceOnFill?: boolean
  lockCityOnFill?: boolean
  locale?: string
  neighborhoodList?: 'datalist' | 'select'
  /** The legacy tests exercise the inputs; the new behavior is opted in by the tests of `hideResolvedFields`. */
  hideResolvedFields?: boolean
  defaults?: { zip?: string; province?: string; city?: string }
}) {
  const ref = useRef<HTMLFormElement>(null)
  const v = useFieldErrors(ref, { serverFields: serverFields ?? null })
  return (
    <form ref={ref} onSubmit={(e) => e.preventDefault()}>
      <ErrorSummary items={v.summary} focusKey={v.summaryKey} />
      <fieldset>
        <legend>Contacto</legend>
        <ContactFields errors={v.errors} phone={{ pattern: '[0-9 ]{10,}', title: 'Escribe 10 dígitos.' }} />
      </fieldset>
      <fieldset>
        <legend>Dirección</legend>
        <AddressFields
          errors={v.errors}
          countryCode="MX"
          hideResolvedFields={hideResolvedFields}
          {...(defaults ? { defaults } : {})}
          postalCode={{ pattern: '[0-9]{5}', maxLength: 5, inputMode: 'numeric', title: 'Escribe los 5 dígitos.' }}
          {...(lookup ? { lookupPostalCode: lookup } : {})}
          {...(provinces ? { provinces } : {})}
          {...(lockProvinceOnFill !== undefined ? { lockProvinceOnFill } : {})}
          {...(lockCityOnFill !== undefined ? { lockCityOnFill } : {})}
          {...(locale ? { locale } : {})}
          {...(neighborhoodList ? { neighborhoodList } : {})}
        />
      </fieldset>
      <button type="submit">Continuar</button>
    </form>
  )
}

describe('ContactFields + AddressFields', () => {
  it('uses the autofill tokens and mobile keyboards buyers expect, in the order they fill them', () => {
    const { container } = render(<Form />)
    const tok = (name: string) => container.querySelector(`[name="${name}"]`)!.getAttribute('autocomplete')
    expect(tok('email')).toBe('email')
    expect(tok('phone')).toBe('tel')
    expect(tok('first_name')).toBe('given-name')
    expect(tok('last_name')).toBe('family-name')
    expect(tok('zip')).toBe('postal-code')
    expect(tok('province')).toBe('address-level1')
    expect(tok('city')).toBe('address-level2')
    expect(tok('neighborhood')).toBe('address-level3')
    expect(tok('address1')).toBe('address-line1')
    expect(tok('address2')).toBe('address-line2')
    expect(container.querySelector('[name="zip"]')!.getAttribute('inputmode')).toBe('numeric')
    expect(container.querySelector('[name="email"]')!.getAttribute('inputmode')).toBe('email')
    expect(container.querySelector('[name="phone"]')!.getAttribute('type')).toBe('tel')
    const order = [...container.querySelectorAll('fieldset:nth-of-type(2) [name]')].map((e) => e.getAttribute('name'))
    expect(order).toEqual(['zip', 'province', 'city', 'neighborhood', 'address1', 'address2', 'reference', 'country_code'])
    // Interior and references are optional and say so.
    expect(screen.getByLabelText(/Número interior/).hasAttribute('required')).toBe(false)
    expect(screen.getByText('Número interior o departamento').parentElement!.textContent).toContain('(opcional)')
    expect(screen.getByLabelText('Calle y número').hasAttribute('required')).toBe(true)
  })

  it('a state list turns "State" into a select', () => {
    render(<Form provinces={[{ name: 'Ciudad de México' }, { name: 'Jalisco' }]} />)
    expect(screen.getByLabelText('Estado').tagName).toBe('SELECT')
  })

  it('fills state and city from the postal code, never over what the buyer typed, and suggests colonias', async () => {
    const lookup = vi.fn(async () => ({ province: 'Ciudad de México', city: 'Cuauhtémoc', neighborhoods: ['Roma Norte', 'Roma Sur'] }))
    const { container } = render(<Form lookup={lookup} />)
    fireEvent.input(screen.getByLabelText('Ciudad o municipio'), { target: { value: 'CDMX' } })
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '0670' } })
    expect(lookup).not.toHaveBeenCalled() // incomplete code
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '06700' } })
    await waitFor(() => expect((screen.getByLabelText('Estado') as HTMLInputElement).value).toBe('Ciudad de México'))
    expect(lookup).toHaveBeenCalledWith('06700')
    expect((screen.getByLabelText('Ciudad o municipio') as HTMLInputElement).value).toBe('CDMX')
    expect([...container.querySelectorAll('datalist option')].map((o) => o.getAttribute('value'))).toEqual(['Roma Norte', 'Roma Sur'])
    expect(screen.getByLabelText(/Colonia/).getAttribute('list')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toMatch(/Completamos estado y ciudad/)
  })

  it("neighborhoodList='select' turns the colonia into a real list when the code has several, and keeps a text field for one", async () => {
    const many = render(<Form neighborhoodList="select" lookup={async () => ({ province: 'Ciudad de México', city: 'Cuauhtémoc', neighborhoods: ['Roma Norte', 'Roma Sur'] })} />)
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '06700' } })
    await waitFor(() => expect(many.container.querySelector('select[name="neighborhood"]')).not.toBeNull())
    const sel = many.container.querySelector('select[name="neighborhood"]') as HTMLSelectElement
    expect([...sel.options].map((o) => o.value)).toEqual(['', 'Roma Norte', 'Roma Sur'])
    expect(many.container.querySelector('datalist')).toBeNull()
    many.unmount()
    const one = render(<Form neighborhoodList="select" lookup={async () => ({ province: 'Jalisco', city: 'Guadalajara', neighborhoods: ['Centro'] })} />)
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '44100' } })
    await waitFor(() => expect((one.container.querySelector('[name="neighborhood"]') as HTMLInputElement).value).toBe('Centro'))
    expect(one.container.querySelector('select[name="neighborhood"]')).toBeNull()
  })

  it("neighborhoodList='select': going from a code with several colonias to one with a single colonia still fills it", async () => {
    const lookup = vi.fn(async (zip: string) =>
      zip === '06700' ? { province: 'Ciudad de México', city: 'Cuauhtémoc', neighborhoods: ['Roma Norte', 'Roma Sur'] } : { province: 'Jalisco', city: 'Guadalajara', neighborhoods: ['Centro'] },
    )
    const { container } = render(<Form neighborhoodList="select" lookup={lookup} />)
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '06700' } })
    await waitFor(() => expect(container.querySelector('select[name="neighborhood"]')).not.toBeNull())
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '44100' } })
    await waitFor(() => expect(container.querySelector('select[name="neighborhood"]')).toBeNull())
    await waitFor(() => expect((container.querySelector('[name="neighborhood"]') as HTMLInputElement).value).toBe('Centro'))
  })

  it("neighborhoodList='select' keeps a colonia the buyer already typed when it is in the list", async () => {
    const { container } = render(<Form neighborhoodList="select" lookup={async () => ({ province: 'Ciudad de México', city: 'Cuauhtémoc', neighborhoods: ['Roma Norte', 'Roma Sur'] })} />)
    fireEvent.input(container.querySelector('[name="neighborhood"]')!, { target: { value: 'Roma Sur' } })
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '06700' } })
    await waitFor(() => expect(container.querySelector('select[name="neighborhood"]')).not.toBeNull())
    expect((container.querySelector('select[name="neighborhood"]') as HTMLSelectElement).value).toBe('Roma Sur')
  })

  it('lockProvinceOnFill locks a plain state field once the lookup fills it, but never one the buyer typed', async () => {
    const lookup = vi.fn(async () => ({ province: 'Jalisco', city: 'Guadalajara', neighborhoods: [] }))
    render(<Form lookup={lookup} lockProvinceOnFill />)
    const province = screen.getByLabelText('Estado') as HTMLInputElement
    expect(province.readOnly).toBe(false)
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '44100' } })
    await waitFor(() => expect(province.value).toBe('Jalisco'))
    expect(province.readOnly).toBe(true)
    expect(province.getAttribute('aria-readonly')).toBe('true')
    expect(province.getAttribute('data-sf-locked')).toBe('1')
  })

  it('lockProvinceOnFill never locks a state the buyer already typed themselves', async () => {
    const lookup = vi.fn(async () => ({ province: 'Jalisco', city: 'Guadalajara', neighborhoods: [] }))
    render(<Form lookup={lookup} lockProvinceOnFill />)
    const province = screen.getByLabelText('Estado') as HTMLInputElement
    fireEvent.input(province, { target: { value: 'Nayarit' } })
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '44100' } })
    await waitFor(() => expect(lookup).toHaveBeenCalled())
    expect(province.value).toBe('Nayarit')
    expect(province.readOnly).toBe(false)
  })

  it('lockProvinceOnFill on a state <select> disables it but keeps submitting its value via a hidden field', async () => {
    const lookup = vi.fn(async () => ({ province: 'Jalisco', city: 'Guadalajara', neighborhoods: [] }))
    const { container } = render(<Form lookup={lookup} lockProvinceOnFill provinces={[{ name: 'Jalisco' }, { name: 'Nayarit' }]} />)
    const province = screen.getByLabelText('Estado') as HTMLSelectElement
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '44100' } })
    await waitFor(() => expect(province.value).toBe('Jalisco'))
    expect(province.disabled).toBe(true)
    expect(province.hasAttribute('name')).toBe(false)
    const hidden = container.querySelector('input[type="hidden"][name="province"]') as HTMLInputElement
    expect(hidden.value).toBe('Jalisco')
  })
})

describe('state locked by the postal code', () => {
  const jalisco = async () => ({ province: 'Jalisco', city: 'Guadalajara', neighborhoods: [] })

  it('locks by default once the lookup fills the state: lock note, tooltip and a discreet "Cambiar código postal"', async () => {
    const { container } = render(<Form lookup={jalisco} />)
    const province = screen.getByLabelText('Estado') as HTMLInputElement
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '44100' } })
    await waitFor(() => expect(province.readOnly).toBe(true))
    expect(province.title).toBe('Definido por tu código postal')
    const note = container.querySelector('[data-sf-province-locked]')!
    expect(note.textContent).toContain('Definido por tu código postal')
    expect(container.querySelector('[data-sf-change-zip]')?.textContent).toBe('Cambiar código postal')
    // The note is the field's description, so a screen reader hears why it cannot be edited.
    expect(province.getAttribute('aria-describedby')).toContain('province-hint')
  })

  it('lockProvinceOnFill={false} keeps the filled state editable and shows no lock', async () => {
    const { container } = render(<Form lookup={jalisco} lockProvinceOnFill={false} />)
    const province = screen.getByLabelText('Estado') as HTMLInputElement
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '44100' } })
    await waitFor(() => expect(province.value).toBe('Jalisco'))
    expect(province.readOnly).toBe(false)
    expect(container.querySelector('[data-sf-province-locked]')).toBeNull()
  })

  it('editing the postal code releases the lock and clears what the lookup filled; a new code fills and locks again', async () => {
    const lookup = vi.fn(async (zip: string) => (zip === '44100' ? { province: 'Jalisco', city: 'Guadalajara', neighborhoods: [] } : { province: 'Nayarit', city: 'Tepic', neighborhoods: [] }))
    const { container } = render(<Form lookup={lookup} />)
    const province = screen.getByLabelText('Estado') as HTMLInputElement
    const city = screen.getByLabelText('Ciudad o municipio') as HTMLInputElement
    const zip = screen.getByLabelText('Código postal')
    fireEvent.input(zip, { target: { value: '44100' } })
    await waitFor(() => expect(province.readOnly).toBe(true))
    fireEvent.input(zip, { target: { value: '6300' } })
    expect(province.readOnly).toBe(false)
    expect(province.value).toBe('')
    expect(city.value).toBe('')
    expect(province.hasAttribute('data-sf-locked')).toBe(false)
    expect(container.querySelector('[data-sf-province-locked]')).toBeNull()
    fireEvent.input(zip, { target: { value: '63000' } })
    await waitFor(() => expect(province.value).toBe('Nayarit'))
    expect(province.readOnly).toBe(true)
    expect(city.value).toBe('Tepic')
  })

  it('a new postal code that resolves nothing leaves the state empty and editable (never the old state)', async () => {
    const lookup = vi.fn(async (zip: string) => (zip === '44100' ? { province: 'Jalisco', city: 'Guadalajara', neighborhoods: [] } : null))
    render(<Form lookup={lookup} />)
    const province = screen.getByLabelText('Estado') as HTMLInputElement
    const zip = screen.getByLabelText('Código postal')
    fireEvent.input(zip, { target: { value: '44100' } })
    await waitFor(() => expect(province.readOnly).toBe(true))
    fireEvent.input(zip, { target: { value: '99999' } })
    await waitFor(() => expect(lookup).toHaveBeenCalledWith('99999'))
    expect(province.value).toBe('')
    expect(province.readOnly).toBe(false)
    fireEvent.input(province, { target: { value: 'Yucatán' } })
    expect(province.value).toBe('Yucatán')
  })

  it('"Cambiar código postal" frees the state and puts the cursor in the postal code', async () => {
    const { container } = render(<Form lookup={jalisco} />)
    const province = screen.getByLabelText('Estado') as HTMLInputElement
    const zip = screen.getByLabelText('Código postal') as HTMLInputElement
    fireEvent.input(zip, { target: { value: '44100' } })
    await waitFor(() => expect(province.readOnly).toBe(true))
    fireEvent.click(container.querySelector('[data-sf-change-zip]')!)
    expect(province.readOnly).toBe(false)
    expect(province.value).toBe('')
    expect(document.activeElement).toBe(zip)
    // The same code typed again looks up again and locks again.
    fireEvent.input(zip, { target: { value: '44100' } })
    await waitFor(() => expect(province.value).toBe('Jalisco'))
    expect(province.readOnly).toBe(true)
  })

  it('a state <select> gets its name back (and loses the hidden mirror) when released', async () => {
    const { container } = render(<Form lookup={jalisco} provinces={[{ name: 'Jalisco' }, { name: 'Nayarit' }]} />)
    const province = screen.getByLabelText('Estado') as HTMLSelectElement
    const zip = screen.getByLabelText('Código postal')
    fireEvent.input(zip, { target: { value: '44100' } })
    await waitFor(() => expect(province.disabled).toBe(true))
    expect(container.querySelectorAll('input[type="hidden"][name="province"]')).toHaveLength(1)
    fireEvent.input(zip, { target: { value: '4410' } })
    expect(province.disabled).toBe(false)
    expect(province.getAttribute('name')).toBe('province')
    expect(container.querySelector('input[type="hidden"][name="province"]')).toBeNull()
    expect(province.value).toBe('')
  })

  it('never clears a state the buyer chose themselves when the postal code changes', async () => {
    render(<Form lookup={jalisco} />)
    const province = screen.getByLabelText('Estado') as HTMLInputElement
    fireEvent.input(province, { target: { value: 'Nayarit' } })
    const zip = screen.getByLabelText('Código postal')
    fireEvent.input(zip, { target: { value: '44100' } })
    fireEvent.input(zip, { target: { value: '4410' } })
    expect(province.value).toBe('Nayarit')
  })

  it('has no axe violations while locked', async () => {
    const { container } = render(<Form lookup={jalisco} />)
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '44100' } })
    await waitFor(() => expect(container.querySelector('[data-sf-province-locked]')).not.toBeNull())
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })
})

describe('city locked by the postal code', () => {
  const lookup = vi.fn(async (zip: string) => {
    if (zip === '44100') return { province: 'Jalisco', city: 'Guadalajara', neighborhoods: ['Centro', 'Americana'] }
    if (zip === '63000') return { province: 'Nayarit', city: 'Tepic', neighborhoods: [] }
    return null
  })
  const zipOf = () => screen.getByLabelText('Código postal') as HTMLInputElement
  const cityOf = () => screen.getByLabelText('Ciudad o municipio') as HTMLInputElement
  const provinceOf = () => screen.getByLabelText('Estado') as HTMLInputElement

  it('resolved: state and city are read-only (never disabled) with the same note, and colonia stays editable', async () => {
    const { container } = render(<Form lookup={lookup} />)
    fireEvent.input(zipOf(), { target: { value: '44100' } })
    await waitFor(() => expect(cityOf().readOnly).toBe(true))
    expect(provinceOf().readOnly).toBe(true)
    expect(cityOf().value).toBe('Guadalajara')
    expect(provinceOf().value).toBe('Jalisco')
    expect(cityOf().disabled).toBe(false)
    expect(cityOf().getAttribute('aria-readonly')).toBe('true')
    expect(cityOf().title).toBe('Definido por tu código postal')
    expect(cityOf().getAttribute('aria-describedby')).toContain('city-hint')
    expect(container.querySelectorAll('[data-sf-province-locked]')).toHaveLength(2)
    const colonia = screen.getByLabelText(/Colonia/) as HTMLInputElement
    expect(colonia.readOnly).toBe(false)
    expect(colonia.disabled).toBe(false)
  })

  it('the locked values travel in the submitted form data', async () => {
    const { container } = render(<Form lookup={lookup} />)
    fireEvent.input(zipOf(), { target: { value: '44100' } })
    await waitFor(() => expect(cityOf().readOnly).toBe(true))
    const data = new FormData(container.querySelector('form')!)
    expect(data.get('city')).toBe('Guadalajara')
    expect(data.get('province')).toBe('Jalisco')
  })

  it('not resolved (unknown code or no connection): city stays editable', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline')
    })
    render(<Form lookup={failing} />)
    fireEvent.input(zipOf(), { target: { value: '99999' } })
    await waitFor(() => expect(failing).toHaveBeenCalled())
    expect(cityOf().readOnly).toBe(false)
    fireEvent.input(cityOf(), { target: { value: 'Mérida' } })
    expect(cityOf().value).toBe('Mérida')
    cleanup()
    render(<Form lookup={lookup} />)
    fireEvent.input(zipOf(), { target: { value: '99999' } })
    await waitFor(() => expect(lookup).toHaveBeenCalledWith('99999'))
    expect(cityOf().readOnly).toBe(false)
    expect(provinceOf().readOnly).toBe(false)
  })

  it('changing the postal code re-resolves: values refresh, and a code that resolves nothing frees the city', async () => {
    render(<Form lookup={lookup} />)
    fireEvent.input(zipOf(), { target: { value: '44100' } })
    await waitFor(() => expect(cityOf().readOnly).toBe(true))
    fireEvent.input(zipOf(), { target: { value: '6300' } })
    expect(cityOf().readOnly).toBe(false)
    expect(cityOf().value).toBe('')
    fireEvent.input(zipOf(), { target: { value: '63000' } })
    await waitFor(() => expect(cityOf().value).toBe('Tepic'))
    expect(cityOf().readOnly).toBe(true)
    expect(provinceOf().value).toBe('Nayarit')
    fireEvent.input(zipOf(), { target: { value: '9999' } })
    fireEvent.input(zipOf(), { target: { value: '99999' } })
    await waitFor(() => expect(lookup).toHaveBeenCalledWith('99999'))
    expect(cityOf().readOnly).toBe(false)
    expect(cityOf().value).toBe('')
  })

  it('"Cambiar código postal" frees both fields', async () => {
    const { container } = render(<Form lookup={lookup} />)
    fireEvent.input(zipOf(), { target: { value: '44100' } })
    await waitFor(() => expect(cityOf().readOnly).toBe(true))
    fireEvent.click(container.querySelector('[data-sf-change-zip]')!)
    expect(cityOf().readOnly).toBe(false)
    expect(provinceOf().readOnly).toBe(false)
    expect(document.activeElement).toBe(zipOf())
  })

  it('never locks a city the buyer typed, an ambiguous code, or when lockCityOnFill={false}', async () => {
    render(<Form lookup={lookup} />)
    fireEvent.input(cityOf(), { target: { value: 'Zapopan' } })
    fireEvent.input(zipOf(), { target: { value: '44100' } })
    await waitFor(() => expect(provinceOf().readOnly).toBe(true))
    expect(cityOf().value).toBe('Zapopan')
    expect(cityOf().readOnly).toBe(false)
    cleanup()
    const ambiguous = vi.fn(async () => ({ province: 'Jalisco', city: 'Guadalajara', cities: ['Guadalajara', 'Zapopan'], neighborhoods: [] }))
    render(<Form lookup={ambiguous} />)
    fireEvent.input(zipOf(), { target: { value: '44100' } })
    await waitFor(() => expect(provinceOf().readOnly).toBe(true))
    expect(cityOf().readOnly).toBe(false)
    cleanup()
    render(<Form lookup={lookup} lockCityOnFill={false} />)
    fireEvent.input(zipOf(), { target: { value: '44100' } })
    await waitFor(() => expect(provinceOf().readOnly).toBe(true))
    expect(cityOf().value).toBe('Guadalajara')
    expect(cityOf().readOnly).toBe(false)
  })

  it('English note and no axe violations while locked', async () => {
    const { container } = render(<Form lookup={lookup} />)
    fireEvent.input(zipOf(), { target: { value: '44100' } })
    await waitFor(() => expect(cityOf().readOnly).toBe(true))
    expect((await axe.run(container, AXE)).violations).toEqual([])
    cleanup()
    const en = render(<Form lookup={lookup} locale="en-US" />)
    fireEvent.input(en.getByLabelText('Postal code'), { target: { value: '44100' } })
    await waitFor(() => expect((en.getByLabelText('City') as HTMLInputElement).readOnly).toBe(true))
    expect((en.getByLabelText('City') as HTMLInputElement).title).toBe('Set by your postal code')
  })
})

describe('useFieldErrors + ErrorSummary', () => {
  it('leaving a field with a bad value shows the error under it; fixing it clears it', async () => {
    render(<Form />)
    const email = screen.getByLabelText('Correo')
    fireEvent.input(email, { target: { value: 'ana@' } })
    fireEvent.focusOut(email)
    await screen.findByText(/Escribe un correo válido/)
    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toContain('email-error')
    fireEvent.input(email, { target: { value: 'ana@correo.com' } })
    await waitFor(() => expect(screen.queryByText(/Escribe un correo válido/)).toBeNull())
    // Tabbing through an empty field is not an error yet.
    fireEvent.focusOut(screen.getByLabelText('Nombre'))
    expect(screen.queryByText('Completa este campo.')).toBeNull()
  })

  it('a submit with problems lists them in a focused summary with links, instead of browser bubbles', async () => {
    const { container } = render(<Form />)
    await act(async () => {
      container.querySelector('form')!.reportValidity()
      await Promise.resolve()
    })
    const summary = await screen.findByRole('alert')
    expect(summary.textContent).toMatch(/Revisa \d+ campos para continuar/)
    expect(document.activeElement).toBe(summary)
    const link = screen.getByRole('link', { name: /Correo: Completa este campo/ })
    expect(link.getAttribute('href')).toBe('#email')
    fireEvent.click(link)
    expect(document.activeElement).toBe(screen.getByLabelText('Correo'))
    expect(screen.getAllByText('Completa este campo.').length).toBeGreaterThan(3)
  })

  it('server errors show inline and in the summary', async () => {
    render(<Form serverFields={['zip']} />)
    await screen.findByRole('alert')
    expect(screen.getByRole('link', { name: 'Código postal: Revisa este campo.' })).toBeTruthy()
    expect(screen.getByLabelText('Código postal').getAttribute('aria-invalid')).toBe('true')
  })

  it('has no axe violations, also with errors', async () => {
    const { container } = render(<Form />)
    expect((await axe.run(container, AXE)).violations.map((v) => v.id)).toEqual([])
    await act(async () => {
      container.querySelector('form')!.reportValidity()
      await Promise.resolve()
    })
    await screen.findByRole('alert')
    expect((await axe.run(container, AXE)).violations.map((v) => v.id)).toEqual([])
  })

  it('server HTML is a plain form that validates without JavaScript', () => {
    const html = renderToString(<Form />)
    expect(html).toContain('required=""')
    expect(html).toContain('pattern="[0-9]{5}"')
    expect(html).not.toContain('role="alert"')
  })
})

const mxn = (amount: string) => ({ amount, currency_code: 'MXN' })
const line = (id: string, title: string, qty: number, total: string): CartLine => ({
  id,
  quantity: qty,
  merchandise: { id: `v-${id}`, sku: id, title: 'Default Title', selected_options: [], price: mxn(total), compare_at_price: null, available_for_sale: true, quantity_available: null, image: null, barcode: null, product: { handle: id, title, featured_image: null } },
  cost: { total: mxn(total), unit: mxn(total), compare_at_unit: null },
})
const cost = (over: Partial<CartCost> = {}): CartCost => ({ subtotal: mxn('749.00'), discount: mxn('0'), shipping: null, tax: null, total: mxn('749.00'), tax_included: true, ...over })

describe('OrderSummary', () => {
  it('prints the server totals as they come: shipping pending, then the chosen one, taxes included as a note', () => {
    const { rerender, container } = render(<OrderSummary lines={[line('a', 'BALATAS CERÁMICAS', 1, '749.00')]} cost={cost()} locale="es-MX" media={false} />)
    expect(screen.getByRole('heading', { name: 'Tu pedido' })).toBeTruthy()
    expect(container.querySelector('[data-sf-summary-row="shipping"]')!.textContent).toBe('EnvíoAl elegir la entrega')
    rerender(<OrderSummary lines={[line('a', 'BALATAS CERÁMICAS', 2, '1498.00')]} cost={cost({ subtotal: mxn('1498.00'), shipping: mxn('108.82'), total: mxn('1606.82'), tax: mxn('221.63') })} locale="es-MX" media={false} />)
    expect(container.querySelector('[data-sf-summary-row="shipping"]')!.textContent).toContain('108.82')
    expect(container.querySelector('[data-sf-summary-row="total"]')!.textContent).toContain('1,606.82')
    expect(container.querySelector('[data-sf-summary-row="tax"]')).toBeNull()
    expect(container.querySelector('[data-sf-summary-tax-note]')!.textContent).toMatch(/Incluye .*221.63 de impuestos/)
    expect(screen.getByText(/2 × BALATAS/)).toBeTruthy()
  })

  it('pictures each line by default: its image, else the fallback initial; `media={false}` keeps the text list', () => {
    // happy-dom says every <img> is already complete; a browser says false while the file is in flight.
    const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete')
    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => false })
    const withImg = line('a', 'BALATAS', 2, '1498.00')
    withImg.merchandise.image = { url: 'https://cdn.test/b.jpg', alt: null }
    const { container, rerender } = render(<OrderSummary lines={[withImg, line('b', 'FILTRO', 1, '100.00')]} cost={cost()} locale="es-MX" />)
    const media = container.querySelectorAll('[data-sf-summary-media] [data-sf-thumb]')
    expect(media).toHaveLength(2)
    expect(media[0]!.querySelector('img')!.getAttribute('src')).toBe('https://cdn.test/b.jpg')
    expect(media[1]!.querySelector('[data-sf-thumb-initial]')!.textContent).toBe('F')
    rerender(<OrderSummary lines={[withImg]} cost={cost()} locale="es-MX" media={false} />)
    expect(container.querySelector('[data-sf-thumb]')).toBeNull()
    if (complete) Object.defineProperty(HTMLImageElement.prototype, 'complete', complete)
  })

  it('discounts by line, free shipping and updating state', () => {
    const { container } = render(
      <OrderSummary lines={[line('a', 'X', 1, '100.00')]} cost={cost({ discount: mxn('10'), discounts: [{ kind: 'code', id: 'd1', title: 'Bienvenida', code: 'HOLA10', amount: mxn('10') }], shipping: mxn('0') })} updating />,
    )
    expect(container.querySelector('[data-sf-summary-row="discount"]')!.textContent).toMatch(/Descuento \(HOLA10\)−/)
    expect(container.querySelector('[data-sf-summary-row="shipping"]')!.textContent).toBe('EnvíoActualizando…')
    expect(container.querySelector('dl')!.getAttribute('aria-busy')).toBe('true')
  })

  it('the phone disclosure is native <details> with the total on the bar (same HTML on server and client)', async () => {
    const html = renderToString(
      <OrderSummaryDisclosure total={mxn('857.82')} locale="es-MX">
        <OrderSummary title={false} lines={[line('a', 'X', 1, '749.00')]} cost={cost()} locale="es-MX" />
      </OrderSummaryDisclosure>,
    )
    expect(html).toMatch(/^<details[^>]*data-sf-summary-disclosure/)
    expect(html).not.toContain(' open=""')
    expect(html).toContain('857.82')
    const { container } = render(
      <OrderSummaryDisclosure total={mxn('857.82')}>
        <OrderSummary title={false} lines={[line('a', 'X', 1, '749.00')]} cost={cost()} />
      </OrderSummaryDisclosure>,
    )
    expect((await axe.run(container, AXE)).violations.map((v) => v.id)).toEqual([])
  })
})

describe('AddressFields: a single careful writer', () => {
  const zipInput = (c: HTMLElement) => c.querySelector('[name="zip"]') as HTMLInputElement
  const type = (c: HTMLElement, zip: string) => {
    fireEvent.input(zipInput(c), { target: { value: zip } })
  }
  const ctl = (c: HTMLElement, name: string) => c.querySelector(`[name="${name}"]`) as HTMLInputElement

  it('fills the colonia only when the code has exactly one', async () => {
    const one = render(<Form lookup={async () => ({ province: 'Jalisco', city: 'Guadalajara', neighborhoods: ['Centro'] })} />)
    type(one.container, '44100')
    await waitFor(() => expect(ctl(one.container, 'neighborhood').value).toBe('Centro'))
    cleanup()
    const many = render(<Form lookup={async () => ({ province: 'Jalisco', city: 'Guadalajara', neighborhoods: ['Centro', 'Americana'] })} />)
    type(many.container, '44100')
    await waitFor(() => expect(ctl(many.container, 'city').value).toBe('Guadalajara'))
    expect(ctl(many.container, 'neighborhood').value).toBe('')
  })

  it('fills a focused field that is still empty (Tab from the postal code), but not one with text in it', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { container } = render(
      <Form
        lookup={async () => {
          await gate
          return { province: 'Jalisco', city: 'Guadalajara', neighborhoods: [] }
        }}
      />,
    )
    type(container, '44100')
    ctl(container, 'province').focus()
    ctl(container, 'city').value = 'Zapo'
    release()
    await waitFor(() => expect(ctl(container, 'province').value).toBe('Jalisco'))
    expect(ctl(container, 'city').value).toBe('Zapo')
  })

  it('does not write over a field the buyer edited (a real, trusted input)', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { container } = render(
      <Form
        lookup={async () => {
          await gate
          return { province: 'Jalisco', city: 'Guadalajara', neighborhoods: [] }
        }}
      />,
    )
    type(container, '44100')
    const city = ctl(container, 'city')
    // The buyer types and clears the city: it is theirs now, even though it is empty again.
    city.value = ''
    const trusted = new Event('input', { bubbles: true })
    Object.defineProperty(trusted, 'isTrusted', { value: true })
    city.dispatchEvent(trusted)
    release()
    await waitFor(() => expect(ctl(container, 'province').value).toBe('Jalisco'))
    expect(city.value).toBe('')
  })

  it('marks the input events it dispatches so the shop can ignore them', async () => {
    const seen: boolean[] = []
    const { container } = render(<Form lookup={async () => ({ province: 'Jalisco', city: 'Guadalajara', neighborhoods: [] })} />)
    container.querySelector('form')!.addEventListener('input', (e) => seen.push(isAddressFillEvent(e)))
    type(container, '44100') // the buyer's own event (not marked)
    await waitFor(() => expect(ctl(container, 'city').value).toBe('Guadalajara'))
    expect(seen[0]).toBe(false)
    expect(seen.filter(Boolean).length).toBeGreaterThanOrEqual(2) // province + city
    expect(seen.slice(1).every(Boolean)).toBe(true)
  })

  it('applies two quick lookups one after the other: the last postal code wins', async () => {
    const answers: Record<string, PostalCodeInfo> = {
      '44100': { province: 'Jalisco', city: 'Guadalajara', neighborhoods: [] },
      '64000': { province: 'Nuevo León', city: 'Monterrey', neighborhoods: [] },
    }
    const { container } = render(<Form lookup={async (zip) => answers[zip] ?? null} />)
    type(container, '44100')
    type(container, '64000')
    await waitFor(() => expect(ctl(container, 'city').value).toBe('Monterrey'))
    expect(ctl(container, 'province').value).toBe('Nuevo León')
  })
})


describe('hideResolvedFields: state and city out of the form when the postal code defines them', () => {
  const cdmx = async () => ({ province: 'Ciudad de México', city: 'Miguel Hidalgo', neighborhoods: ['Granada', 'Anáhuac'] })
  const hiddenValues = (c: HTMLElement) => Object.fromEntries([...c.querySelectorAll<HTMLInputElement>('input[type="hidden"]')].map((i) => [i.name, i.value]))

  it('shows one read-only line with a change link and sends state/city in hidden fields', async () => {
    const { container } = render(<Form lookup={cdmx} hideResolvedFields provinces={[{ name: 'Ciudad de México', code: 'CMX' } as { name: string }]} />)
    expect(screen.getByLabelText('Estado')).toBeTruthy() // before the lookup, and without JS: plain inputs
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '11510' } })
    await waitFor(() => expect(container.querySelector('[data-sf-resolved-place]')).not.toBeNull())
    expect(container.querySelector('[data-sf-resolved-place]')!.textContent).toBe('Miguel Hidalgo, Ciudad de México')
    expect(screen.queryByLabelText('Estado')).toBeNull()
    expect(screen.queryByLabelText('Ciudad o municipio')).toBeNull()
    expect(hiddenValues(container)).toMatchObject({ province: 'Ciudad de México', province_code: 'CMX', city: 'Miguel Hidalgo', country_code: 'MX' })
    const data = new FormData(container.querySelector('form')!)
    expect(data.get('province')).toBe('Ciudad de México')
    expect(data.get('city')).toBe('Miguel Hidalgo')
    expect(container.querySelector('[data-sf-change-zip]')?.textContent).toBe('Cambiar código postal')
    // The colonia is still the buyer's to choose.
    expect(screen.getByLabelText(/Colonia/)).toBeTruthy()
  })

  it('shows the municipality in the line but submits the city the lookup gave', async () => {
    const lookup = async () => ({ province: 'Ciudad de México', city: 'Ciudad de México', municipality: 'Miguel Hidalgo' })
    const { container } = render(<Form lookup={lookup} hideResolvedFields />)
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '11510' } })
    await waitFor(() => expect(container.querySelector('[data-sf-resolved-place]')).not.toBeNull())
    expect(container.querySelector('[data-sf-resolved-place]')!.textContent).toBe('Miguel Hidalgo, Ciudad de México')
    expect(new FormData(container.querySelector('form')!).get('city')).toBe('Ciudad de México')
  })

  it('announces the summary in a live region that already existed (and has no axe violations)', async () => {
    const { container } = render(<Form lookup={cdmx} hideResolvedFields />)
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '11510' } })
    await waitFor(() => expect(status.textContent).toContain('Miguel Hidalgo, Ciudad de México'))
    expect(screen.getByRole('status')).toBe(status) // same node: announced, not re-inserted
    expect((await axe.run(container, AXE)).violations).toEqual([])
  })

  it('"Cambiar código postal" brings the inputs back empty and focuses the postal code; the same code resolves again', async () => {
    const { container } = render(<Form lookup={cdmx} hideResolvedFields />)
    const zip = screen.getByLabelText('Código postal') as HTMLInputElement
    fireEvent.input(zip, { target: { value: '11510' } })
    await waitFor(() => expect(container.querySelector('[data-sf-resolved-place]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-sf-change-zip]')!)
    expect(container.querySelector('[data-sf-resolved-place]')).toBeNull()
    expect((screen.getByLabelText('Estado') as HTMLInputElement).value).toBe('')
    expect(container.querySelector('input[type="hidden"][name="city"]')).toBeNull()
    expect(document.activeElement).toBe(zip)
    fireEvent.input(zip, { target: { value: '11510' } })
    await waitFor(() => expect(container.querySelector('[data-sf-resolved-place]')).not.toBeNull())
  })

  it('editing the postal code drops the resolved values at once (never a stale state for a new code)', async () => {
    const lookup = vi.fn(async (zip: string) => (zip === '11510' ? await cdmx() : { province: 'Jalisco', city: 'Guadalajara' }))
    const { container } = render(<Form lookup={lookup} hideResolvedFields />)
    const zip = screen.getByLabelText('Código postal')
    fireEvent.input(zip, { target: { value: '11510' } })
    await waitFor(() => expect(container.querySelector('[data-sf-resolved-place]')).not.toBeNull())
    fireEvent.input(zip, { target: { value: '4410' } })
    expect(container.querySelector('input[type="hidden"][name="city"]')).toBeNull()
    expect((screen.getByLabelText('Ciudad o municipio') as HTMLInputElement).value).toBe('')
    fireEvent.input(zip, { target: { value: '44100' } })
    await waitFor(() => expect(container.querySelector('[data-sf-resolved-place]')?.textContent).toBe('Guadalajara, Jalisco'))
  })

  it.each([
    ['unknown code', async () => null],
    ['lookup down', async () => {
      throw new Error('down')
    }],
    ['no city', async () => ({ province: 'Jalisco', city: null })],
    ['ambiguous municipality', async () => ({ province: 'Jalisco', city: 'Zapopan', cities: ['Zapopan', 'Tlajomulco'] })],
  ])('degrades to editable inputs: %s', async (_name, lookup) => {
    const { container } = render(<Form lookup={lookup as never} hideResolvedFields />)
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '99999' } })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(container.querySelector('[data-sf-resolved-place]')).toBeNull()
    const city = screen.getByLabelText('Ciudad o municipio') as HTMLInputElement
    fireEvent.input(city, { target: { value: 'Mi ciudad' } })
    expect(city.value).toBe('Mi ciudad')
  })

  it('degrades when the state is not in the shop list, or when the buyer already typed a different value', async () => {
    const a = render(<Form lookup={cdmx} hideResolvedFields provinces={[{ name: 'Jalisco' }]} />)
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '11510' } })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(a.container.querySelector('[data-sf-resolved-place]')).toBeNull()
    cleanup()
    const b = render(<Form lookup={cdmx} hideResolvedFields />)
    fireEvent.input(screen.getByLabelText('Ciudad o municipio'), { target: { value: 'CDMX' } })
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '11510' } })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(b.container.querySelector('[data-sf-resolved-place]')).toBeNull()
    expect((screen.getByLabelText('Ciudad o municipio') as HTMLInputElement).value).toBe('CDMX')
  })

  it('a saved address that matches the code resolves on mount; a server error on the state brings the inputs back', async () => {
    const { container } = render(<Form lookup={cdmx} hideResolvedFields defaults={{ zip: '11510', province: 'Ciudad de México', city: 'Miguel Hidalgo' }} />)
    await waitFor(() => expect(container.querySelector('[data-sf-resolved-place]')).not.toBeNull())
    cleanup()
    const err = render(<Form lookup={cdmx} hideResolvedFields defaults={{ zip: '11510' }} serverFields={['province']} />)
    expect(err.container.querySelector('[data-sf-resolved-place]')).toBeNull()
  })

  it('hideResolvedFields={false} keeps the previous behavior (inputs filled and the state locked)', async () => {
    const { container } = render(<Form lookup={cdmx} hideResolvedFields={false} />)
    fireEvent.input(screen.getByLabelText('Código postal'), { target: { value: '11510' } })
    await waitFor(() => expect((screen.getByLabelText('Estado') as HTMLInputElement).value).toBe('Ciudad de México'))
    expect((screen.getByLabelText('Ciudad o municipio') as HTMLInputElement).value).toBe('Miguel Hidalgo')
    expect(container.querySelector('[data-sf-resolved-place]')).toBeNull()
  })

  it('server HTML is the plain inputs (works without JavaScript)', () => {
    const html = renderToString(<Form lookup={cdmx} hideResolvedFields />)
    expect(html).toContain('name="province"')
    expect(html).toContain('name="city"')
    expect(html).not.toContain('data-sf-resolved-place')
  })
})
