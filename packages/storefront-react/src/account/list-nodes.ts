/** Adapters from the lightweight list nodes (contract 1.19) to what the account components take. */
import type { InvoiceListNode, Order, ShipmentListNode } from '@asteby/storefront'
import type { InvoiceHistoryEntry } from './invoice-history.js'
import type { ShipmentSummaryCardProps } from './order-summary.js'

/** `InvoiceHistory` entries from a page of `customer.invoices.list` (one per document, newest order first). */
export function invoiceEntries(nodes: readonly InvoiceListNode[] | null | undefined): InvoiceHistoryEntry[] {
  const out: InvoiceHistoryEntry[] = []
  for (const n of Array.isArray(nodes) ? nodes : []) {
    if (!n || !n.order || typeof n.order.id !== 'string') continue
    for (const invoice of Array.isArray(n.invoices) ? n.invoices : []) {
      if (invoice && typeof invoice.id === 'string') out.push({ order: { id: n.order.id, number: n.order.number }, invoice })
    }
  }
  return out
}

/** What `ShipmentSummaryCard` / `orderShippingService` need, from a node of `customer.shipments.list`. */
export function shipmentNodeOrder(node: ShipmentListNode): ShipmentSummaryCardProps['order'] & Pick<Order, 'number'> {
  return { delivery_method: 'shipping', shipping_method: null, shipping_service: node.service, shipments: node.shipments, number: node.order.number }
}
