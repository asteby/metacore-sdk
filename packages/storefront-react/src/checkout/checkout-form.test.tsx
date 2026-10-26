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
  neighborhoodList,
}: {
  lookup?: (zip: string) => Promise<PostalCodeInfo | null>
  serverFields?: string[]
  provinces?: { name: string }[]
  lockProvinceOnFill?: boolean
  neighborhoodList?: 'datalist' | 'select'
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
          postalCode={{ pattern: '[0-9]{5}', maxLength: 5, inputMode: 'numeric', title: 'Escribe los 5 dígitos.' }}
          {...(lookup ? { lookupPostalCode: lookup } : {})}
          {...(provinces ? { provinces } : {})}
          {...(lockProvinceOnFill ? { lockProvinceOnFill } : {})}
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
