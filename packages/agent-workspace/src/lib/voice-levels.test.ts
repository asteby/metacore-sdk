import { describe, expect, it } from 'vitest'
import { canUseMicWaveform } from './voice-levels'

describe('canUseMicWaveform', () => {
  it('is a boolean in jsdom', () => {
    expect(typeof canUseMicWaveform()).toBe('boolean')
  })
})
