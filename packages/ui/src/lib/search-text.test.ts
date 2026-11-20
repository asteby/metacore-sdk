import { describe, expect, it } from 'vitest'
import { matchesSearch, normalizeSearchText, splitHighlight } from './search-text'

describe('normalizeSearchText', () => {
  it('lowercases, strips accents and collapses spaces', () => {
    expect(normalizeSearchText('  Régimen   FISCAL ')).toBe('regimen fiscal')
    expect(normalizeSearchText('Enajenación')).toBe('enajenacion')
    expect(normalizeSearchText(null)).toBe('')
    expect(normalizeSearchText(630)).toBe('630')
  })
})

describe('matchesSearch', () => {
  it('matches every token, in any order, ignoring accents/case', () => {
    expect(matchesSearch('630 - Enajenación de acciones en bolsa de valores', 'BOLSA')).toBe(true)
    expect(matchesSearch('630 - Enajenación de acciones en bolsa de valores', 'enajenacion 630')).toBe(true)
    expect(matchesSearch('630 - Enajenación', 'zzz')).toBe(false)
    expect(matchesSearch('anything', '   ')).toBe(true)
  })
})

describe('splitHighlight', () => {
  it('returns one unmatched part with no query or no hit', () => {
    expect(splitHighlight('Hola', '')).toEqual([{ text: 'Hola', match: false }])
    expect(splitHighlight('Hola', 'xyz')).toEqual([{ text: 'Hola', match: false }])
  })
  it('marks matches keeping the original accents', () => {
    expect(splitHighlight('Enajenación de acciones', 'enajenacion')).toEqual([
      { text: 'Enajenación', match: true },
      { text: ' de acciones', match: false },
    ])
    expect(splitHighlight('630 - bolsa', '630 BOLSA')).toEqual([
      { text: '630', match: true },
      { text: ' - ', match: false },
      { text: 'bolsa', match: true },
    ])
  })
})
