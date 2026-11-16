import type { LocationEntity, ShopBranch } from './types.js'

/**
 * Ecommerce aware of the seller **entity** (razón social) — RFC 0001 §3.7.
 *
 * A branch belongs to one entity; an order inherits the entity of its pickup branch (or of the branch it ships from) and
 * is charged and invoiced by that entity alone. The SDK never receives an `entity_id` or tax data: only the entity's
 * stable `code` (the key shared with the ERP) and its commercial `name`. Everything here is derived from fields the
 * Storefront API already returns on branches, and it is tolerant: a server that does not publish entities yields no
 * entity and the shop behaves exactly as before (single implicit entity).
 */

/** Kinds of place that can be offered as "recoge en sucursal". Channel branches (Mercado Libre, Amazon) and warehouses never are. */
const NOT_PICKUP_KINDS = new Set(['channel', 'warehouse', 'office'])

/** The entity of a branch, or `null` when the API does not publish one. Validates the shape so a malformed value never reaches the UI. */
export function branchEntity(branch: Pick<ShopBranch, 'entity'> | null | undefined): LocationEntity | null {
  const e = branch?.entity
  if (!e || typeof e.code !== 'string' || !e.code.trim() || typeof e.name !== 'string' || !e.name.trim()) return null
  return { code: e.code.trim(), name: e.name.trim() }
}

/** Distinct entities across a list of branches, in first-seen order. */
export function entitiesOf(branches: readonly Pick<ShopBranch, 'entity'>[] | null | undefined): LocationEntity[] {
  const seen = new Map<string, LocationEntity>()
  for (const b of branches ?? []) {
    const e = branchEntity(b)
    if (e && !seen.has(e.code)) seen.set(e.code, e)
  }
  return [...seen.values()]
}

/** `true` when the shop sells through more than one entity. With one (or none) the storefront must look exactly as it does today. */
export function isMultiEntity(branches: readonly Pick<ShopBranch, 'entity'>[] | null | undefined): boolean {
  return entitiesOf(branches).length > 1
}

/** Can a buyer collect an order here? A channel branch ("Siete Leguas Mercado Libre") or a warehouse is a place of the ERP, not a counter. */
export function isPickupBranch(branch: Pick<ShopBranch, 'kind' | 'pickup'>): boolean {
  if (branch.kind && NOT_PICKUP_KINDS.has(String(branch.kind))) return false
  return branch.pickup ? branch.pickup.enabled !== false : true
}

/** Branches to offer as pickup: only real counters that allow pickup. */
export function pickupBranches<T extends Pick<ShopBranch, 'kind' | 'pickup'>>(branches: readonly T[] | null | undefined): T[] {
  return (branches ?? []).filter(isPickupBranch)
}

/** Entity of the branch a buyer chose (by id), or `null`. */
export function entityOfBranchId(branches: readonly Pick<ShopBranch, 'id' | 'entity'>[] | null | undefined, branchId: string | null | undefined): LocationEntity | null {
  if (!branchId) return null
  return branchEntity((branches ?? []).find((b) => b.id === branchId))
}

export type EntityGroup<L> = { entity: LocationEntity | null; lines: L[] }

/**
 * Splits cart lines into one group per fulfilling entity (v1 of RFC §3.7: one checkout is charged by one entity, so a
 * cart with items sold by two entities becomes two orders). `entityOfLine` says which entity fulfils a line; lines it
 * cannot place (`null`) stay together under the default entity. Order is stable: first appearance.
 */
export function splitByEntity<L>(lines: readonly L[], entityOfLine: (line: L) => LocationEntity | null): EntityGroup<L>[] {
  const groups = new Map<string, EntityGroup<L>>()
  for (const line of lines) {
    const entity = entityOfLine(line)
    const key = entity ? entity.code : ''
    const g = groups.get(key)
    if (g) g.lines.push(line)
    else groups.set(key, { entity, lines: [line] })
  }
  return [...groups.values()]
}

const NOTICE: Record<'es' | 'en', { one: string; many: (n: number) => string; names: (names: string) => string }> = {
  es: {
    one: '',
    many: (n) => `Tu compra se divide en ${n} pedidos, uno por cada empresa que vende los artículos. Cada pedido se cobra y se factura por separado.`,
    names: (names) => `Venden: ${names}.`,
  },
  en: {
    one: '',
    many: (n) => `Your purchase is split into ${n} orders, one per selling company. Each order is charged and invoiced separately.`,
    names: (names) => `Sold by: ${names}.`,
  },
}

/** Plain-language explanation for the buyer when a cart splits across entities. Empty string when it does not (nothing to say). */
export function splitNotice(groups: readonly EntityGroup<unknown>[], locale: string = 'es'): string {
  if (groups.length < 2) return ''
  const m = NOTICE[locale.toLowerCase().startsWith('en') ? 'en' : 'es']
  const names = groups.map((g) => g.entity?.name).filter((n): n is string => Boolean(n))
  return [m.many(groups.length), names.length ? m.names(names.join(', ')) : ''].filter(Boolean).join(' ')
}
