// The aggregate-badge predicate for the mobile header overflow trigger. The
// badge bubbles a pending count (e.g. the "1" of a core update) onto the kebab
// when the toggles are collapsed, but a zero/empty count must show nothing.
import { describe, expect, it } from 'vitest'
import { headerActionsHasBadge } from '../header-actions-badge'

describe('headerActionsHasBadge', () => {
  it('hides on falsy-zero, false and empty', () => {
    expect(headerActionsHasBadge(0)).toBe(false)
    expect(headerActionsHasBadge(false)).toBe(false)
    expect(headerActionsHasBadge(null)).toBe(false)
    expect(headerActionsHasBadge(undefined)).toBe(false)
    expect(headerActionsHasBadge('')).toBe(false)
  })

  it('shows on a positive count, a non-empty string or true', () => {
    expect(headerActionsHasBadge(1)).toBe(true)
    expect(headerActionsHasBadge(99)).toBe(true)
    expect(headerActionsHasBadge('new')).toBe(true)
    expect(headerActionsHasBadge(true)).toBe(true)
  })
})
