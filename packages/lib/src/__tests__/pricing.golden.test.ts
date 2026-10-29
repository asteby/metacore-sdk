import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MoneyValue } from '../money'
import { derivePrice, pricingErrorCode, roundPrice, validateRoundingRule } from '../pricing'

/**
 * sha256 of asteby-hq/addons shared/pricederive/testdata/golden.json (pinned
 * there as GoldenSHA256). src/__fixtures__/pricing.golden.json must be a
 * byte-for-byte copy: never edit it here; change it in addons
 * (`shared/pricederive/manifest.sh write` + `manifest.sh sdk <metacore-sdk>`).
 */
const ADDONS_GOLDEN_SHA256 = '923285ebc4e656234658e7269466d48c96e623d5be83eaf986db742cd566315b'

const raw = readFileSync(new URL('../__fixtures__/pricing.golden.json', import.meta.url))
const golden: any = JSON.parse(raw.toString('utf8'))

function errorCode(fn: () => unknown): string {
  try {
    fn()
  } catch (e) {
    const c = pricingErrorCode(e)
    if (c) return c
    throw e
  }
  return ''
}

describe('pricing golden (shared with addons shared/pricederive)', () => {
  it('is the same file as the Go package', () => {
    expect(createHash('sha256').update(raw).digest('hex')).toBe(ADDONS_GOLDEN_SHA256)
    expect(golden.version).toBe(1)
    expect(golden.contract).toBe('pricederive 1.0.0')
    expect(golden.rounding.length).toBeGreaterThan(0)
    expect(golden.derive.length).toBeGreaterThan(0)
  })

  for (const c of golden.rounding) {
    it(`rounding: ${c.name}`, () => {
      if (c.want.error) {
        expect(errorCode(() => roundPrice(c.x, c.currency, c.rule))).toBe(c.want.error)
        return
      }
      const r = roundPrice(c.x, c.currency, c.rule)
      expect(r.amount.toString()).toBe(c.want.amount)
      expect(r.amount.currency).toBe(c.currency)
      expect(r.direction).toBe(c.want.direction)
    })
  }

  for (const c of golden.derive) {
    it(`derive: ${c.name}`, () => {
      if (c.want.error) {
        expect(errorCode(() => derivePrice(c.input))).toBe(c.want.error)
        return
      }
      const r = derivePrice(c.input)
      expect(r.amount.toString()).toBe(c.want.amount)
      expect(r.amount.currency).toBe(c.want.currency_code)
      expect(r.computed).toBe(c.want.computed)
      expect(r.direction).toBe(c.want.direction)
    })
  }
})

describe('pricing properties', () => {
  it('never contradicts the applied direction and always returns a positive candidate', () => {
    const rules = [
      { increment: '1', ending: '0.99' },
      { increment: '10', ending: '9' },
      { increment: '0.05', ending: '0' },
      { increment: '0.25', ending: '0.10' },
    ]
    const failures: string[] = []
    for (const base of rules) {
      const inc = MoneyValue.parse(base.increment, 'USD').minor
      const end = MoneyValue.parse(base.ending, 'USD').minor
      for (const direction of ['up', 'down', 'nearest'] as const) {
        for (let i = 1; i <= 30000; i += 7) {
          const x = String(i).padStart(4, '0')
          const xs = `${x.slice(0, -3)}.${x.slice(-3)}` // i thousandths
          const r = roundPrice(xs, 'USD', { ...base, direction })
          const a = r.amount.minor
          const a10 = a * 10n
          const xi = BigInt(i)
          const d = a10 > xi ? a10 - xi : xi - a10
          const bad =
            !(a > 0n && (a - end) % inc === 0n) ||
            (r.direction === 'up' && a10 < xi) ||
            (r.direction === 'down' && a10 > xi) ||
            (direction === 'up' && r.direction !== 'up') ||
            (r.direction === 'nearest' && 2n * d > inc * 10n)
          if (bad) failures.push(`${JSON.stringify(base)} ${direction} x=${xs} -> ${r.amount} ${r.direction}`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('validateRoundingRule rejects .99 in JPY', () => {
    expect(errorCode(() => validateRoundingRule({ increment: '1', ending: '0.99', direction: 'up' }, 'JPY'))).toBe(
      'precision',
    )
    expect(() => validateRoundingRule({ increment: '100', ending: '80', direction: 'up' }, 'JPY')).not.toThrow()
  })
})
