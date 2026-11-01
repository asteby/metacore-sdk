import { describe, expect, it } from 'vitest'
import { purchaseResultView } from './purchase-result.js'

// Rule for every shop: success ONLY with an approved payment (real state from OPS), and a link to the order ONLY when the
// order exists (`order.number`). Real case: a Mercado Pago order still in `pending_challenge` was shown as a success and
// its order link was a 404.
describe('purchaseResultView', () => {
  it('pending / in review / challenge open: never success, never an order link', () => {
    for (const status of ['pending', 'in_process', 'requires_action', '', null]) {
      expect(purchaseResultView({ order_id: 'so-reserved', number: null, status })).toEqual({ kind: 'confirming', orderId: null, creatingOrder: false })
    }
  })
  it('approved with the order created: success and its link', () => {
    expect(purchaseResultView({ order_id: 'so1', number: 'GN-1', status: 'paid' })).toEqual({ kind: 'success', orderId: 'so1', creatingOrder: false })
  })
  it('approved, order not there yet: success, "creating your order", no link', () => {
    expect(purchaseResultView({ order_id: 'so1', number: null, status: 'paid' })).toEqual({ kind: 'success', orderId: null, creatingOrder: true })
  })
  it('voucher or transfer: awaiting; failed / cancelled: failed; nothing: confirming', () => {
    expect(purchaseResultView({ status: 'pending', action_type: 'voucher' }).kind).toBe('awaiting')
    expect(purchaseResultView({ status: 'pending', instructions: 'Transfer to...' }).kind).toBe('awaiting')
    expect(purchaseResultView({ status: 'failed' }).kind).toBe('failed')
    expect(purchaseResultView({ status: 'cancelled' }).kind).toBe('failed')
    expect(purchaseResultView(null).kind).toBe('confirming')
  })
})
