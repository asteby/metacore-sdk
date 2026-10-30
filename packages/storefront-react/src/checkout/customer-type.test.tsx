// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { CustomerCapabilities } from '@asteby/storefront'
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
