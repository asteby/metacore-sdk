import { describe, expect, it } from 'vitest'
import {
  generateSecret,
  generatedLength,
  secretMinLength,
  secretStrength,
  splitHelp,
  tooShortSecrets,
} from './secret-field-model'

describe('secretMinLength', () => {
  it('reads named hints and the .{N,} regex', () => {
    expect(secretMinLength({ key: 'k', validation: 'min_length:48' })).toBe(48)
    expect(secretMinLength({ key: 'k', validation: 'minlength=32' })).toBe(32)
    expect(secretMinLength({ key: 'k', validation: '^.{40,}$' })).toBe(40)
    expect(secretMinLength({ key: 'k', validation: 'email' })).toBe(0)
    expect(secretMinLength({ key: 'k' })).toBe(0)
  })
  it('generates at least the declared minimum, default 32, capped', () => {
    expect(generatedLength({ key: 'k' })).toBe(32)
    expect(generatedLength({ key: 'k', validation: 'min_length:64' })).toBe(64)
    expect(generatedLength({ key: 'k', validation: 'min_length:9999' })).toBe(128)
  })
})

describe('generateSecret', () => {
  it('uses crypto.getRandomValues and yields the requested length over the alphabet', () => {
    const s = generateSecret(48)
    expect(s).toHaveLength(48)
    expect(s).toMatch(/^[A-Za-z0-9]+$/)
    expect(generateSecret(48)).not.toBe(s)
  })
  it('rejects biased bytes (>= 248) instead of wrapping them', () => {
    let calls = 0
    const src = {
      getRandomValues: <T extends ArrayBufferView | null>(a: T): T => {
        const u = a as unknown as Uint8Array
        u.fill(calls++ === 0 ? 255 : 1)
        return a
      },
    }
    expect(generateSecret(4, src as Crypto)).toBe('BBBB')
  })
  it('throws without a CSPRNG', () => {
    expect(() => generateSecret(8, {} as Crypto)).toThrow()
  })
})

describe('secretStrength / tooShortSecrets / splitHelp', () => {
  it('grades by length against the minimum', () => {
    expect(secretStrength('')).toBe('empty')
    expect(secretStrength('abc123')).toBe('weak')
    expect(secretStrength(generateSecret(32), 32)).toBe('strong')
    expect(secretStrength('aB3dE6gH9jK2mN5pQ8', 32)).toBe('weak')
  })
  it('flags only non-empty secrets under the minimum', () => {
    const f = [{ key: 'a', type: 'secret', validation: 'min_length:32' }, { key: 'b', validation: 'min_length:8' }]
    expect(tooShortSecrets(f, { a: 'short', b: 'x' })).toEqual([{ key: 'a', min: 32 }])
    expect(tooShortSecrets(f, { a: '' })).toEqual([])
  })
  it('splits a long help into lead + technical detail', () => {
    const r = splitHelp('Secreto de al menos 32 caracteres aleatorios; la tienda lo manda como Bearer a /submit_review y /list_reviews')
    expect(r.lead).toBe('Secreto de al menos 32 caracteres aleatorios')
    expect(r.detail).toMatch(/^la tienda/)
    expect(splitHelp('Corto.')).toEqual({ lead: 'Corto.', detail: '' })
  })
})
