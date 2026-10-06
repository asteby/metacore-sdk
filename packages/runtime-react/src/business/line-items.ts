// Renglones de documento (cotización, pedido, factura, OC, recepción, OT, RMA, NC).
// Lógica pura del <LineItemsEditor>: cálculo, validación y serialización. El
// guardado de renglones fallaba (PIT-018) por mandar al API cadenas vacías y
// claves de UI; `serializeLineItems` es la única puerta de salida hacia el backend.
import { roundMoney, toAmount } from './format'

export type LineItemKind = 'item' | 'section' | 'note'

export interface LineItem {
    /** Clave estable de UI (no se envía al backend). */
    key: string
    kind: LineItemKind
    /** Id del producto/variante en el catálogo (kind=item). */
    product_id?: string
    sku?: string
    description: string
    quantity: number
    unit_price: number
    /**
     * Descuento. Porcentaje 0-100 salvo `discount_kind: 'amount'`, donde es importe.
     */
    discount: number
    /** `percent` (default, se omite al serializar) o `amount`. */
    discount_kind?: 'percent' | 'amount'
    /** Tasa de impuesto como fracción (0.16). Viene de la config fiscal de la org. */
    tax_rate: number
    /** Unidad de medida (pza, juego…). Solo se serializa si viene informada. */
    unit?: string
    /** Precio o costo de catálogo, para mostrarlo junto al precio editado. */
    catalog_price?: number
    /** Costo conocido. Aviso si el precio de venta queda por debajo. No se serializa. */
    cost?: number
    /** Tope de cantidad (NC: facturado − acreditado; devolución: vendido − devuelto). */
    max_quantity?: number
    /**
     * Id del renglón del documento origen («crear desde»). Viaja en la columna
     * `line_link_field` de la fuente para que el servidor descuente y valide lo
     * pendiente; un renglón libre no lo lleva.
     */
    source_line_id?: string
    technician_id?: string
    lot?: string
    dot?: string
    /** Existencia disponible conocida (para la política de sobreventa). */
    available?: number
    /**
     * Campos de extensión del renglón que aportan OTROS addons (p. ej.
     * fiscal_mexico: `mx_clave_prod_serv`, `mx_clave_unidad`), copiados del
     * producto al elegirlo. Viajan en `fiscal_data` (la bolsa de ModelExtension
     * del host) — el SDK no conoce sus claves.
     */
    extensions?: Record<string, string>
}

/** Qué hacer si `quantity > available`. */
export type StockPolicy = 'allow' | 'warn' | 'block'

export interface LineItemsPolicy {
    /** Default `warn`. */
    stockPolicy?: StockPolicy
    /** Permite cantidades/precios negativos (notas de crédito). Default false. */
    allowNegative?: boolean
    /** Exige al menos un renglón `item`. Default true. */
    requireItems?: boolean
    /** Permite cantidad 0 (renglón de origen que no se acredita/devuelve). Default false. */
    allowZeroQuantity?: boolean
}

let seq = 0
/** Clave de UI única en el proceso. */
export function newLineKey(): string {
    seq += 1
    return `li_${Date.now().toString(36)}_${seq}`
}

export function makeLine(partial: Partial<LineItem> = {}): LineItem {
    return {
        key: partial.key ?? newLineKey(),
        kind: 'item',
        description: '',
        quantity: 1,
        unit_price: 0,
        discount: 0,
        tax_rate: 0,
        ...partial,
    }
}

export interface LineAmounts {
    gross: number
    discount: number
    net: number
    tax: number
    total: number
}

export function computeLine(
    l: Pick<LineItem, 'kind' | 'quantity' | 'unit_price' | 'discount' | 'tax_rate'> & { discount_kind?: LineItem['discount_kind'] },
): LineAmounts {
    if (l.kind !== 'item') return { gross: 0, discount: 0, net: 0, tax: 0, total: 0 }
    const gross = roundMoney(toAmount(l.quantity) * toAmount(l.unit_price))
    const raw = toAmount(l.discount)
    const discount =
        l.discount_kind === 'amount'
            ? roundMoney(Math.min(Math.max(raw, 0), Math.max(gross, 0)))
            : roundMoney(gross * (raw / 100))
    const net = roundMoney(gross - discount)
    const tax = roundMoney(net * toAmount(l.tax_rate))
    return { gross, discount, net, tax, total: roundMoney(net + tax) }
}

export interface LineItemsTotals {
    subtotal: number
    discount: number
    tax: number
    total: number
    /** Suma de cantidades de los renglones `item`. */
    units: number
}

export function computeTotals(lines: LineItem[]): LineItemsTotals {
    const t: LineItemsTotals = { subtotal: 0, discount: 0, tax: 0, total: 0, units: 0 }
    for (const l of lines) {
        if (l.kind !== 'item') continue
        const a = computeLine(l)
        t.subtotal += a.gross
        t.discount += a.discount
        t.tax += a.tax
        t.units += toAmount(l.quantity)
    }
    t.subtotal = roundMoney(t.subtotal)
    t.discount = roundMoney(t.discount)
    t.tax = roundMoney(t.tax)
    t.total = roundMoney(t.subtotal - t.discount + t.tax)
    return t
}

/** Impuesto agrupado por tasa, sumando el impuesto ya redondeado de cada renglón. */
export function taxBreakdown(lines: LineItem[]): Array<{ rate: number; base: number; tax: number }> {
    const map = new Map<number, { base: number; tax: number }>()
    for (const l of lines) {
        if (l.kind !== 'item') continue
        const a = computeLine(l)
        const rate = toAmount(l.tax_rate)
        const cur = map.get(rate) ?? { base: 0, tax: 0 }
        cur.base += a.net
        cur.tax += a.tax
        map.set(rate, cur)
    }
    return [...map.entries()].map(([rate, v]) => ({
        rate,
        base: roundMoney(v.base),
        tax: roundMoney(v.tax),
    }))
}

export interface LineItemsValidation {
    /** Errores por celda `"<índice>.<campo>"` (mismo formato que DynamicLineItems). */
    errors: Record<string, string>
    /** Avisos no bloqueantes (sobreventa con política `warn`). */
    warnings: Record<string, string>
    /** Error de documento (sin renglones). */
    form?: string
    valid: boolean
}

export function validateLineItems(lines: LineItem[], policy: LineItemsPolicy = {}): LineItemsValidation {
    const { stockPolicy = 'warn', allowNegative = false, requireItems = true, allowZeroQuantity = false } = policy
    const errors: Record<string, string> = {}
    const warnings: Record<string, string> = {}
    let items = 0
    lines.forEach((l, i) => {
        if (l.kind === 'section' || l.kind === 'note') {
            if (!l.description.trim()) errors[`${i}.description`] = 'Escribe el texto'
            return
        }
        items += 1
        const qty = toAmount(l.quantity)
        const price = toAmount(l.unit_price)
        const disc = toAmount(l.discount)
        if (!l.description.trim() && !l.product_id) errors[`${i}.description`] = 'Elige un producto o escribe una descripción'
        if (qty === 0 && !allowZeroQuantity) errors[`${i}.quantity`] = 'La cantidad debe ser distinta de cero'
        else if (qty < 0 && !allowNegative) errors[`${i}.quantity`] = 'La cantidad no puede ser negativa'
        if (l.max_quantity != null && qty > toAmount(l.max_quantity)) {
            errors[`${i}.quantity`] = `El máximo es ${l.max_quantity}`
        }
        if (price < 0 && !allowNegative) errors[`${i}.unit_price`] = 'El precio no puede ser negativo'
        if (l.cost != null && price < toAmount(l.cost)) {
            warnings[`${i}.unit_price`] = 'El precio está por debajo del costo'
        }
        if (l.discount_kind === 'amount') {
            const gross = roundMoney(qty * price)
            if (disc < 0) errors[`${i}.discount`] = 'El descuento no puede ser negativo'
            else if (disc > gross) errors[`${i}.discount`] = 'El descuento no puede superar el importe'
        } else if (disc < 0 || disc > 100) {
            errors[`${i}.discount`] = 'El descuento debe estar entre 0 y 100%'
        }
        if (l.available != null && qty > l.available && stockPolicy !== 'allow') {
            const msg = `Solo hay ${l.available} disponibles`
            if (stockPolicy === 'block') errors[`${i}.quantity`] ??= msg
            else warnings[`${i}.quantity`] = msg
        }
    })
    const form = requireItems && items === 0 ? 'Agrega al menos un renglón' : undefined
    return { errors, warnings, form, valid: !form && Object.keys(errors).length === 0 }
}

/**
 * Forma que se manda al backend: números reales (nunca `""`), sin claves de UI,
 * opcionales vacíos omitidos y `position` 1-based conservando el orden.
 */
export function serializeLineItems(
    lines: LineItem[],
    opts: { /** Columna que recibe `source_line_id` (la `line_link_field` de la fuente). */ sourceLineField?: string } = {},
): Array<Record<string, unknown>> {
    return lines.map((l, i) => {
        const out: Record<string, unknown> = {
            position: i + 1,
            kind: l.kind,
            description: l.description.trim(),
        }
        if (l.kind === 'item') {
            out.quantity = toAmount(l.quantity)
            out.unit_price = toAmount(l.unit_price)
            out.discount = toAmount(l.discount)
            out.tax_rate = toAmount(l.tax_rate)
            if (l.discount_kind === 'amount') out.discount_kind = 'amount'
            if (l.catalog_price != null) out.catalog_price = toAmount(l.catalog_price)
            for (const k of ['product_id', 'sku', 'technician_id', 'lot', 'dot', 'unit'] as const) {
                const v = l[k]
                if (typeof v === 'string' && v.trim()) out[k] = v.trim()
            }
            if (l.extensions && Object.keys(l.extensions).length > 0) out.fiscal_data = { ...l.extensions }
            if (opts.sourceLineField && l.source_line_id) out[opts.sourceLineField] = l.source_line_id
            // Importes ya calculados: un modelo de renglón sin tasa (solo
            // `tax_amount`/`subtotal`) los guarda tal cual en vez de perder el IVA.
            const a = computeLine(l)
            out.subtotal = a.net
            out.tax_amount = a.tax
        }
        return out
    })
}

/** Inversa de `serializeLineItems`: filas del API → líneas editables (defaults seguros). */
export function parseLineItems(rows: unknown): LineItem[] {
    if (!Array.isArray(rows)) return []
    return rows.map((r) => {
        const o = (r ?? {}) as Record<string, unknown>
        const kind: LineItemKind = o.kind === 'section' || o.kind === 'note' ? o.kind : 'item'
        const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
        return makeLine({
            kind,
            product_id: str(o.product_id),
            sku: str(o.sku),
            description: typeof o.description === 'string' ? o.description : '',
            quantity: o.quantity == null || o.quantity === '' ? 1 : toAmount(o.quantity),
            unit_price: toAmount(o.unit_price),
            discount: toAmount(o.discount),
            discount_kind: o.discount_kind === 'amount' ? 'amount' : undefined,
            tax_rate: toAmount(o.tax_rate),
            unit: str(o.unit),
            catalog_price: o.catalog_price == null || o.catalog_price === '' ? undefined : toAmount(o.catalog_price),
            cost: o.cost == null || o.cost === '' ? undefined : toAmount(o.cost),
            max_quantity: o.max_quantity == null || o.max_quantity === '' ? undefined : toAmount(o.max_quantity),
            technician_id: str(o.technician_id),
            lot: str(o.lot),
            dot: str(o.dot),
            extensions:
                o.fiscal_data && typeof o.fiscal_data === 'object'
                    ? (Object.fromEntries(
                          Object.entries(o.fiscal_data as Record<string, unknown>).filter(([, v]) => typeof v === 'string'),
                      ) as Record<string, string>)
                    : undefined,
        })
    })
}
