/**
 * Price derivation and rounding per market: the TypeScript twin of the Go
 * package `shared/pricederive` (asteby-hq/addons). Design: ops
 * `docs/plan-next-gen/DISENO-PRECIOS-POR-MERCADO.md` (S7, §3.5).
 *
 * - `roundPrice`: rule `{increment, ending, direction}` in MAJOR units, chosen
 *   from the candidate set `m·increment + ending`. `up` = smallest candidate
 *   ≥ x, `down` = largest ≤ x (≤ 0 falls back to `up`, reported in
 *   `direction`), `nearest` = closest (ties go up). This corrects the ADR §6.3
 *   formula (93.995 with `.99 up` is 94.99, not 93.99).
 * - `derivePrice`: source × rate × (1 + markup%), with `tax_basis = net`
 *   (÷ (1 + tax_in%) × (1 + tax_out%)) or `as_entered`.
 *
 * Everything is exact rational arithmetic on `bigint`: no `number`, no
 * intermediate rounding; the only rounding is the candidate choice, which by
 * construction never contradicts the requested direction. Behaviour is pinned
 * by `src/__fixtures__/pricing.golden.json`, a byte-for-byte copy of the Go
 * package's `testdata/golden.json` (compared by sha256). A capture tool: it
 * suggests prices, it is never used to charge.
 */

import { InvalidMoneyError, MoneyError, MoneyValue, canonicalDecimal, isoCurrencySpec } from './money'
import type { CurrencySpec, Money } from './money'

export type RoundingDirection = 'up' | 'down' | 'nearest'

/** Rounding rule of one currency, exact decimals in major units. */
export interface RoundingRule {
  increment: string
  ending: string
  direction: RoundingDirection
}

export interface RoundedPrice {
  /** The chosen candidate. */
  amount: MoneyValue
  /** Direction actually applied (`up` when down/nearest would give ≤ 0). */
  direction: RoundingDirection
}

export type TaxBasis = 'net' | 'as_entered'

/** Same JSON shape as the Go `pricederive.Input` (and the golden vectors). */
export interface DeriveInput {
  /** Price resolved in the source list. */
  source: Money
  /** Currency of the target list. */
  target_currency: string
  /** Units of target per 1 unit of source (fx_rates: base = source, quote = target). 1 for the same currency. */
  rate: string
  /** FX markup in percent ("3" = +3 %), > -100. Omitted = 0. */
  markup_pct?: string
  /** Omitted = `as_entered`. */
  tax_basis?: TaxBasis
  /** Tax included in the source, percent ("16"); only with `net`. */
  tax_in_pct?: string
  /** Tax to include in the target, percent; only with `net`. */
  tax_out_pct?: string
  rounding: RoundingRule
}

export interface DerivedPrice {
  amount: MoneyValue
  /** x before the rule, rounded half away from zero to the target minor unit (informative). */
  computed: string
  direction: RoundingDirection
}

export type PricingErrorCode = 'negative' | 'precision' | 'overflow' | 'invalid'

/** The amount to round or derive is negative. */
export class NegativeAmountError extends Error {
  readonly code = 'negative' as const
  constructor(message: string) {
    super(`pricing: ${message}`)
    this.name = 'NegativeAmountError'
  }
}

/**
 * Stable error code shared with Go's `pricederive.Code`: "negative",
 * "precision", "overflow" or "invalid"; `undefined` for errors that do not
 * come from this module.
 */
export function pricingErrorCode(e: unknown): PricingErrorCode | undefined {
  if (e instanceof NegativeAmountError) return 'negative'
  if (e instanceof MoneyError) {
    return e.code === 'precision' || e.code === 'overflow' ? e.code : 'invalid'
  }
  return undefined
}

// ------------------------------------------------------------ rationals

/** n/d with d > 0 (not necessarily reduced). */
interface Rat {
  n: bigint
  d: bigint
}

function pow10(n: number): bigint {
  return 10n ** BigInt(n)
}

/** Exact rational of a plain decimal string; `InvalidMoneyError` if malformed. */
function decRat(s: string): Rat {
  if (typeof s !== 'string') throw new InvalidMoneyError(`decimal ${JSON.stringify(s)}: not a string`)
  const c = canonicalDecimal(s)
  const dot = c.indexOf('.')
  const frac = dot < 0 ? '' : c.slice(dot + 1)
  return { n: BigInt(c.replace('.', '')), d: pow10(frac.length) }
}

function mul(a: Rat, b: Rat): Rat {
  return { n: a.n * b.n, d: a.d * b.d }
}

function sign(a: Rat): number {
  return a.n < 0n ? -1 : a.n > 0n ? 1 : 0
}

function cmp(a: Rat, b: Rat): number {
  const x = a.n * b.d
  const y = b.n * a.d
  return x < y ? -1 : x > y ? 1 : 0
}

/** 1 + p/100. */
function onePlus(p: Rat): Rat {
  return { n: p.d * 100n + p.n, d: p.d * 100n }
}

/** Euclidean floor division for d > 0: [q, r] with 0 ≤ r < d. */
function floorDiv(n: bigint, d: bigint): [bigint, bigint] {
  let q = n / d
  let r = n % d
  if (r < 0n) {
    q -= 1n
    r += d
  }
  return [q, r]
}

// ------------------------------------------------------------- rounding

interface Compiled {
  inc: bigint
  end: bigint
  dir: RoundingDirection
  spec: CurrencySpec
}

function strictSpec(code: string): CurrencySpec {
  const spec = isoCurrencySpec(code)
  if (!spec) throw new InvalidMoneyError(`unknown currency ${JSON.stringify(code)}`)
  return spec
}

function compile(rule: RoundingRule, spec: CurrencySpec): Compiled {
  const dir = rule?.direction
  if (dir !== 'up' && dir !== 'down' && dir !== 'nearest') {
    throw new InvalidMoneyError(`rounding direction ${JSON.stringify(dir)} (up|down|nearest)`)
  }
  const inc = MoneyValue.parse(rule.increment, spec).minor
  const end = MoneyValue.parse(rule.ending, spec).minor
  if (inc <= 0n) throw new InvalidMoneyError(`rounding increment ${rule.increment} must be > 0`)
  if (end < 0n || end >= inc) {
    throw new InvalidMoneyError(`rounding ending ${rule.ending} must satisfy 0 <= ending < increment ${rule.increment}`)
  }
  return { inc, end, dir, spec }
}

function roundRat(c: Compiled, x: Rat): RoundedPrice {
  if (sign(x) < 0) throw new NegativeAmountError(`negative amount for ${c.spec.code}`)
  if (sign(x) === 0) return { amount: MoneyValue.zero(c.spec), direction: c.dir }
  // x in minor units = xn / xd.
  const xn = x.n * pow10(c.spec.minorUnits)
  const xd = x.d
  const [m, rem] = floorDiv(xn - c.end * xd, c.inc * xd)
  const down = m * c.inc + c.end
  const up = rem === 0n ? down : down + c.inc

  let chosen = up
  let applied: RoundingDirection = 'up'
  if (c.dir === 'down') {
    chosen = down
    applied = 'down'
  } else if (c.dir === 'nearest') {
    const dDown = xn - down * xd
    const dUp = up * xd - xn
    if (dDown < dUp) chosen = down
    applied = 'nearest'
  }
  if (chosen <= 0n) {
    chosen = up
    applied = 'up'
  }
  // fromMinor throws OverflowError outside int64 (same bound as Go).
  return { amount: MoneyValue.fromMinor(chosen, c.spec), direction: applied }
}

/**
 * Validates a rule for a currency: increment > 0, 0 ≤ ending < increment,
 * both multiples of the minor unit (`.99` in JPY → `PrecisionError`).
 */
export function validateRoundingRule(rule: RoundingRule, currency: string | CurrencySpec): void {
  compile(rule, typeof currency === 'string' ? strictSpec(currency) : currency)
}

/**
 * Applies the rule to x (exact decimal string in major units, any number of
 * decimals: "93.995" USD is fine). x < 0 → `NegativeAmountError`; x = 0 → 0.
 */
export function roundPrice(x: string, currency: string | CurrencySpec, rule: RoundingRule): RoundedPrice {
  const spec = typeof currency === 'string' ? strictSpec(currency) : currency
  const xr = decRat(x)
  return roundRat(compile(rule, spec), xr)
}

// ------------------------------------------------------------ derivation

function pct(s: string | undefined): Rat {
  return s === undefined || s === '' ? { n: 0n, d: 1n } : decRat(s)
}

function computedString(x: Rat, spec: CurrencySpec): string {
  const n = x.n * pow10(spec.minorUnits)
  // floor((2n + d) / 2d), x ≥ 0
  const q = (2n * n + x.d) / (2n * x.d)
  const digits = q.toString()
  const mu = spec.minorUnits
  if (mu === 0) return digits
  const padded = digits.padStart(mu + 1, '0')
  return `${padded.slice(0, padded.length - mu)}.${padded.slice(padded.length - mu)}`
}

/** Exact suggestion; same checks, order and error codes as Go's `pricederive.Derive`. */
export function derivePrice(input: DeriveInput): DerivedPrice {
  const src = input?.source
  const srcSpec = strictSpec(String(src?.currency_code ?? ''))
  const dstSpec = strictSpec(String(input.target_currency ?? ''))
  const rule = compile(input.rounding, dstSpec)
  const amount = MoneyValue.parse(src.amount, srcSpec)
  if (amount.sign() < 0) throw new NegativeAmountError(`source ${src.amount} ${srcSpec.code}`)
  const rate = decRat(input.rate)
  if (sign(rate) <= 0) throw new InvalidMoneyError(`rate ${input.rate} must be > 0`)
  if (srcSpec.code === dstSpec.code && cmp(rate, { n: 1n, d: 1n }) !== 0) {
    throw new InvalidMoneyError(`rate ${input.rate} between the same currency ${srcSpec.code} must be 1`)
  }
  const markup = pct(input.markup_pct)
  if (cmp(markup, { n: -100n, d: 1n }) <= 0) {
    throw new InvalidMoneyError(`markup_pct ${input.markup_pct} must be > -100`)
  }

  let x: Rat = { n: amount.minor, d: pow10(srcSpec.minorUnits) }
  x = mul(x, rate)
  x = mul(x, onePlus(markup))

  const basis = input.tax_basis ?? ''
  if (basis === 'net') {
    const tin = pct(input.tax_in_pct)
    const tout = pct(input.tax_out_pct)
    if (sign(tin) < 0 || sign(tout) < 0) throw new InvalidMoneyError('tax percentages must be >= 0')
    const t = onePlus(tin)
    x = mul({ n: x.n * t.d, d: x.d * t.n }, onePlus(tout))
  } else if (basis !== '' && basis !== 'as_entered') {
    throw new InvalidMoneyError(`tax_basis ${JSON.stringify(basis)} (net|as_entered)`)
  }

  const r = roundRat(rule, x)
  return { amount: r.amount, computed: computedString(x, dstSpec), direction: r.direction }
}
