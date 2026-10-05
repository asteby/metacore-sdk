import { describe, expect, it, vi } from 'vitest'
import { catalogRecordToProduct, createCatalogProductSearch } from '../business/catalog-product-search'
import { applyProductToLine } from '../business/document-lines'
import { makeLine, parseLineItems, serializeLineItems } from '../business/line-items'

describe('catalogRecordToProduct', () => {
    it('proyecta precio de venta, costo, unidad, SKU y claves de extensión', () => {
        const p = catalogRecordToProduct(
            { id: 'p1', name: 'Balanceo', sku: 'SRV-1', unit_price: '350.50', cost_price: 100, unit_of_measure: 'servicio', product_type: 'service', fiscal_data: '{"mx_clave_prod_serv":"78181500","vacio":""}' },
            0.16,
        )
        expect(p).toEqual({
            id: 'p1',
            name: 'Balanceo',
            sku: 'SRV-1',
            barcode: undefined,
            kind: 'service',
            price: 350.5,
            cost: 100,
            tax_rate: 0.16,
            unit: 'servicio',
            extensions: { mx_clave_prod_serv: '78181500' },
        })
    })

    it('la tasa del producto gana sobre la de la org (acepta 16 o 0.16)', () => {
        expect(catalogRecordToProduct({ id: 'a', name: 'A', tax_rate: 8 }, 0.16).tax_rate).toBe(0.08)
        expect(catalogRecordToProduct({ id: 'a', name: 'A', tax_rate: '0' }, 0.16).tax_rate).toBe(0)
        expect(catalogRecordToProduct({ id: 'a', name: 'A' }).tax_rate).toBeUndefined()
    })
})

describe('createCatalogProductSearch', () => {
    it('consulta /data/<model> con search y omite productos inactivos', async () => {
        const get = vi.fn().mockResolvedValue({ data: { success: true, data: [{ id: '1', name: 'A', unit_price: 10 }, { id: '2', name: 'B', is_active: false }] } })
        const search = createCatalogProductSearch({ get }, { model: 'inventory.Item', limit: 5 })
        const signal = new AbortController().signal
        const res = await search({ kind: 'text', raw: ' a ', text: 'a' }, signal)
        expect(get).toHaveBeenCalledWith('/data/inventory.Item', { params: { search: 'a', per_page: 5 }, signal })
        expect(res.map((r) => r.id)).toEqual(['1'])
    })
})

describe('cantidad del renglón de producto', () => {
    it('elegir un producto sobre un renglón con cantidad 0 o vacía deja cantidad 1', () => {
        const product = { id: 'p', name: 'P', price: 100 }
        expect(applyProductToLine(makeLine({ quantity: 0 }), product).quantity).toBe(1)
        expect(applyProductToLine(makeLine({ quantity: '' as unknown as number }), product).quantity).toBe(1)
        expect(applyProductToLine(makeLine({ quantity: 3 }), product).quantity).toBe(3)
    })

    it('parseLineItems trata cantidad vacía como 1', () => {
        expect(parseLineItems([{ description: 'x', quantity: '' }])[0].quantity).toBe(1)
    })

    it('las extensiones viajan como fiscal_data y regresan al parsear', () => {
        const [row] = serializeLineItems([makeLine({ description: 'x', extensions: { mx_clave_unidad: 'H87' } })])
        expect(row.fiscal_data).toEqual({ mx_clave_unidad: 'H87' })
        expect(parseLineItems([row])[0].extensions).toEqual({ mx_clave_unidad: 'H87' })
    })
})
