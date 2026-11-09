import { describe, expect, it, vi } from 'vitest'
import { resolvePostalCode } from './resolve'

const ops = { province: 'Jalisco', city: 'Guadalajara', neighborhoods: ['Centro'] }

describe('resolvePostalCode', () => {
  it('MX: el catálogo oficial manda y el local ni se consulta', async () => {
    const official = vi.fn(async () => ops)
    const r = await resolvePostalCode({ country: 'mx', zip: '44100', official })
    expect(r).toEqual({ info: ops, source: 'official', officialFailed: false })
  })
  it('MX: si el oficial falla, responde el local y no cuenta como fallo', async () => {
    const r = await resolvePostalCode({ country: 'MX', zip: '44100', official: async () => { throw new Error('5xx') } })
    expect(r.source).toBe('offline')
    expect(r.info).toMatchObject({ province: 'Jalisco' })
    expect(r.officialFailed).toBe(false)
  })
  it('MX: si el oficial no conoce el CP, cae al local', async () => {
    const r = await resolvePostalCode({ country: 'MX', zip: '06600', official: async () => null })
    expect(r.source).toBe('offline')
  })
  it('MX: tiempo agotado cae al local; sin respaldo se marca el fallo', async () => {
    const slow = () => new Promise<null>(() => {})
    const a = await resolvePostalCode({ country: 'MX', zip: '06600', official: slow, officialTimeoutMs: 10 })
    expect(a.source).toBe('offline')
    const b = await resolvePostalCode({ country: 'MX', zip: '03999', official: slow, officialTimeoutMs: 10 })
    expect(b).toEqual({ info: null, source: null, officialFailed: true })
  })
  it('MX: CP inválido no consulta a nadie', async () => {
    const official = vi.fn(async () => ops)
    expect((await resolvePostalCode({ country: 'MX', zip: '123', official })).info).toBeNull()
    expect(official).not.toHaveBeenCalled()
  })
  it('US: solo el catálogo local; jamás pregunta al oficial (es de México)', async () => {
    const official = vi.fn(async () => ops)
    const r = await resolvePostalCode({ country: 'US', zip: '78701', official })
    expect(r).toEqual({ info: { province: 'Texas', city: 'Austin' }, source: 'offline', officialFailed: false })
    expect(official).not.toHaveBeenCalled()
  })
  it('otro mercado: nada', async () => {
    expect(await resolvePostalCode({ country: 'CA', zip: '12345' })).toEqual({ info: null, source: null, officialFailed: false })
  })
})
