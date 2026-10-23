import { describe, expect, it } from 'vitest'
import { deliveryInput, deliveryNotices, parseDelivery } from './delivery.js'

describe('parseDelivery', () => {
  it.each([
    ['rate:abc', 'rate', 'abc', 'shipping', false],
    ['rate:skydropx:abc123', 'rate', 'skydropx:abc123', 'shipping', false],
    ['rate:a:b:c', 'rate', 'a:b:c', 'shipping', false],
    ['pickup:br-1', 'pickup', 'br-1', 'pickup', false],
    ['pickup:', 'pickup', '', 'pickup', false],
    ['ship:', 'ship', '', 'shipping', true],
    ['', 'rate', '', 'shipping', false],
    ['  rate:x  ', 'rate', 'x', 'shipping', false],
    ['weird:1', 'rate', '1', 'shipping', false],
  ])('%j', (value, kind, id, method, addressOnly) => {
    expect(parseDelivery(value)).toEqual({ kind, id, method, addressOnly })
  })
  it('handles null/undefined', () => {
    expect(parseDelivery(null).id).toBe('')
    expect(parseDelivery(undefined).kind).toBe('rate')
  })
})

describe('deliveryInput', () => {
  it('keeps the whole rate id', () => {
    expect(deliveryInput(parseDelivery('rate:skydropx:id9'))).toEqual({ method: 'shipping', rate_id: 'skydropx:id9' })
  })
  it('empty rate id is undefined', () => {
    expect(deliveryInput(parseDelivery('rate:'))).toEqual({ method: 'shipping', rate_id: undefined })
  })
  it('pickup sends the branch', () => {
    expect(deliveryInput(parseDelivery('pickup:b1'))).toEqual({ method: 'pickup', branch_id: 'b1' })
  })
  it('ship: sends nothing', () => {
    expect(deliveryInput(parseDelivery('ship:'))).toBeNull()
  })
})

describe('deliveryNotices', () => {
  it('splits missing_weight from other failures', () => {
    const n = deliveryNotices({ unavailable: [{ provider: 'skydropx', code: 'missing_weight' }, { provider: 'x', code: 'timeout' }] })
    expect(n.missingWeight).toEqual([{ provider: 'skydropx', code: 'missing_weight' }])
    expect(n.unavailable).toEqual([{ provider: 'x', code: 'timeout' }])
    expect(n.hasNotices).toBe(true)
  })
  it('partial alone is a notice', () => {
    expect(deliveryNotices({ partial: true }).hasNotices).toBe(true)
  })
  it('clean and nullish have none', () => {
    expect(deliveryNotices({}).hasNotices).toBe(false)
    expect(deliveryNotices(null)).toEqual({ missingWeight: [], unavailable: [], hasNotices: false })
  })
})
