// Helpers del editor único de renglones (DocumentLinesGrid / LineItemsEditor).
// Puros: el componente solo pinta. `serializeLineItems` sigue siendo la puerta al backend.
import { toAmount } from './format'
import { makeLine, type LineItem } from './line-items'
import { availableStock, type ProductResult, type ProductVariant } from './product-search'

export type PriceSource = 'sale' | 'cost' | 'origin'
export type DocumentLinesMode = 'free' | 'from_source'

/** Precio que se escribe en el renglón según el documento. */
export function priceFromProduct(
    product: ProductResult,
    variant: ProductVariant | undefined,
    source: PriceSource,
): number {
    const list = variant?.price ?? product.price
    const cost = variant?.cost ?? product.cost
    if (source === 'cost') return cost ?? list ?? 0
    return list ?? 0
}

/** Rellena un renglón con el producto elegido (nombre, SKU, precio, costo de catálogo, existencia). */
export function applyProductToLine(
    line: LineItem,
    product: ProductResult,
    variant?: ProductVariant,
    opts: { priceSource?: PriceSource; warehouseId?: string; quantity?: number } = {},
): LineItem {
    const source = opts.priceSource ?? 'sale'
    const src = variant ?? product
    const list = variant?.price ?? product.price
    const cost = variant?.cost ?? product.cost
    const catalog = source === 'cost' ? (cost ?? list) : list
    return {
        ...line,
        kind: 'item',
        product_id: variant?.id ?? product.id,
        sku: variant?.sku ?? product.sku,
        description: variant ? `${product.name} · ${variant.label}` : product.name,
        quantity: opts.quantity ?? (toAmount(line.quantity) || 1),
        unit_price: priceFromProduct(product, variant, source),
        catalog_price: catalog,
        cost,
        tax_rate: product.tax_rate ?? line.tax_rate ?? 0,
        available: availableStock(src, opts.warehouseId) ?? availableStock(product, opts.warehouseId),
    }
}

/**
 * Agrega el producto como renglón. Por defecto, un segundo clic del mismo
 * producto incrementa la cantidad (como el catálogo de Compras) y respeta `max_quantity`.
 */
export function addProductLine(
    lines: LineItem[],
    product: ProductResult,
    variant?: ProductVariant,
    opts: {
        priceSource?: PriceSource
        warehouseId?: string
        quantity?: number
        mergeSameProduct?: boolean
    } = {},
): LineItem[] {
    const id = variant?.id ?? product.id
    const addQty = opts.quantity ?? 1
    if (opts.mergeSameProduct !== false) {
        const idx = lines.findIndex((l) => l.kind === 'item' && l.product_id === id)
        if (idx >= 0) {
            return lines.map((l, i) => {
                if (i !== idx) return l
                const next = toAmount(l.quantity) + addQty
                const capped = l.max_quantity != null ? Math.min(next, toAmount(l.max_quantity)) : next
                return { ...l, quantity: capped }
            })
        }
    }
    return [...lines, applyProductToLine(makeLine(), product, variant, { ...opts, quantity: addQty })]
}

export type LineGridCommand = 'add' | 'next' | 'delete' | 'none'

/** Enter agrega, Tab avanza, Supr/Backspace en celda vacía borra. No actúa si hay sugerencias abiertas. */
export function lineGridKeyCommand(
    key: string,
    opts: { suggestionsOpen?: boolean; cellEmpty?: boolean; mode?: DocumentLinesMode } = {},
): LineGridCommand {
    if (key === 'Tab') return 'next'
    if (key === 'Enter' && !opts.suggestionsOpen && opts.mode !== 'from_source') return 'add'
    if ((key === 'Delete' || key === 'Backspace') && opts.cellEmpty && opts.mode !== 'from_source') return 'delete'
    return 'none'
}
