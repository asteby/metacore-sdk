import { describe, expect, it } from 'vitest'
import { filterNavGroups } from '../filter-nav'
import type { NavGroupData } from '../types'

const groups: NavGroupData[] = [
  {
    title: 'Ventas',
    items: [
      { title: 'Pedidos', url: '/m/orders' },
      {
        title: 'Facturación',
        url: '/m/invoices',
        items: [
          { title: 'Facturas', url: '/m/invoices' },
          { title: 'REP', url: '/m/rep' },
        ],
      },
    ],
  },
  { title: 'Admin', items: [{ title: 'Roles', url: '/m/roles' }] },
]

describe('filterNavGroups', () => {
  it('returns the same reference when everything is visible', () => {
    expect(filterNavGroups(groups, () => true)).toBe(groups)
  })

  it('drops hidden leaves, empty collapsibles and empty groups', () => {
    const out = filterNavGroups(groups, (i) => i.url === '/m/orders' || i.url === '/m/rep')
    expect(out.map((g) => g.title)).toEqual(['Ventas'])
    const titles = out[0].items.map((i) => i.title)
    expect(titles).toEqual(['Pedidos', 'Facturación'])
    expect((out[0].items[1] as any).items.map((c: any) => c.title)).toEqual(['REP'])
  })

  it('removes a group when nothing survives', () => {
    expect(filterNavGroups(groups, () => false)).toEqual([])
  })
})
