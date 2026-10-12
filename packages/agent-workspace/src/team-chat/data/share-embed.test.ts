import { describe, expect, it } from 'vitest'
import {
  attachmentsFromRows,
  filterSummaryFromSearch,
  recordLabel,
} from './share-embed'

describe('share-embed', () => {
  it('picks a human label from common record fields', () => {
    expect(recordLabel({ id: 'abc', name: 'Orden 12' })).toBe('Orden 12')
    expect(recordLabel({ id: 'abc', title: { label: 'Venta' } })).toBe('Venta')
    expect(recordLabel({ id: '12345678-xxxx' })).toBe('12345678')
  })

  it('summarizes table filters from the query string', () => {
    const s = filterSummaryFromSearch(
      '?search=ayer&f_status=eq:paid&page=1',
      'Ventas',
    )
    expect(s).toContain('ayer')
    expect(s).toContain('status')
    expect(filterSummaryFromSearch('', 'Existencias')).toBe('')
  })

  it('prefers product/warehouse labels over raw ids', () => {
    expect(
      recordLabel({
        id: '999dae3c-xxxx',
        product_id: { label: 'Tornillo M6' },
        warehouse_id: { name: 'Principal' },
        quantity: 12,
      }),
    ).toBe('Tornillo M6')
  })

  it('builds clickable record attachments', () => {
    const atts = attachmentsFromRows('orders', 'Órdenes', [
      { id: '1', name: 'A' },
      { id: '2', number: 'B-2' },
    ])
    expect(atts).toHaveLength(2)
    expect(atts[0]).toMatchObject({ type: 'record', model: 'orders', id: '1', title: 'A' })
    expect(atts[1]?.title).toBe('B-2')
  })

  it('keeps one attachment when the same row is listed twice', () => {
    const atts = attachmentsFromRows('stock', 'Existencias', [
      { id: 'd7b3b72b-xxxx', product_id: { label: 'Producto de Prueba' } },
      { id: 'd7b3b72b-xxxx', product_id: { label: 'Producto de Prueba' } },
    ])
    expect(atts).toHaveLength(1)
    expect(atts[0]).toMatchObject({
      type: 'record',
      model: 'stock',
      id: 'd7b3b72b-xxxx',
      title: 'Producto de Prueba',
    })
  })
})
