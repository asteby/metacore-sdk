import { describe, expect, it } from 'vitest'
import { buildCatalogFromNav } from './use-permissions-catalog'
import { createScreenCapabilityRegistry } from './screen-capability-implies'

describe('buildCatalogFromNav', () => {
  const backend = {
    modules: [{ key: 'orders', label: 'Orders', actions: [{ key: 'index', label: 'List' }] }],
    general: [],
  }
  it('mirrors nav: models need backend actions, screens get access + shortcuts', () => {
    const registry = createScreenCapabilityRegistry()
    registry.set({ 'screen.addons.shop.checkout.access': ['orders.index'] })
    const { groups } = buildCatalogFromNav({
      groups: [
        {
          title: 'Sales',
          items: [
            { title: 'Orders', url: '/m/orders' },
            { title: 'Ghost', url: '/m/ghost' },
            { title: 'Checkout', url: '/addons/shop/checkout' },
            { title: 'Hash', url: '#' },
          ],
        },
      ],
      backend,
      registry,
      translate: (s) => s.toUpperCase(),
    })
    expect(groups[0]?.title).toBe('SALES')
    expect(groups[0]?.modules.map((m) => m.key)).toEqual(['orders', 'screen.addons.shop.checkout'])
    expect(groups[0]?.modules[1]?.actions.map((a) => a.key)).toEqual(['access', 'orders.index'])
    expect(groups.at(-1)?.modules[0]?.key).toBe('orders') // implied dependency group
  })
  it('collapsible parents become their own group; extra items appended', () => {
    const { groups } = buildCatalogFromNav({
      groups: [{ title: 'G', items: [{ title: 'Parent', items: [{ title: 'O', url: '/m/orders' }] }] }],
      extraItems: [{ title: 'Addon', url: '/addons/a/b' }],
      backend,
    })
    expect(groups.map((g) => g.title)).toEqual(['Parent', 'Addon'])
  })
})
