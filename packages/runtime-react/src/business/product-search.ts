// Búsqueda unificada de producto (productos, llantas y variantes).
// Un solo cuadro acepta: medida de llanta «205/55R16», código de barras (EAN/UPC
// numérico), SKU/clave de proveedor o texto libre. `parseProductQuery` clasifica
// la entrada para que el backend/addon elija el índice correcto.
import type { LineItem } from './line-items'
import { makeLine } from './line-items'

export interface TireSize {
    width: number
    ratio: number
    rim: number
    /** Forma canónica `205/55R16`. */
    normalized: string
}

export type ProductQuery =
    | { kind: 'empty'; raw: string }
    | { kind: 'barcode'; raw: string; barcode: string }
    | { kind: 'tire_size'; raw: string; tire: TireSize }
    | { kind: 'text'; raw: string; text: string }

// 205/55R16, 205 55 16, 205-55-16, 205/55ZR16, 2055516 (sin separadores).
const TIRE_RE = /^(\d{3})\s*[\/\-x\s]?\s*(\d{2})\s*[\/\-x\s]?\s*(?:z?r|-)?\s*(\d{2})$/i
const BARCODE_RE = /^\d{8,14}$/

export function parseTireSize(input: string): TireSize | null {
    const s = input.trim()
    // 7 dígitos pegados también son medida, pero 8+ dígitos es código de barras.
    if (BARCODE_RE.test(s)) return null
    const m = TIRE_RE.exec(s)
    if (!m) return null
    const width = Number(m[1])
    const ratio = Number(m[2])
    const rim = Number(m[3])
    if (width < 125 || width > 395 || ratio < 25 || ratio > 95 || rim < 10 || rim > 26) return null
    return { width, ratio, rim, normalized: `${width}/${ratio}R${rim}` }
}

export function parseProductQuery(raw: string): ProductQuery {
    const s = raw.trim()
    if (!s) return { kind: 'empty', raw }
    if (BARCODE_RE.test(s)) return { kind: 'barcode', raw, barcode: s }
    const tire = parseTireSize(s)
    if (tire) return { kind: 'tire_size', raw, tire }
    return { kind: 'text', raw, text: s }
}

export interface StockByWarehouse {
    warehouse_id: string
    warehouse_name?: string
    available: number
}

export interface ProductVariant {
    id: string
    /** «Rin 16 · 205/55R16 · 91V». */
    label: string
    sku?: string
    barcode?: string
    price?: number
    /** Costo de catálogo (compras). Opcional; el precio de lista sigue en `price`. */
    cost?: number
    stock?: StockByWarehouse[]
}

export interface ProductResult {
    id: string
    name: string
    sku?: string
    barcode?: string
    /** Clave del proveedor (búsqueda por SKU del proveedor). */
    supplier_sku?: string
    kind?: 'product' | 'tire' | 'service' | 'bundle'
    price?: number
    /** Costo de catálogo (compras). */
    cost?: number
    tax_rate?: number
    tire?: TireSize
    variants?: ProductVariant[]
    stock?: StockByWarehouse[]
    /** Paquetes automáticos: ids/nombres que se sugieren junto al producto. */
    bundle_items?: Array<{ product_id: string; name: string; quantity: number }>
    /** Unidad de venta del catálogo (pza, juego, kg…). */
    unit?: string
    /** Campos de extensión del producto (fiscal_data.*) que se copian al renglón. */
    extensions?: Record<string, string>
}

/** Existencia disponible: de la variante o del producto, en un almacén o en total. */
export function availableStock(
    source: { stock?: StockByWarehouse[] },
    warehouseId?: string,
): number | undefined {
    if (!source.stock) return undefined
    return source.stock
        .filter((s) => !warehouseId || s.warehouse_id === warehouseId)
        .reduce((n, s) => n + s.available, 0)
}

/** Producto (+ variante) → renglón listo para <LineItemsEditor>. */
export function productToLine(
    p: ProductResult,
    variant?: ProductVariant,
    opts: { warehouseId?: string; quantity?: number } = {},
): LineItem {
    const src = variant ?? p
    const list = variant?.price ?? p.price
    const cost = variant?.cost ?? p.cost
    return makeLine({
        product_id: variant?.id ?? p.id,
        sku: variant?.sku ?? p.sku,
        description: variant ? `${p.name} · ${variant.label}` : p.name,
        quantity: opts.quantity ?? 1,
        unit_price: list ?? 0,
        catalog_price: list,
        cost,
        tax_rate: p.tax_rate ?? 0,
        available: availableStock(src, opts.warehouseId) ?? availableStock(p, opts.warehouseId),
    })
}
