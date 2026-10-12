import { describe, expect, it } from 'vitest'
import { makeCan } from '@asteby/metacore-runtime-react'
import {
  collectTrustedPaths,
  filterNavGroupsByCan,
  filterNavItemsByCan,
  navUrlModel,
  trustKey,
} from './nav-permission-filter'
import type { NavItemLike } from './types'

const tree: NavItemLike[] = [
  { title: 'Home', url: '/' },
  {
    title: 'Shop',
    url: '/addons/shop/checkout',
    items: [
      { title: 'Checkout', url: '/addons/shop/checkout' },
      { title: 'Orders', url: '/m/orders' },
    ],
  },
  { title: 'Team', url: '/users' },
  { title: 'Folder', url: '/x', folderKey: 'f1' },
]
const urls = (items: NavItemLike[]): unknown[] =>
  items.flatMap((i) => (i.items ? [i.url, ...i.items.map((c) => c.url)] : [i.url]))

describe('nav helpers', () => {
  it('navUrlModel / trustKey', () => {
    expect(navUrlModel('/m/Orders?f=1')).toBe('orders')
    expect(navUrlModel('/addons/x')).toBeNull()
    expect(trustKey('addon://shop/checkout/')).toBe('/addons/shop/checkout')
  })
})

describe('filterNavItemsByCan', () => {
  it('limited role keeps granted screens only', () => {
    const can = makeCan(['screen.addons.shop.checkout.access'], false)
    const out = urls(filterNavItemsByCan(tree, can))
    expect(out).toEqual(['/', '/addons/shop/checkout', '/addons/shop/checkout'])
  })
  it('admin sees everything', () => {
    expect(urls(filterNavItemsByCan(tree, makeCan([], true)))).toContain('/users')
  })
  it('model leaf needs <model>.index; parent url follows first child', () => {
    const out = filterNavItemsByCan(tree, makeCan(['orders.index'], false))
    const shop = out.find((i) => i.title === 'Shop')
    expect(shop?.items?.map((c) => c.url)).toEqual(['/m/orders'])
  })
  it('trusted leaves skip legacy probes', () => {
    const trusted = collectTrustedPaths([{ items: tree }])
    const out = filterNavItemsByCan(tree, makeCan([], false), { trusted })
    expect(urls(out)).toContain('/m/orders')
  })
  it('custom adminShellUrls and addon prefix', () => {
    const t: NavItemLike[] = [{ title: 'Billing', url: '/billing' }, { title: 'Ext', url: '/ext/a' }]
    const can = makeCan([], false)
    expect(filterNavItemsByCan(t, can, { adminShellUrls: new Set(['/billing']), addonUrlPrefix: '/ext/' })).toEqual([])
  })
  it('isItemVisible predicate', () => {
    const out = filterNavItemsByCan([{ title: 'A', url: '/a', requires: 'x' }], makeCan([], false), {
      isItemVisible: (i) => i.requires !== 'x',
    })
    expect(out).toEqual([])
  })
  it('drops emptied groups', () => {
    const g = filterNavGroupsByCan([{ title: 'g', items: [{ title: 'T', url: '/users' }] }], makeCan([], false))
    expect(g).toEqual([])
  })
})
