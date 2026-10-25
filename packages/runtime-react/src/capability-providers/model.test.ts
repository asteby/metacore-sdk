import { describe, expect, it } from 'vitest'
import {
  bundleSelections,
  competingProviderAddons,
  changeImpact,
  groupByDomain,
  needsProviderChoice,
  usableCapabilities,
  type CapabilitiesPayload,
  type CapabilityView,
  type Market,
} from './model'

const send = 'messaging.whatsapp.send'

describe('usableCapabilities', () => {
  it('hides capabilities with no installed provider', () => {
    expect(
      usableCapabilities([
        {
          key: send,
          providers: [
            { addon_key: 'whatsapp', installed: false, default: false },
          ],
        },
      ])
    ).toEqual([])
  })

  it('a single installed provider is the one in use', () => {
    const [row] = usableCapabilities([
      {
        key: send,
        providers: [
          { addon_key: 'connector_whatsapp', installed: true, default: false },
          { addon_key: 'whatsapp', installed: false, default: false },
        ],
      },
    ])
    expect(row.current?.addon_key).toBe('connector_whatsapp')
    expect(row.ambiguous).toBe(false)
  })

  it('several installed providers need a default, which then wins', () => {
    const both = (def: boolean) => [
      { addon_key: 'connector_whatsapp', installed: true, default: false },
      { addon_key: 'whatsapp', installed: true, default: def },
    ]
    expect(
      usableCapabilities([{ key: send, providers: both(false) }])[0].ambiguous
    ).toBe(true)
    const [row] = usableCapabilities([{ key: send, providers: both(true) }])
    expect(row.ambiguous).toBe(false)
    expect(row.current?.addon_key).toBe('whatsapp')
  })
})

// ─── agrupado por negocio, un selector por mercado, impacto y vista previa ──

const mx: Market = { code: 'mx', name: 'México', countries: ['MX'], is_default: true }
const us: Market = { code: 'us', name: 'Estados Unidos', countries: ['US'] }

const prov = (addon_key: string, extra: object = {}) => ({
  addon_key,
  installed: true,
  default: false,
  ...extra,
})

const payload: CapabilitiesPayload = {
  domains: [
    { key: 'commerce.shipping', order: 20, title: { es: 'Envíos' } },
    { key: 'commerce.payments', order: 10, title: { es: 'Pagos' } },
  ],
  data: [
    {
      key: 'commerce.payments.session',
      domain: 'commerce.payments',
      checkout: true,
      providers: [prov('mercadopago', { countries: ['MX'] }), prov('stripe')],
    },
    {
      key: 'commerce.payments.confirm',
      domain: 'commerce.payments',
      providers: [prov('mercadopago', { countries: ['MX'] }), prov('stripe')],
    },
    {
      key: 'commerce.shipping.rates',
      domain: 'commerce.shipping',
      fanout: true,
      providers: [prov('skydropx')],
    },
  ],
}

describe('groupByDomain', () => {
  const groups = groupByDomain(payload, [mx, us])

  it('agrupa por negocio en el orden del catálogo, no por contrato técnico', () => {
    expect(groups.map((g) => g.key)).toEqual(['commerce.payments', 'commerce.shipping'])
    expect(groups[0].capabilities).toHaveLength(2)
  })

  it('un solo resultado por mercado: pide elegir cuando hay dos candidatos', () => {
    const pagos = groups[0]
    expect(pagos.cells.map((c) => c.market?.code)).toEqual(['mx', 'us'])
    expect(pagos.cells[0].status).toBe('needs_choice')
    // Mercado Pago no sirve en US: solo Stripe es candidato y responde solo.
    expect(pagos.cells[1].candidates).toEqual(['stripe'])
    expect(pagos.cells[1]).toMatchObject({ status: 'ok', provider: 'stripe' })
  })

  it('los envíos que responden todos no piden elegir', () => {
    expect(groups[1].fanoutOnly).toBe(true)
    expect(groups[1].cells[0].status).toBe('fanout')
  })
})

describe('bundleSelections / changeImpact', () => {
  const pagos = groupByDomain(payload, [mx, us])[0]

  it('elegir un proveedor aplica a todo el paquete que ofrece y sirve', () => {
    expect(bundleSelections(pagos, 'mercadopago', mx)).toEqual({
      'commerce.payments.session': 'mercadopago',
      'commerce.payments.confirm': 'mercadopago',
    })
    // No sirve en US: no se escribe nada.
    expect(bundleSelections(pagos, 'mercadopago', us)).toEqual({})
  })

  it('el aviso de impacto lista lo que se escribe y marca lo que ya estaba', () => {
    const impact = changeImpact(pagos, 'mercadopago', mx)
    expect(impact.keys).toHaveLength(2)
    expect(impact.saveable).toBe(true)
    expect(impact.sameProvider).toBe(false)
    expect(changeImpact(pagos, 'mercadopago', us).saveable).toBe(false)
  })
})

describe('needsProviderChoice', () => {
  const one = (installed: boolean[], extra: object = {}) => ({
    key: 'commerce.payments.session',
    providers: installed.map((i, n) => ({ addon_key: `p${n}`, installed: i, default: false })),
    ...extra,
  })
  const mx: Market = { code: 'MX', active: true }
  const us: Market = { code: 'US', active: true }

  it('stays hidden with one market and one provider per function', () => {
    expect(needsProviderChoice([one([true])], [mx])).toBe(false)
    expect(needsProviderChoice([], [])).toBe(false)
    expect(needsProviderChoice(undefined, undefined)).toBe(false)
  })
  it('shows with more than one active market', () => {
    expect(needsProviderChoice([one([true])], [mx, us])).toBe(true)
  })
  it('ignores inactive markets', () => {
    expect(needsProviderChoice([one([true])], [mx, { ...us, active: false }])).toBe(false)
  })
  it('shows when a function has several installed providers', () => {
    expect(needsProviderChoice([one([true, true])], [mx])).toBe(true)
  })
  it('does not count uninstalled providers nor fan-out functions', () => {
    expect(needsProviderChoice([one([true, false])], [mx])).toBe(false)
    expect(needsProviderChoice([one([true, true], { fanout: true })], [mx])).toBe(false)
  })
})

describe('competingProviderAddons', () => {
  const cap = (key: string, providers: [string, boolean][], extra = {}): CapabilityView => ({
    key,
    providers: providers.map(([addon_key, installed]) => ({ addon_key, installed, default: false })),
    ...extra,
  })
  it('lists installed addons that share a function', () => {
    const set = competingProviderAddons([
      cap('commerce.payments.session', [['mercadopago', true], ['payments_manual', true]]),
      cap('commerce.tax.calculate', [['solo', true], ['other', false]]),
    ])
    expect([...set].sort()).toEqual(['mercadopago', 'payments_manual'])
  })
  it('ignores fan-out functions and undefined', () => {
    expect(competingProviderAddons([cap('commerce.shipping.rates', [['a', true], ['b', true]], { fanout: true })]).size).toBe(0)
    expect(competingProviderAddons(undefined).size).toBe(0)
  })
})
