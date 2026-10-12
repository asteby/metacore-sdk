import { describe, expect, it } from 'vitest'
import {
  buildCreateGuide,
  modelFromNavUrl,
  pickCreateGuideFields,
} from './aby-guide-builder'

describe('pickCreateGuideFields', () => {
  it('excluye hidden, readonly y external_id (no viven en el create)', () => {
    const picked = pickCreateGuideFields([
      { key: 'name', label: 'Nombre', required: true },
      { key: 'external_id', label: 'ID externo' },
      { key: 'phone', label: 'Teléfono', readonly: true },
      { key: 'secret', label: 'Secreto', hidden: true },
      { key: 'email', label: 'Correo' },
    ])
    expect(picked.map((f) => f.key)).toEqual(['name', 'email'])
  })
})

describe('buildCreateGuide', () => {
  it('arma sidebar → create → fields → submit', () => {
    const guide = buildCreateGuide({
      model: 'customers',
      label: 'Clientes',
      navUrl: '/m/customers',
      fields: [
        { key: 'name', label: 'Nombre', required: true },
        { key: 'email', label: 'Email' },
      ],
    })
    expect(guide).not.toBeNull()
    expect(guide!.id).toBe('synth.create.customers')
    expect(guide!.owner).toBe('synthetic')
    expect(guide!.steps[0].target).toBe('navigation./m/customers')
    expect(guide!.steps[0].advanceOn?.event).toBe('click')
    expect(guide!.steps[1].target).toBe('model.customers.create')
    expect(guide!.steps.some((s) => s.target === 'model.customers.create.field.name')).toBe(true)
    expect(guide!.steps.find((s) => s.target?.endsWith('.field.email'))?.optional).toBe(true)
    expect(guide!.steps.find((s) => s.target?.endsWith('.field.name'))?.optional).toBe(false)
    expect(guide!.steps[guide!.steps.length - 1]?.target).toBe('model.customers.create.submit')
  })

  it('no mete external_id / readonly en el tour', () => {
    const guide = buildCreateGuide({
      model: 'customers',
      label: 'Clientes',
      navUrl: '/m/customers',
      fields: [
        { key: 'name', label: 'Nombre', required: true },
        { key: 'external_id', label: 'ID externo' },
        { key: 'balance_due', label: 'Saldo', readonly: true },
      ],
    })!
    expect(guide.steps.some((s) => s.target?.includes('external_id'))).toBe(false)
    expect(guide.steps.some((s) => s.target?.includes('balance_due'))).toBe(false)
    expect(guide.description).not.toContain('ID externo')
  })

  it('describe el recorrido con los labels de la metadata (lo lee el LLM)', () => {
    const guide = buildCreateGuide({
      model: 'customers',
      label: 'Clientes',
      navUrl: '/m/customers',
      fields: [{ key: 'name', label: 'Nombre', required: true }],
    })!
    expect(guide.title).toBe('Crear en Clientes')
    expect(guide.description).toContain('«Clientes»')
    expect(guide.description).toContain('Nombre')
  })
})

describe('modelFromNavUrl', () => {
  it('extrae el modelo de /m/…', () => {
    expect(modelFromNavUrl('/m/customers')).toBe('customers')
    expect(modelFromNavUrl('/m/products?f_active=1')).toBe('products')
    expect(modelFromNavUrl('/addons/pos/terminal')).toBeNull()
  })
})
