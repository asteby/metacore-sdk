import { describe, expect, it } from 'vitest'
import { aggregateBadges, formatBadgeCount, formatTabTitle, hasNavBadge, maxSeverity, stripTabTitleCount } from '../badge-model'

describe('badge-model', () => {
  it('caps at 99+ and hides zero', () => {
    expect(formatBadgeCount(0)).toBe('')
    expect(formatBadgeCount(7)).toBe('7')
    expect(formatBadgeCount(99)).toBe('99')
    expect(formatBadgeCount(100)).toBe('99+')
    expect(formatBadgeCount(7358)).toBe('99+')
  })
  it('max severity', () => {
    expect(maxSeverity('attention', 'urgent')).toBe('urgent')
    expect(maxSeverity('critical', 'info')).toBe('critical')
  })
  it('tab title', () => {
    expect(formatTabTitle('Vantora', 120)).toBe('(99+) Vantora')
    expect(formatTabTitle('Vantora', 0)).toBe('Vantora')
    expect(stripTabTitleCount('(99+) Vantora')).toBe('Vantora')
    expect(stripTabTitleCount('(3) A')).toBe('A')
  })
  it('hasNavBadge', () => {
    expect(hasNavBadge(0)).toBe(false)
    expect(hasNavBadge({ count: 0, tone: 'info' })).toBe(false)
    expect(hasNavBadge({ count: 2, tone: 'info' })).toBe(true)
  })
  it('aggregates', () => {
    expect(aggregateBadges([{ count: 2, tone: 'attention' }, { count: 5, tone: 'urgent' }, { count: 0, tone: 'critical' }])).toEqual({ count: 7, tone: 'urgent' })
  })
})
