import type { CartCheckoutState, CheckoutInfo, CheckoutRefundStatus } from './types.js'

/**
 * What a buyer should be told about a checkout beyond "paid / not paid" (contract 1.28.0), from fields the API already
 * returns on `GET checkouts/:id` (`CheckoutInfo`) and on a converted cart (`Cart.checkout`). Nothing is inferred:
 * - `honoredAfterCancel`: the bank approved the payment after the buyer cancelled the attempt and the order was created
 *   anyway. Show the order, not a cancellation.
 * - `refund`: `pending` (`refund_pending`: the refund is on its way), `done` (`refunded`) or `review`
 *   (`refund_failed`: it could not be sent automatically and the store is looking at it). `null` when there is no refund.
 * - `paidCheckoutId`: the purchase was paid in another checkout (show that order).
 */
export type CheckoutNotice = {
  honoredAfterCancel: boolean
  refund: 'pending' | 'done' | 'review' | null
  paidCheckoutId: string | null
}

const REFUND: Record<CheckoutRefundStatus, NonNullable<CheckoutNotice['refund']>> = {
  refund_pending: 'pending',
  refunded: 'done',
  refund_failed: 'review',
}

/** Reads the 1.28.0 notices of a checkout. Tolerant: an older server, `null` or an unknown refund status yield no notice. */
export function checkoutNotice(
  checkout: Pick<CheckoutInfo, 'refund_status' | 'paid_checkout_id' | 'honored_after_cancel'> | Pick<CartCheckoutState, 'refund_status' | 'paid_checkout_id' | 'honored_after_cancel'> | null | undefined,
): CheckoutNotice {
  const status = checkout?.refund_status
  return {
    honoredAfterCancel: checkout?.honored_after_cancel === true,
    refund: status && Object.prototype.hasOwnProperty.call(REFUND, status) ? REFUND[status] : null,
    paidCheckoutId: typeof checkout?.paid_checkout_id === 'string' && checkout.paid_checkout_id ? checkout.paid_checkout_id : null,
  }
}
