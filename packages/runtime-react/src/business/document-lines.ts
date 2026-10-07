// Helpers del editor único de renglones (DocumentLinesGrid / LineItemsEditor).
// Puros: el componente solo pinta. `serializeLineItems` sigue siendo la puerta al backend.
import { toAmount } from './format'
import { CATALOG_LINE_FIELDS, makeLine, type CatalogLineField, type LineCatalogSnapshot, type LineItem } from './line-items'
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
    // Nunca cantidad 0: un renglón vacío (o con la celda borrada) entra con 1.
    const qty = opts.quantity ?? toAmount(line.quantity)
    const values = catalogLineValues(line, product, variant, source)
    const { catalog_pending: _pending, ...rest } = line
    return {
        ...rest,
        kind: 'item',
        product_id: variant?.id ?? product.id,
        ...values,
        quantity: qty !== 0 ? qty : 1,
        catalog_price: catalog,
        cost,
        extensions: product.extensions ? { ...(line.extensions ?? {}), ...product.extensions } : line.extensions,
        available: availableStock(src, opts.warehouseId) ?? availableStock(product, opts.warehouseId),
        catalog: { ...values, product_ref: product.id, variant },
    }
}

/**
 * Lo que el producto escribe en los campos editables del renglón. Es EL mapeo
 * producto → renglón: lo usan elegir, crear y editar desde la celda.
 */
function catalogLineValues(
    line: LineItem,
    product: ProductResult,
    variant: ProductVariant | undefined,
    source: PriceSource,
): Pick<LineItem, CatalogLineField> {
    return {
        description: variant ? `${product.name} · ${variant.label}` : product.name,
        sku: variant?.sku ?? product.sku,
        unit_price: priceFromProduct(product, variant, source),
        tax_rate: product.tax_rate ?? line.tax_rate ?? 0,
        unit: product.unit ?? line.unit,
    }
}

const sameValue = (a: unknown, b: unknown): boolean =>
    typeof a === 'number' || typeof b === 'number' ? toAmount(a) === toAmount(b) : (a ?? '') === (b ?? '')

/**
 * Campos que el usuario cambió a mano respecto de lo que puso el catálogo
 * («dirty» por campo). Sin foto (renglón libre, o cargado de un documento
 * origen con sus propios precios) todo cuenta como capturado: nada se pisa.
 */
export function lineOverrides(line: LineItem): Set<CatalogLineField> {
    const snap = line.catalog
    if (!snap) return new Set(CATALOG_LINE_FIELDS)
    return new Set(CATALOG_LINE_FIELDS.filter((f) => !sameValue(line[f], snap[f as keyof LineCatalogSnapshot])))
}

/**
 * El producto del renglón cambió en el catálogo (se editó desde la celda):
 * actualiza SOLO los campos que siguen igual a lo que el catálogo había puesto;
 * lo que el usuario sobrescribió se respeta y el valor nuevo queda en
 * `catalog_pending` para ofrecer «aplicar». Nunca toca la cantidad, el tope de
 * lo pendiente ni el vínculo con el documento origen. Siempre refresca lo que
 * no se captura en el renglón (precio de catálogo, costo, extensiones, existencia).
 */
export function refreshLineFromProduct(
    line: LineItem,
    product: ProductResult,
    opts: { priceSource?: PriceSource; warehouseId?: string } = {},
): LineItem {
    const source = opts.priceSource ?? 'sale'
    const variant = line.catalog?.variant
    const fresh = applyProductToLine(line, product, variant, { ...opts, quantity: toAmount(line.quantity) })
    const overrides = lineOverrides(line)
    const next: LineItem = { ...fresh, product_id: line.product_id ?? fresh.product_id, quantity: line.quantity, max_quantity: line.max_quantity, source_line_id: line.source_line_id }
    const pending: Partial<Pick<LineItem, CatalogLineField>> = {}
    const values = catalogLineValues(line, product, variant, source)
    for (const f of CATALOG_LINE_FIELDS) {
        if (!overrides.has(f)) continue
        // Respeta lo capturado; si el catálogo trae otro valor, se ofrece aplicarlo.
        ;(next as any)[f] = line[f]
        if (!sameValue(values[f], line[f])) (pending as any)[f] = values[f]
    }
    // La foto avanza a los valores nuevos del catálogo: el override sigue siéndolo.
    next.catalog = { ...values, product_ref: line.catalog?.product_ref ?? product.id, variant }
    if (Object.keys(pending).length > 0) next.catalog_pending = pending
    else delete next.catalog_pending
    return next
}

/** «Aplicar» el aviso del catálogo: los valores pendientes entran al renglón. */
export function applyCatalogPending(line: LineItem): LineItem {
    if (!line.catalog_pending) return line
    const { catalog_pending: pending, ...rest } = line
    return { ...rest, ...pending }
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
