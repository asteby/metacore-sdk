// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { customerTypeOptions, type CustomerCapabilities } from '@asteby/storefront'
import { MOCK_CUSTOMER_TYPES } from '@asteby/storefront/mock'
import { ContactFields } from './index.js'
import { AccountAuth } from '../account/index.js'

afterEach(cleanup)

const types = [
  { value: 'final', label: 'Cliente Final' },
  { value: 'refaccionario', label: 'Refaccionario' },
  { value: 'taller', label: 'Taller de Servicio' },
  { value: 'flotillas', label: 'Flotillas' },
] as const
const caps: CustomerCapabilities = { password: true, email_verification: true, otp_channels: ['email'] }

describe('customer type select', () => {
  it('ContactFields shows no select unless the store gives the types', () => {
    const { container } = render(<ContactFields />)
    expect(container.querySelector('[name=customer_type]')).toBeNull()
  })

  it('ContactFields renders the store words, the first one selected, under the right name', () => {
    const { container } = render(<ContactFields customerTypes={types} names={{ customer_type: 'contact_customer_type' }} />)
    const select = container.querySelector('select[name=contact_customer_type]') as HTMLSelectElement
    expect(select).toBeTruthy()
    expect([...select.options].map((o) => o.value)).toEqual(['final', 'refaccionario', 'taller', 'flotillas'])
    expect([...select.options].map((o) => o.textContent)).toContain('Taller de Servicio')
    expect(select.value).toBe('final')
    expect(container.querySelector('label[for=contact_customer_type]')?.textContent).toContain('Tipo de cliente')
  })

  it('ContactFields keeps a chosen default', () => {
    const { container } = render(<ContactFields customerTypes={types} defaults={{ customer_type: 'flotillas' }} />)
    expect((container.querySelector('select[name=customer_type]') as HTMLSelectElement).value).toBe('flotillas')
  })

  it('AccountAuth adds the select only to the registration', () => {
    const login = render(<AccountAuth capabilities={caps} customerTypes={types} />)
    expect(login.container.querySelector('[name=customer_type]')).toBeNull()
    login.unmount()
    const reg = render(<AccountAuth capabilities={caps} customerTypes={types} initialView="register" />)
    const select = reg.container.querySelector('select[name=customer_type]') as HTMLSelectElement
    expect(select.value).toBe('final')
    expect(select.required).toBe(true)
  })

  it('AccountAuth without types keeps the registration as it was', () => {
    const { container } = render(<AccountAuth capabilities={caps} initialView="register" />)
    expect(container.querySelector('[name=customer_type]')).toBeNull()
  })
})

describe('customer types from the organization (capabilities)', () => {
  const withTypes: CustomerCapabilities = { ...caps, customer_types: { ...MOCK_CUSTOMER_TYPES, default: 'taller' } }

  it('AccountAuth takes the list from the capabilities, preselects the organization default and says it is reviewed', () => {
    const { container } = render(<AccountAuth capabilities={withTypes} initialView="register" />)
    const select = container.querySelector('select[name=customer_type]') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['final', 'refaccionario', 'taller', 'flotillas'])
    expect(select.value).toBe('taller')
    expect(container.textContent).toContain('Validaremos tu tipo antes de aplicar precios especiales')
  })

  it('AccountAuth in English says it in English', () => {
    const { container } = render(<AccountAuth capabilities={withTypes} initialView="register" locale="en" />)
    expect(container.textContent).toContain('We will verify your type before applying special prices')
  })

  it('the prop of the store still wins over the capabilities (nobody who used it breaks)', () => {
    const { container } = render(<AccountAuth capabilities={withTypes} customerTypes={[{ value: 'solo', label: 'Solo' }]} initialView="register" />)
    const select = container.querySelector('select[name=customer_type]') as HTMLSelectElement
    expect([...select.options].map((o) => o.value)).toEqual(['solo'])
    expect(container.textContent).not.toContain('Validaremos tu tipo')
  })

  it('a store whose organization offers none shows no select at all', () => {
    const none: CustomerCapabilities = { ...caps, customer_types: { options: [] } }
    const { container } = render(<AccountAuth capabilities={none} initialView="register" />)
    expect(container.querySelector('[name=customer_type]')).toBeNull()
  })

  it('ContactFields preselects customerTypeDefault, keeps a valid default of the form, and shows the review note', () => {
    const c = customerTypeOptions({ customer_types: MOCK_CUSTOMER_TYPES })!
    const a = render(<ContactFields customerTypes={c.options} customerTypeDefault="flotillas" customerTypeReview={c.hasReview} />)
    expect((a.container.querySelector('select[name=customer_type]') as HTMLSelectElement).value).toBe('flotillas')
    expect(a.container.textContent).toContain('Validaremos tu tipo antes de aplicar precios especiales')
    a.unmount()
    const b = render(<ContactFields customerTypes={c.options} customerTypeDefault="flotillas" defaults={{ customer_type: 'taller' }} />)
    expect((b.container.querySelector('select[name=customer_type]') as HTMLSelectElement).value).toBe('taller')
    expect(b.container.textContent).not.toContain('Validaremos tu tipo')
  })
})
