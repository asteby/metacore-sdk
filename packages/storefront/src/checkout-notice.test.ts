import { describe, expect, it } from 'vitest'
import { checkoutNotice } from './checkout-notice.js'

describe('checkoutNotice', () => {
  it('says nothing when the server sends nothing (older contract)', () => {
    expect(checkoutNotice(undefined)).toEqual({ honoredAfterCancel: false, refund: null, paidCheckoutId: null })
    expect(checkoutNotice({})).toEqual({ honoredAfterCancel: false, refund: null, paidCheckoutId: null })
    expect(checkoutNotice({ refund_status: null, paid_checkout_id: null })).toEqual({ honoredAfterCancel: false, refund: null, paidCheckoutId: null })
  })
  it('maps the three refund states and ignores an unknown one', () => {
    expect(checkoutNotice({ refund_status: 'refund_pending' }).refund).toBe('pending')
    expect(checkoutNotice({ refund_status: 'refunded' }).refund).toBe('done')
    expect(checkoutNotice({ refund_status: 'refund_failed' }).refund).toBe('review')
    expect(checkoutNotice({ refund_status: 'toString' as never }).refund).toBeNull()
  })
  it('reads a payment honoured after cancelling and the checkout that was paid', () => {
    expect(checkoutNotice({ honored_after_cancel: true })).toMatchObject({ honoredAfterCancel: true })
    expect(checkoutNotice({ honored_after_cancel: 'true' as never }).honoredAfterCancel).toBe(false)
    expect(checkoutNotice({ paid_checkout_id: 'c2' }).paidCheckoutId).toBe('c2')
  })
})
