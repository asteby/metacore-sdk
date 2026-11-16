import { describe, expect, it } from 'vitest'
import { branchEntity, entitiesOf, entityOfBranchId, isMultiEntity, isPickupBranch, pickupBranches, splitByEntity, splitNotice } from './entity.js'
import type { ShopBranch } from './types.js'

const rfc1 = { code: 'E-SERVILLANTAS', name: 'Servillantas 7 Leguas' }
const rfc2 = { code: 'E-LLANTAS-SERVICIOS', name: 'Siete Leguas Llantas y Servicios' }

// Estructura real de 7Leguas: RFC 1 con tres sucursales físicas y RFC 2 con una sucursal de canal (Mercado Libre).
const branches = [
  { id: 'sf', kind: 'store', entity: rfc1 },
  { id: 'sl', kind: 'store', entity: rfc1 },
  { id: 'bo', kind: 'store', entity: rfc1 },
  { id: 'ml', kind: 'channel', entity: rfc2 },
] as unknown as ShopBranch[]

describe('entidad vendedora en la tienda', () => {
  it('lee la entidad de la sucursal y descarta valores mal formados', () => {
    expect(branchEntity(branches[0])).toEqual(rfc1)
    expect(branchEntity({ entity: { code: '  ', name: 'x' } })).toBeNull()
    expect(branchEntity({ entity: { code: 'a' } as never })).toBeNull()
    expect(branchEntity({ entity: null })).toBeNull()
    expect(branchEntity(undefined)).toBeNull()
  })

  it('sin entidades publicadas la tienda se ve como antes (una entidad implícita)', () => {
    const plain = [{ id: 'a' }, { id: 'b' }] as unknown as ShopBranch[]
    expect(entitiesOf(plain)).toEqual([])
    expect(isMultiEntity(plain)).toBe(false)
    expect(isMultiEntity(null)).toBe(false)
  })

  it('cuenta entidades distintas en orden de aparición', () => {
    expect(entitiesOf(branches).map((e) => e.code)).toEqual(['E-SERVILLANTAS', 'E-LLANTAS-SERVICIOS'])
    expect(isMultiEntity(branches)).toBe(true)
    expect(isMultiEntity(branches.slice(0, 3))).toBe(false)
  })

  it('una sucursal de canal no se ofrece como recolección', () => {
    expect(isPickupBranch(branches[3]!)).toBe(false)
    expect(isPickupBranch(branches[0]!)).toBe(true)
    expect(isPickupBranch({ kind: 'store', pickup: { enabled: false, fee: null, prep_days: 0 } })).toBe(false)
    expect(pickupBranches(branches).map((b) => b.id)).toEqual(['sf', 'sl', 'bo'])
  })

  it('la entidad del pedido es la de la sucursal elegida', () => {
    expect(entityOfBranchId(branches, 'bo')).toEqual(rfc1)
    expect(entityOfBranchId(branches, 'ml')).toEqual(rfc2)
    expect(entityOfBranchId(branches, 'zzz')).toBeNull()
    expect(entityOfBranchId(branches, null)).toBeNull()
  })
})

describe('un carrito con artículos de varias entidades se separa en pedidos', () => {
  const lines = [
    { sku: 'a', by: rfc1 },
    { sku: 'b', by: rfc2 },
    { sku: 'c', by: rfc1 },
    { sku: 'd', by: null },
  ]
  const groups = splitByEntity(lines, (l) => l.by)

  it('agrupa por entidad con orden estable y deja las líneas sin entidad juntas', () => {
    expect(groups.map((g) => [g.entity?.code ?? null, g.lines.map((l) => l.sku)])).toEqual([
      ['E-SERVILLANTAS', ['a', 'c']],
      ['E-LLANTAS-SERVICIOS', ['b']],
      [null, ['d']],
    ])
  })

  it('explica la separación al comprador, y calla cuando no hay nada que separar', () => {
    expect(splitNotice(groups)).toContain('3 pedidos')
    expect(splitNotice(groups)).toContain('Servillantas 7 Leguas')
    expect(splitNotice(groups, 'en')).toContain('split into 3 orders')
    expect(splitNotice(splitByEntity(lines.slice(0, 1), (l) => l.by))).toBe('')
  })
})
