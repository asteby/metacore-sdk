import { beforeEach, describe, expect, it } from 'vitest'
import { createScreenCapabilityRegistry, screenKeyForUrl } from './screen-capability-implies'

const IMPLIES = {
  'screen.addons.shop.checkout.access': ['product.index', 'order.create', 'order.close_session'],
}

describe('screenKeyForUrl', () => {
  it('slugifies routes', () => {
    expect(screenKeyForUrl('/addons/shop/checkout')).toBe('screen.addons.shop.checkout')
    expect(screenKeyForUrl('/?x=1')).toBe('screen.root')
  })
})

describe('registry', () => {
  const reg = createScreenCapabilityRegistry({
    modules: { product: 'Products' },
    groups: { product: 'Catalog' },
    actions: { close_session: 'Close session' },
    fallbackGroup: 'Other',
  })
  beforeEach(() => reg.set(IMPLIES))

  it('expands grants once and keeps order', () => {
    expect(reg.expand(['screen.addons.shop.checkout.access', 'product.index'])).toEqual([
      'screen.addons.shop.checkout.access',
      'product.index',
      'order.create',
      'order.close_session',
    ])
  })

  it('builds labelled shortcut actions with injected labels', () => {
    const a = reg.impliedShortcutActions('screen.addons.shop.checkout.access')
    expect(a[0]).toMatchObject({ label: 'Products', description: 'List / read', group: 'Catalog', capability: 'product.index' })
    expect(a[2]).toMatchObject({ label: 'order', description: 'Close session', group: 'Other' })
  })

  it('summarizes and groups implied modules', () => {
    expect(reg.summarizeImpliedModules('screen.addons.shop.checkout.access')).toBe('order, Products')
    const g = reg.buildImpliedApiModuleGroup()
    expect(g.modules.map((m) => m.key)).toEqual(['order', 'product'])
  })

  it('set(null) clears', () => {
    reg.set(null)
    expect(reg.get()).toEqual({})
    expect(reg.buildImpliedApiModuleGroup().modules).toEqual([])
  })
})
