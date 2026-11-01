/**
 * What a "thank you" page may claim, from the REAL payment state (read again from OPS, which asks the provider through
 * `commerce.payments.status`; never the immediate answer of the charge nor the return from the bank window):
 *
 * - `success`: ONLY an approved payment (`paid`). Pending, under review, a challenge still open or unknown are not.
 * - `awaiting`: the order waits for a payment the buyer makes elsewhere (a cash voucher, a bank transfer, a payment page).
 * - `failed`: the payment did not go through.
 * - `confirming`: anything else: "we are confirming your payment", with no success mark.
 *
 * `orderId` is set only when the order EXISTS: OPS gives `order.number` once the sales order is created, while
 * `order.id` is reserved at checkout, before the order exists (linking it gives a 404). `creatingOrder`: paid but the
 * order is not there yet ("we are creating your order", no link).
 */
export type PurchaseResultKind = 'success' | 'awaiting' | 'confirming' | 'failed'

export type PurchaseResultInput = {
  order_id?: string | null
  number?: string | null
  /** Checkout or payment status: `paid`, `pending`, `failed`, `cancelled`... */
  status?: string | null
  action_type?: string | null
  instructions?: string | null
  embed_url?: string | null
  voucher?: unknown
}

export type PurchaseResultView = { kind: PurchaseResultKind; orderId: string | null; creatingOrder: boolean }

export function purchaseResultView(receipt: PurchaseResultInput | null | undefined): PurchaseResultView {
  if (!receipt) return { kind: 'confirming', orderId: null, creatingOrder: false }
  const s = (receipt.status ?? '').toLowerCase()
  const exists = Boolean(receipt.number && receipt.order_id)
  const orderId = exists ? receipt.order_id! : null
  if (s === 'paid') return { kind: 'success', orderId, creatingOrder: !exists }
  if (s === 'failed' || s === 'cancelled' || s === 'canceled' || s === 'expired') return { kind: 'failed', orderId, creatingOrder: false }
  const offline = s === 'pending' && (receipt.action_type === 'voucher' || Boolean(receipt.voucher) || Boolean(receipt.instructions) || Boolean(receipt.embed_url))
  return { kind: offline ? 'awaiting' : 'confirming', orderId, creatingOrder: false }
}
