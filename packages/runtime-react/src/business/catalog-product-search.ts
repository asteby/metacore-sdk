// createCatalogProductSearch — buscador de productos POR DEFECTO para
// DocumentLinesGrid cuando el host no inyecta uno (`searchProducts`).
//
// Problema que corrige: DynamicCRUDPage monta DocumentFormDialog SIN
// `searchProducts`, así que el paso de renglones de «Crear factura» solo ofrecía
// «Renglón libre» (descripción a mano, precio 0, IVA 0) y la factura se guardaba
// en $0. Con esto, cualquier documento declarativo busca en el catálogo.
//
// Lee el listado canónico GET /data/<model>?search=&per_page= (el mismo que usa
// DynamicTable). No usa /options: su envelope solo trae id/label, sin precio.
import type { ProductQuery, ProductResult } from './product-search'

interface ApiLike {
    get: (url: string, cfg?: { params?: Record<string, unknown>; signal?: AbortSignal }) => Promise<{ data: any }>
}

export interface CatalogProductSearchOptions {
    /** Modelo de catálogo. Default `products.Product`. */
    model?: string
    /** Endpoint de listado. Default `/data/<model>`. */
    endpoint?: string
    limit?: number
    /** Tasa de impuesto cuando el producto no trae la suya (config fiscal de la org; p. ej. 0.16). */
    defaultTaxRate?: number
}

const num = (v: unknown): number | undefined => {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : typeof v === 'number' ? v : NaN
    return Number.isFinite(n) ? n : undefined
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Tasa como fracción: acepta 0.16 o 16. */
const rate = (v: unknown): number | undefined => {
    const n = num(v)
    if (n == null || n < 0) return undefined
    return n > 1 ? n / 100 : n
}

const bag = (v: unknown): Record<string, unknown> => {
    if (typeof v === 'string') {
        try {
            const parsed = JSON.parse(v)
            return parsed && typeof parsed === 'object' ? parsed : {}
        } catch {
            return {}
        }
    }
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

/** Proyección pura registro del catálogo → ProductResult (exportada para tests). */
export function catalogRecordToProduct(rec: Record<string, any>, defaultTaxRate?: number): ProductResult {
    // Campos de extensión de otros addons (p. ej. claves SAT de fiscal_mexico).
    const extensions = Object.fromEntries(
        Object.entries(bag(rec.fiscal_data)).filter(([, v]) => typeof v === 'string' && v !== ''),
    ) as Record<string, string>
    const pt = String(rec.product_type ?? '')
    return {
        id: String(rec.id ?? rec.value ?? ''),
        name: String(rec.name ?? rec.label ?? ''),
        sku: str(rec.sku),
        barcode: str(rec.barcode),
        kind: pt === 'service' ? 'service' : 'product',
        price: num(rec.unit_price ?? rec.sale_price ?? rec.price),
        cost: num(rec.cost_price ?? rec.cost),
        tax_rate: rate(rec.tax_rate) ?? defaultTaxRate,
        unit: str(rec.unit_of_measure) ?? str(rec.unit),
        extensions: Object.keys(extensions).length ? extensions : undefined,
    }
}

export function createCatalogProductSearch(api: ApiLike, opts: CatalogProductSearchOptions = {}) {
    const model = opts.model ?? 'products.Product'
    const url = opts.endpoint ?? `/data/${model}`
    const limit = opts.limit ?? 20
    return async (query: Exclude<ProductQuery, { kind: 'empty' }>, signal: AbortSignal): Promise<ProductResult[]> => {
        const search = query.kind === 'barcode' ? query.barcode : query.raw.trim()
        const res = await api.get(url, { params: { search, per_page: limit }, signal })
        const rows: unknown = res?.data?.data
        if (!Array.isArray(rows)) return []
        return rows
            .filter((r) => r && typeof r === 'object' && (r as Record<string, unknown>).is_active !== false)
            .map((r) => catalogRecordToProduct(r as Record<string, any>, opts.defaultTaxRate))
    }
}
