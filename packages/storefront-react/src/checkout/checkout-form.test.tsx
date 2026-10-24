// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import axe from 'axe-core'
import { useRef } from 'react'
import type { CartCost, CartLine } from '@asteby/storefront'
import { AddressFields, ContactFields, ErrorSummary, OrderSummary, OrderSummaryDisclosure, useFieldErrors, type PostalCodeInfo } from './index.js'

afterEach(cleanup)

const AXE = { rules: { 'color-contrast': { enabled: false } } }

function Form({
  lookup,
  serverFields,
  provinces,
  lockProvinceOnFill,
}: {
  lookup?: (zip: string) => Promise<PostalCodeInfo | null>
  serverFields?: string[]
  provinces?: { name: string }[]
  lockProvinceOnFill?: boolean
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
    const { rerender, container } = render(<OrderSummary lines={[line('a', 'BALATAS CERÁMICAS', 1, '749.00')]} cost={cost()} locale="es-MX" />)
    expect(screen.getByRole('heading', { name: 'Tu pedido' })).toBeTruthy()
    expect(container.querySelector('[data-sf-summary-row="shipping"]')!.textContent).toBe('EnvíoAl elegir la entrega')
    rerender(<OrderSummary lines={[line('a', 'BALATAS CERÁMICAS', 2, '1498.00')]} cost={cost({ subtotal: mxn('1498.00'), shipping: mxn('108.82'), total: mxn('1606.82'), tax: mxn('221.63') })} locale="es-MX" />)
    expect(container.querySelector('[data-sf-summary-row="shipping"]')!.textContent).toContain('108.82')
    expect(container.querySelector('[data-sf-summary-row="total"]')!.textContent).toContain('1,606.82')
    expect(container.querySelector('[data-sf-summary-row="tax"]')).toBeNull()
    expect(container.querySelector('[data-sf-summary-tax-note]')!.textContent).toMatch(/Incluye .*221.63 de impuestos/)
    expect(screen.getByText(/2 × BALATAS/)).toBeTruthy()
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
