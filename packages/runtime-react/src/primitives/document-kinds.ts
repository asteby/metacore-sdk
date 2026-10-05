// DocumentKind — un registro de tipos de documento comercial para que
// factura, cotización, pedido, OC, NC, cobro/REP, factura de proveedor y OT usen
// el MISMO DocumentEditor / DocumentPage. Cada addon declara su tipo (desde el
// manifest `document_forms` o con registerDocumentKind) y el editor arma:
// contraparte, renglones, fuentes de «Cargar desde», totales y vista previa.
import type { DocumentFormPreview, DocumentFormSource } from '../types'

export type PartyRole = 'customer' | 'supplier' | 'none'
export type LinesMode =
    | 'sale' // precio de venta, descuento, impuesto (factura, cotización, pedido)
    | 'purchase' // costo, recepción pendiente (OC, factura de proveedor)
    | 'credit' // cantidades ≤ facturado − acreditado (NC, devolución)
    | 'allocation' // documentos abiertos a pagar (cobro / REP / pago a proveedor)
    | 'workorder' // servicio + refacción, técnico, horas (OT)
    | 'none'

export interface DocumentKind {
    key: string
    label: string
    model: string // ModelKey canónico ('customers.Invoice')
    party: PartyRole
    partyModel?: string // 'customers.Customer' | 'purchases.Supplier'
    lines: LinesMode
    /** Campo de renglones del modelo (one_to_many) o del payload de la acción. */
    linesField?: string
    sources?: DocumentFormSource[]
    preview?: DocumentFormPreview
    /** Estados del documento (StageMachine): los muestra StageStepper. */
    stages?: string[]
    /** Addon dueño del tipo (si no está, el tipo no se ofrece). */
    addon: string
}

const kinds = new Map<string, DocumentKind>()

export function registerDocumentKind(k: DocumentKind): () => void {
    kinds.set(k.key, k)
    return () => {
        if (kinds.get(k.key) === k) kinds.delete(k.key)
    }
}

export function getDocumentKind(key: string): DocumentKind | undefined {
    return kinds.get(key)
}

export function listDocumentKinds(isInstalled: (addon: string) => boolean): DocumentKind[] {
    return [...kinds.values()].filter(k => isInstalled(k.addon))
}

/** Tipos base que el core ya tiene (modelos verificados en addons main 9cd69bde). */
export const CORE_DOCUMENT_KINDS: DocumentKind[] = [
    { key: 'invoice', label: 'Factura', model: 'customers.Invoice', party: 'customer', partyModel: 'customers.Customer', lines: 'sale', linesField: 'items', addon: 'customers' },
    { key: 'quote', label: 'Cotización', model: 'quotes.Quote', party: 'customer', partyModel: 'customers.Customer', lines: 'sale', linesField: 'items', addon: 'quotes' },
    { key: 'sales_order', label: 'Pedido', model: 'customers.SalesOrder', party: 'customer', partyModel: 'customers.Customer', lines: 'sale', linesField: 'items', addon: 'customers' },
    { key: 'payment', label: 'Cobro', model: 'customers.Payment', party: 'customer', partyModel: 'customers.Customer', lines: 'allocation', linesField: 'allocations', addon: 'customers' },
    { key: 'credit_note', label: 'Nota de crédito', model: 'fiscal_mexico.CreditNote', party: 'customer', partyModel: 'customers.Customer', lines: 'credit', linesField: 'lines', addon: 'fiscal_mexico' },
    { key: 'purchase_order', label: 'Orden de compra', model: 'purchases.PurchaseOrder', party: 'supplier', partyModel: 'purchases.Supplier', lines: 'purchase', linesField: 'items', addon: 'purchases' },
    { key: 'supplier_invoice', label: 'Factura de proveedor', model: 'purchases.SupplierInvoice', party: 'supplier', partyModel: 'purchases.Supplier', lines: 'purchase', addon: 'purchases' },
    { key: 'supplier_payment', label: 'Pago a proveedor', model: 'purchases.PurchasePayment', party: 'supplier', partyModel: 'purchases.Supplier', lines: 'allocation', addon: 'purchases' },
    { key: 'work_order', label: 'Orden de trabajo', model: 'workshop.WorkOrder', party: 'customer', partyModel: 'customers.Customer', lines: 'workorder', linesField: 'items', addon: 'workshop' },
]
