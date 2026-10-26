import { beforeEach, describe, expect, it } from 'vitest'
import { createStorefrontClient } from '../index.js'
import { MOCK_CUSTOMER_EMAIL, createMockStorefront } from './index.js'

const mock = createMockStorefront()
const sf = createStorefrontClient({ baseUrl: 'https://mock.local/api/gw', token: 'sk_mock', fetch: mock.fetch })

beforeEach(() => mock.reset())

const ANA = { tax_id: 'PEAA800101AB1', legal_name: 'Ana Pérez', tax_regime: '612', postal_code: '06600', invoice_use: 'G03' }
const EMPRESA = { tax_id: 'RNO010101AB1', legal_name: 'Refacciones del Norte', tax_regime: '601', postal_code: '06600', invoice_use: 'G03', label: 'Mi empresa' }

async function signIn() {
  await sf.customer.requestOtp({ email: MOCK_CUSTOMER_EMAIL })
  const session = await sf.customer.createSession({ email: MOCK_CUSTOMER_EMAIL, code: '000000' })
  return sf.withCustomerToken(session.token)
}

describe('mock fiscal profiles (contract 1.9)', () => {
  it('advertises the capability and starts empty', async () => {
    expect((await sf.customer.capabilities()).fiscal_profiles).toEqual({ max: 10 })
    const customer = await signIn()
    expect(await customer.customer.fiscalProfiles.list()).toEqual([])
  })

  it('the first profile is the default, the person type comes from the region data, Customer.fiscal mirrors it', async () => {
    const customer = await signIn()
    const ana = await customer.customer.fiscalProfiles.create(ANA)
    expect(ana).toMatchObject({ is_default: true, label: 'Ana Pérez', person_type: 'individual', verification: { status: 'unverified' } })
    const empresa = await customer.customer.fiscalProfiles.create(EMPRESA)
    expect(empresa).toMatchObject({ is_default: false, label: 'Mi empresa', person_type: 'company' })
    expect((await customer.customer.get()).fiscal).toMatchObject({ tax_id: ANA.tax_id })

    await customer.customer.fiscalProfiles.update(empresa.id, { is_default: true })
    const list = await customer.customer.fiscalProfiles.list()
    expect(list.map((p) => [p.tax_id, p.is_default])).toEqual([[EMPRESA.tax_id, true], [ANA.tax_id, false]])
    expect((await customer.customer.get()).fiscal).toMatchObject({ tax_id: EMPRESA.tax_id })
  })

  it('validates with the region, refuses repeats and the 11th, and never accepts a verification from the client', async () => {
    const customer = await signIn()
    await expect(customer.customer.fiscalProfiles.create({ ...ANA, tax_regime: '999' })).rejects.toMatchObject({ status: 422, field: 'fiscal.tax_regime' })
    const ana = await customer.customer.fiscalProfiles.create(ANA)
    await expect(customer.customer.fiscalProfiles.create(ANA)).rejects.toMatchObject({ status: 409 })
    await expect(customer.customer.fiscalProfiles.update(ana.id, { verification: { status: 'verified' } } as never)).rejects.toMatchObject({ status: 400 })
    for (let i = 1; i < 10; i++) await customer.customer.fiscalProfiles.create({ ...ANA, tax_id: `PEA${String.fromCharCode(65 + i)}800101AB1`, legal_name: `Persona ${i}` })
    await expect(customer.customer.fiscalProfiles.create({ ...ANA, tax_id: 'ZZZZ800101AB1' })).rejects.toMatchObject({ status: 409 })
  })

  it('delete is physical: the default passes to another profile and the last one clears Customer.fiscal', async () => {
    const customer = await signIn()
    const ana = await customer.customer.fiscalProfiles.create(ANA)
    const empresa = await customer.customer.fiscalProfiles.create(EMPRESA)
    await customer.customer.fiscalProfiles.delete(ana.id)
    expect(await customer.customer.fiscalProfiles.list()).toMatchObject([{ id: empresa.id, is_default: true }])
    await customer.customer.fiscalProfiles.delete(empresa.id)
    expect(await customer.customer.fiscalProfiles.list()).toEqual([])
    expect((await customer.customer.get()).fiscal ?? null).toBeNull()
    await expect(customer.customer.fiscalProfiles.delete(empresa.id)).rejects.toMatchObject({ status: 404 })
  })

  it('keeps the file hash out and drops the evidence when the tax id changes', async () => {
    const customer = await signIn()
    const doc = { kind: 'MX:csf', source: 'pdf_client' as const, document_id: '21030123456', sha256: 'ab'.repeat(32) }
    const ana = await customer.customer.fiscalProfiles.create({ ...ANA, document: doc })
    expect(ana.document).toEqual({ kind: 'MX:csf', source: 'pdf_client', document_id: '21030123456' })
    expect(JSON.stringify(await customer.customer.fiscalProfiles.list())).not.toContain('ab'.repeat(32))
    const changed = await customer.customer.fiscalProfiles.update(ana.id, { tax_id: 'PEPJ800101AB3' })
    expect(changed.document).toBeNull()
  })

  it('needs a buyer session', async () => {
    await expect(sf.customer.fiscalProfiles.list()).rejects.toMatchObject({ status: 401 })
  })
})
