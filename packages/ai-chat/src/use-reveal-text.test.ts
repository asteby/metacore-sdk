import { describe, expect, it } from 'vitest'
import { revealSlice, revealStep } from './use-reveal-text'

describe('reveal text', () => {
  it('finishes any length in a bounded number of frames', () => {
    for (const len of [10, 200, 5000]) {
      expect(Math.ceil(len / revealStep(len))).toBeLessThanOrEqual(48)
    }
  })

  it('never cuts inside a word or a bold marker', () => {
    const text = 'Encontré **1** registro en **Almacenes**'
    const partial = revealSlice(text, 22)
    expect(text.startsWith(partial)).toBe(true)
    expect(text[partial.length]).toBe(' ')
  })

  it('returns the full text once caught up', () => {
    expect(revealSlice('hola mundo', 99)).toBe('hola mundo')
  })
})
