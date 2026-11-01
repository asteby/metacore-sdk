import { describe, expect, it } from 'vitest'
import { StorefrontError, paymentBlockedUntil } from './index.js'

describe('paymentBlockedUntil', () => {
  it('reads details.blocked_until, then retry_after; nothing for other errors', () => {
    const at = '2026-11-01T06:40:00Z'
    expect(paymentBlockedUntil(new StorefrontError({ status: 409, code: 'payment_in_progress', message: 'x', details: { blocked_until: at } }))?.toISOString()).toBe('2026-11-01T06:40:00.000Z')
    expect(paymentBlockedUntil(new StorefrontError({ status: 409, code: 'payment_in_progress', message: 'x', retryAfter: 60 }), 0)?.getTime()).toBe(60_000)
    expect(paymentBlockedUntil(new StorefrontError({ status: 409, code: 'conflict', message: 'x', retryAfter: 60 }))).toBeNull()
    expect(paymentBlockedUntil(new Error('x'))).toBeNull()
  })
})
