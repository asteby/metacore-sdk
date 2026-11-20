import { describe, expect, it } from 'vitest'
import { joinApiUrl } from './host'

describe('joinApiUrl', () => {
  it('respects a configured base and normalizes slashes', () => {
    expect(joinApiUrl('https://api.example.com/v2/', '/internal-chat/calls/1/leave')).toBe(
      'https://api.example.com/v2/internal-chat/calls/1/leave',
    )
    expect(joinApiUrl('/api', 'bi/geo/MX')).toBe('/api/bi/geo/MX')
  })
})
