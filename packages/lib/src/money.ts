/**
 * Exact money for the platform: the TypeScript twin of the kernel `money`
 * package (Go). Amounts live in integer minor units (`bigint`) plus the
 * currency spec; nothing goes through `number`/`parseFloat`.
 *
 * - Wire shape: `Money = { amount: "1899.00", currency_code: "MXN" }`, the
 *   same contract as `@asteby/storefront` and the kernel's JSON.
 * - Arithmetic only within one currency (`CurrencyMismatchError`), int64
 *   bounds enforced (`OverflowError`), parsing never drops digits
 *   (`PrecisionError`) unless you ask for rounding (`parseRound`).
 * - `allocate` uses the largest remainder method: parts always add up to the
 *   total, exactly.
 * - Rates are QUOTE units per 1 BASE unit (USD→MXN 17.2345).
 *
 * Behaviour is pinned by `src/__fixtures__/money.golden.json`, a byte-for-byte
 * copy of the kernel's `money/testdata/golden.json` (compared by sha256).
 * Pure: no React, no DOM.
 */

/** Wire/JSON money: decimal string amount + ISO 4217 code. */
export type Money = { amount: string; currency_code: string }

/** Currency description used for arithmetic and formatting. */
export interface CurrencySpec {
  /** ISO 4217 code ("MXN"). */
  code: string
  /** Decimals of the currency (MXN 2, JPY 0, KWD 3). */
  minorUnits: number
  /**
   * Cash rounding increment in MINOR units (CHF 5 = 0.05). 0/1/undefined =
   * no cash rounding. Same as the kernel's `Spec.CashIncrementMinor`.
   */
  cashIncrement?: number
  /** Where `formatMoney` puts the symbol; omitted = the locale decides. */
  symbolPosition?: 'before' | 'after'
}

export type RoundingMode =
  | 'halfAwayFromZero'
  | 'halfEven'
  | 'towardZero'
  | 'awayFromZero'
  | 'floor'
  | 'ceil'

/** All rounding modes, in the kernel's order. `halfAwayFromZero` is the default. */
export const ROUNDING_MODES: readonly RoundingMode[] = [
  'halfAwayFromZero',
  'halfEven',
  'towardZero',
  'awayFromZero',
  'floor',
  'ceil',
]

/** Exchange rate: `value` units of `quote` per 1 unit of `base`. */
export interface Rate {
  id?: string
  base: string
  quote: string
  /** Plain decimal string ("17.2345"). */
  value: string
  kind?: string
  /** True when obtained by inverting a stored rate. */
  inverted?: boolean
  /** True when computed (inverse/cross) instead of read as stored. */
  derived?: boolean
}

// ---------------------------------------------------------------- errors

export type MoneyErrorCode = 'currency_mismatch' | 'overflow' | 'precision' | 'invalid'

export class MoneyError extends Error {
  readonly code: MoneyErrorCode
  constructor(code: MoneyErrorCode, message: string) {
    super(`money: ${message}`)
    this.name = 'MoneyError'
    this.code = code
  }
}

/** Two amounts (or an amount and a rate) do not share the currency. */
export class CurrencyMismatchError extends MoneyError {
  constructor(message: string) {
    super('currency_mismatch', message)
    this.name = 'CurrencyMismatchError'
  }
}

/** The input has more decimals than the currency allows. */
export class PrecisionError extends MoneyError {
  constructor(message: string) {
    super('precision', message)
    this.name = 'PrecisionError'
  }
}

/** The result does not fit in int64 minor units (same bound as the kernel). */
export class OverflowError extends MoneyError {
  constructor(message: string) {
    super('overflow', message)
    this.name = 'OverflowError'
  }
}

/** Malformed decimal, unknown currency, bad spec, weights, rate or mode. */
export class InvalidMoneyError extends MoneyError {
  constructor(message: string) {
    super('invalid', message)
    this.name = 'InvalidMoneyError'
  }
}

// --------------------------------------------------------------- decimals

const INT64_MIN = -(1n << 63n)
const INT64_MAX = (1n << 63n) - 1n
const UINT64_LIMIT = 1n << 64n
const MAX_DECIMAL_LEN = 256
const MAX_SCALE = 64
const MAX_MINOR_UNITS = 18
const DECIMAL_RE = /^[+-]?[0-9]+(?:\.[0-9]+)?$/

/** Default scale of derived inverse rates (fx_rates numeric(28,12)). */
export const INVERSE_SCALE = 12

interface Dec {
  coef: bigint
  scale: number
}

function pow10(n: number): bigint {
  return 10n ** BigInt(n)
}

function parseDec(s: string): Dec {
  if (typeof s !== 'string' || s.length === 0 || s.length > MAX_DECIMAL_LEN || !DECIMAL_RE.test(s)) {
    throw new InvalidMoneyError(`decimal ${JSON.stringify(truncate(String(s)))}: not a plain decimal`)
  }
  const dot = s.indexOf('.')
  const frac = dot < 0 ? '' : s.slice(dot + 1)
  const digits = (dot < 0 ? s : s.slice(0, dot)).replace(/^[+-]/, '') + frac
  const coef = BigInt(digits)
  return { coef: s.startsWith('-') ? -coef : coef, scale: frac.length }
}

function truncate(s: string): string {
  return s.length > 32 ? `${s.slice(0, 32)}…` : s
}

function formatScaled(coef: bigint, scale: number): string {
  const neg = coef < 0n
  let digits = (neg ? -coef : coef).toString()
  if (scale > 0) {
    if (digits.length <= scale) digits = '0'.repeat(scale - digits.length + 1) + digits
    digits = `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`
  }
  return neg ? `-${digits}` : digits
}

function checkMode(mode: RoundingMode): void {
  if (!ROUNDING_MODES.includes(mode)) {
    throw new InvalidMoneyError(`unknown rounding mode ${JSON.stringify(mode)}`)
  }
}

function checkScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) {
    throw new InvalidMoneyError(`scale ${scale} out of range`)
  }
}

/** num/den rounded to an integer with mode (den ≠ 0). */
function divRound(num: bigint, den: bigint, mode: RoundingMode): bigint {
  const q = num / den // truncates toward zero
  const r = num % den
  if (r === 0n) return q
  const sign = (num < 0n) !== (den < 0n) ? -1n : 1n
  let up: boolean
  switch (mode) {
    case 'towardZero':
      up = false
      break
    case 'awayFromZero':
      up = true
      break
    case 'floor':
      up = sign < 0n
      break
    case 'ceil':
      up = sign > 0n
      break
    default: {
      const r2 = (r < 0n ? -r : r) * 2n
      const d = den < 0n ? -den : den
      up = r2 > d || (r2 === d && (mode === 'halfAwayFromZero' || q % 2n !== 0n))
    }
  }
  return up ? q + sign : q
}

function roundDec(d: Dec, scale: number, mode: RoundingMode): Dec {
  if (scale >= d.scale) return { coef: d.coef * pow10(scale - d.scale), scale }
  return { coef: divRound(d.coef, pow10(d.scale - scale), mode), scale }
}

function cmpDec(a: Dec, b: Dec): number {
  let x = a.coef
  let y = b.coef
  if (a.scale < b.scale) x *= pow10(b.scale - a.scale)
  else if (a.scale > b.scale) y *= pow10(a.scale - b.scale)
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * Validates a plain decimal string and returns its canonical form
 * ("-0.00" → "0.00", "+3" → "3"). Rejects exponents, separators, NaN, double
 * signs and bare dots with `InvalidMoneyError`.
 */
export function canonicalDecimal(s: string): string {
  const d = parseDec(s)
  return formatScaled(d.coef, d.scale)
}

/** Exact product of two decimal strings (scale = sum of scales). */
export function decimalMul(a: string, b: string): string {
  const x = parseDec(a)
  const y = parseDec(b)
  return formatScaled(x.coef * y.coef, x.scale + y.scale)
}

/** a / b rounded to `scale` digits with `mode`. */
export function decimalQuo(a: string, b: string, scale: number, mode: RoundingMode): string {
  const x = parseDec(a)
  const y = parseDec(b)
  if (y.coef === 0n) throw new InvalidMoneyError('division by zero')
  checkScale(scale)
  checkMode(mode)
  const num = x.coef * pow10(y.scale + scale)
  const den = y.coef * pow10(x.scale)
  return formatScaled(divRound(num, den, mode), scale)
}

// ------------------------------------------------------------- ISO 4217

// ISO 4217 list one (active codes) → minor units. Keep identical to the
// kernel (money/iso.go) and to the "iso" section of the golden file.
const ISO_MINOR_UNITS: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    (
      'AED2 AFN2 ALL2 AMD2 ANG2 AOA2 ARS2 AUD2 AWG2 AZN2 BAM2 BBD2 BDT2 BGN2 BHD3 BIF0 ' +
      'BMD2 BND2 BOB2 BOV2 BRL2 BSD2 BTN2 BWP2 BYN2 BZD2 CAD2 CDF2 CHE2 CHF2 CHW2 CLF4 ' +
      'CLP0 CNY2 COP2 COU2 CRC2 CUC2 CUP2 CVE2 CZK2 DJF0 DKK2 DOP2 DZD2 EGP2 ERN2 ETB2 ' +
      'EUR2 FJD2 FKP2 GBP2 GEL2 GHS2 GIP2 GMD2 GNF0 GTQ2 GYD2 HKD2 HNL2 HTG2 HUF2 IDR2 ' +
      'ILS2 INR2 IQD3 IRR2 ISK0 JMD2 JOD3 JPY0 KES2 KGS2 KHR2 KMF0 KPW2 KRW0 KWD3 KYD2 ' +
      'KZT2 LAK2 LBP2 LKR2 LRD2 LSL2 LYD3 MAD2 MDL2 MGA2 MKD2 MMK2 MNT2 MOP2 MRU2 MUR2 ' +
      'MVR2 MWK2 MXN2 MXV2 MYR2 MZN2 NAD2 NGN2 NIO2 NOK2 NPR2 NZD2 OMR3 PAB2 PEN2 PGK2 ' +
      'PHP2 PKR2 PLN2 PYG0 QAR2 RON2 RSD2 RUB2 RWF0 SAR2 SBD2 SCR2 SDG2 SEK2 SGD2 SHP2 ' +
      'SLE2 SLL2 SOS2 SRD2 SSP2 STN2 SVC2 SYP2 SZL2 THB2 TJS2 TMT2 TND3 TOP2 TRY2 TTD2 ' +
      'TWD2 TZS2 UAH2 UGX0 USD2 USN2 UYI0 UYU2 UYW4 UZS2 VED2 VES2 VND0 VUV0 WST2 XAF0 ' +
      'XCD2 XCG2 XOF0 XPF0 YER2 ZAR2 ZMW2 ZWG2 ZWL2'
    )
      .split(' ')
      .map((e) => [e.slice(0, 3), Number(e.slice(3))]),
  ),
)

// Default cash rounding increments in minor units (CLDR); orgs may override.
const CASH_INCREMENTS: Readonly<Record<string, number>> = Object.freeze({
  CHF: 5,
  CAD: 5,
  DKK: 50,
  SEK: 100,
  NOK: 100,
  CZK: 100,
  HUF: 100,
})

/** Every ISO code known to the local table, sorted. */
export function isoCurrencyCodes(): string[] {
  return Object.keys(ISO_MINOR_UNITS).sort()
}

/**
 * Strict ISO 4217 lookup (case-insensitive): the same table as the kernel's
 * `money.ISO`. Returns `undefined` for codes it does not know.
 */
export function isoCurrencySpec(code: string): CurrencySpec | undefined {
  const c = String(code).trim().toUpperCase()
  const minorUnits = ISO_MINOR_UNITS[c]
  if (minorUnits === undefined) return undefined
  const spec: CurrencySpec = { code: c, minorUnits }
  const cash = CASH_INCREMENTS[c]
  if (cash) spec.cashIncrement = cash
  return spec
}

/**
 * Spec for any currency code: the ISO table first; unknown but well-formed
 * codes fall back to what `Intl` reports (`resolvedOptions().maximumFractionDigits`).
 * Throws `InvalidMoneyError` for malformed codes.
 */
export function currencySpec(code: string): CurrencySpec {
  const iso = isoCurrencySpec(code)
  if (iso) return iso
  const c = String(code).trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(c)) throw new InvalidMoneyError(`currency code ${JSON.stringify(code)}`)
  let minorUnits = 2
  try {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency: c }).resolvedOptions()
      .maximumFractionDigits
    if (typeof digits === 'number') minorUnits = digits
  } catch {
    // keep 2
  }
  return { code: c, minorUnits }
}

function validateSpec(spec: CurrencySpec): CurrencySpec {
  if (!spec || typeof spec.code !== 'string' || spec.code === '') {
    throw new InvalidMoneyError('empty currency code')
  }
  if (!Number.isInteger(spec.minorUnits) || spec.minorUnits < 0 || spec.minorUnits > MAX_MINOR_UNITS) {
    throw new InvalidMoneyError(`${spec.code} minor units ${spec.minorUnits} out of range`)
  }
  if (spec.cashIncrement !== undefined && (!Number.isSafeInteger(spec.cashIncrement) || spec.cashIncrement < 0)) {
    throw new InvalidMoneyError(`${spec.code} cash increment ${spec.cashIncrement}`)
  }
  return spec
}

/** A string spec is resolved strictly (ISO table); pass an object for other currencies. */
function resolveSpec(spec: CurrencySpec | string): CurrencySpec {
  if (typeof spec === 'string') {
    const iso = isoCurrencySpec(spec)
    if (!iso) throw new InvalidMoneyError(`unknown currency ${JSON.stringify(spec)}`)
    return iso
  }
  return validateSpec(spec)
}

function fit(minor: bigint, code: string): bigint {
  if (minor < INT64_MIN || minor > INT64_MAX) {
    throw new OverflowError(`${truncate(minor.toString())} minor units of ${code}`)
  }
  return minor
}

// ----------------------------------------------------------------- money

/**
 * Immutable exact amount: integer minor units (`bigint`, int64 range) + spec.
 *
 * @example
 * const total = MoneyValue.parse('1899.00', 'MXN')
 * const iva = total.mulDecimal('0.16') // 303.84 MXN
 * total.allocate([1, 1, 1]).map(String) // ['633.00', '633.00', '633.00']
 */
export class MoneyValue {
  readonly minor: bigint
  readonly spec: CurrencySpec

  private constructor(minor: bigint, spec: CurrencySpec) {
    this.minor = minor
    this.spec = spec
    Object.freeze(this)
  }

  /** Amount from minor units (`fromMinor(189900n, 'MXN')` = 1899.00). */
  static fromMinor(minor: bigint | number, spec: CurrencySpec | string): MoneyValue {
    const s = resolveSpec(spec)
    if (typeof minor === 'number' && !Number.isSafeInteger(minor)) {
      throw new InvalidMoneyError(`minor units ${minor} is not a safe integer`)
    }
    return new MoneyValue(fit(BigInt(minor), s.code), s)
  }

  static zero(spec: CurrencySpec | string): MoneyValue {
    return new MoneyValue(0n, resolveSpec(spec))
  }

  /**
   * Parses a plain decimal string. `PrecisionError` if it cannot be
   * represented with `minorUnits` decimals (trailing zeros are fine: "10.0"
   * JPY = 10), `OverflowError` outside int64, `InvalidMoneyError` for
   * malformed input or an unknown currency code.
   */
  static parse(amount: string, spec: CurrencySpec | string): MoneyValue {
    const s = resolveSpec(spec)
    const d = parseDec(amount)
    const r = roundDec(d, s.minorUnits, 'towardZero')
    if (cmpDec(r, d) !== 0) {
      throw new PrecisionError(`${truncate(amount)} has more than ${s.minorUnits} decimals for ${s.code}`)
    }
    return new MoneyValue(fit(r.coef, s.code), s)
  }

  /** Like `parse` but rounds extra decimals with `mode`. */
  static parseRound(
    amount: string,
    spec: CurrencySpec | string,
    mode: RoundingMode = 'halfAwayFromZero',
  ): MoneyValue {
    const s = resolveSpec(spec)
    checkMode(mode)
    const r = roundDec(parseDec(amount), s.minorUnits, mode)
    return new MoneyValue(fit(r.coef, s.code), s)
  }

  /**
   * From the wire shape. Without `spec` the currency must be in the ISO table
   * (as in the kernel's UnmarshalJSON); pass a spec for other currencies or to
   * carry an organization's cash rounding.
   */
  static fromJSON(m: Money, spec?: CurrencySpec): MoneyValue {
    if (!m || typeof m.amount !== 'string' || typeof m.currency_code !== 'string') {
      throw new InvalidMoneyError('money must be {amount: string, currency_code: string}')
    }
    if (spec && spec.code !== m.currency_code) {
      throw new CurrencyMismatchError(`${m.currency_code} vs spec ${spec.code}`)
    }
    return MoneyValue.parse(m.amount, spec ?? m.currency_code)
  }

  /** ISO code. */
  get currency(): string {
    return this.spec.code
  }

  private same(o: MoneyValue): void {
    if (o.spec.code !== this.spec.code || o.spec.minorUnits !== this.spec.minorUnits) {
      throw new CurrencyMismatchError(
        `${this.spec.code}(${this.spec.minorUnits}) vs ${o.spec.code}(${o.spec.minorUnits})`,
      )
    }
  }

  private with(minor: bigint): MoneyValue {
    return new MoneyValue(fit(minor, this.spec.code), this.spec)
  }

  add(o: MoneyValue): MoneyValue {
    this.same(o)
    return this.with(this.minor + o.minor)
  }

  sub(o: MoneyValue): MoneyValue {
    this.same(o)
    return this.with(this.minor - o.minor)
  }

  neg(): MoneyValue {
    return this.with(-this.minor)
  }

  /** -1, 0 or 1. */
  cmp(o: MoneyValue): number {
    this.same(o)
    return this.minor < o.minor ? -1 : this.minor > o.minor ? 1 : 0
  }

  equals(o: MoneyValue): boolean {
    return o.spec.code === this.spec.code && o.spec.minorUnits === this.spec.minorUnits && o.minor === this.minor
  }

  sign(): -1 | 0 | 1 {
    return this.minor < 0n ? -1 : this.minor > 0n ? 1 : 0
  }

  isZero(): boolean {
    return this.minor === 0n
  }

  /** this × factor (decimal string), rounded to minor units. */
  mulDecimal(factor: string, mode: RoundingMode = 'halfAwayFromZero'): MoneyValue {
    checkMode(mode)
    const d = parseDec(factor)
    return this.with(divRound(this.minor * d.coef, pow10(d.scale), mode))
  }

  /**
   * Largest remainder split: parts add up to this amount exactly; leftover
   * minor units go to the largest remainders, ties to the earliest index.
   * Weights: non-negative integers, not all zero.
   */
  allocate(weights: ReadonlyArray<number | bigint>): MoneyValue[] {
    if (weights.length === 0) throw new InvalidMoneyError('allocate needs at least one weight')
    const ws = weights.map((w) => {
      if (typeof w === 'number' && !Number.isSafeInteger(w)) {
        throw new InvalidMoneyError(`weight ${w} is not an integer`)
      }
      const b = BigInt(w)
      if (b < 0n) throw new InvalidMoneyError(`negative weight ${b}`)
      if (b > INT64_MAX) throw new InvalidMoneyError(`weight ${b} out of range`)
      return b
    })
    const total = ws.reduce((a, b) => a + b, 0n)
    if (total >= UINT64_LIMIT) throw new OverflowError('sum of weights')
    if (total === 0n) throw new InvalidMoneyError('all weights are zero')
    const abs = this.minor < 0n ? -this.minor : this.minor
    const quotas = ws.map((w) => (abs * w) / total)
    const rems = ws.map((w) => (abs * w) % total)
    let left = abs - quotas.reduce((a, b) => a + b, 0n)
    const order = ws.map((_, i) => i).sort((a, b) => {
      const ra = rems[a] as bigint
      const rb = rems[b] as bigint
      return ra === rb ? a - b : ra > rb ? -1 : 1
    })
    for (let k = 0; left > 0n; k++, left--) {
      const i = order[k] as number
      quotas[i] = (quotas[i] as bigint) + 1n
    }
    return quotas.map((q) => this.with(this.minor < 0n ? -q : q))
  }

  /** Rounds to the spec's cash increment (CHF: 12.32 → 12.30, 12.33 → 12.35). */
  roundCash(mode: RoundingMode = 'halfAwayFromZero'): MoneyValue {
    checkMode(mode)
    const inc = BigInt(this.spec.cashIncrement ?? 0)
    if (inc <= 1n) return this
    return this.with(divRound(this.minor, inc, mode) * inc)
  }

  /**
   * Converts to `to` with `rate` (rate.base must be this currency and
   * rate.quote the target, else `CurrencyMismatchError`).
   */
  convert(rate: Rate, to: CurrencySpec | string, mode: RoundingMode = 'halfAwayFromZero'): MoneyValue {
    const target = resolveSpec(to)
    checkMode(mode)
    const v = parseDec(rate.value)
    if (v.coef <= 0n) throw new InvalidMoneyError(`rate ${rate.base}/${rate.quote} must be > 0`)
    if (rate.base !== this.spec.code) {
      throw new CurrencyMismatchError(`amount in ${this.spec.code}, rate base ${rate.base}`)
    }
    if (rate.quote !== target.code) {
      throw new CurrencyMismatchError(`target ${target.code}, rate quote ${rate.quote}`)
    }
    const num = this.minor * v.coef * pow10(target.minorUnits)
    const den = pow10(v.scale + this.spec.minorUnits)
    return new MoneyValue(fit(divRound(num, den, mode), target.code), target)
  }

  /** Canonical amount with exactly `minorUnits` decimals: "1899.00", "1000" (JPY). */
  toString(): string {
    return formatScaled(this.minor, this.spec.minorUnits)
  }

  toJSON(): Money {
    return { amount: this.toString(), currency_code: this.spec.code }
  }
}

/**
 * Inverse of a rate (quote→base): 1/value at `scale` digits with halfEven,
 * marked `derived` and with `inverted` flipped.
 */
export function inverseRate(rate: Rate, scale: number = INVERSE_SCALE): Rate {
  const v = parseDec(rate.value)
  if (v.coef <= 0n) throw new InvalidMoneyError(`rate ${rate.base}/${rate.quote} must be > 0`)
  const inv = decimalQuo('1', rate.value, scale, 'halfEven')
  if (parseDec(inv).coef === 0n) {
    throw new PrecisionError(`inverse of ${rate.value} rounds to 0 at scale ${scale}`)
  }
  const out: Rate = { ...rate, base: rate.quote, quote: rate.base, value: inv, inverted: !rate.inverted, derived: true }
  return out
}

// ------------------------------------------------------------ from number

/**
 * Plain (no exponent) decimal string for a finite JS number, so UI code that
 * still holds `number` can enter the exact-money pipeline. Uses the shortest
 * round-trip digits of the number (`1.005` stays "1.005", never 1.00499999...).
 */
export function numberToDecimal(n: number): string {
  if (!Number.isFinite(n)) throw new InvalidMoneyError(`${n} is not a finite number`)
  const s = String(n)
  if (!/e/i.test(s)) return s
  const [mant = '', exp = '0'] = s.toLowerCase().split('e')
  const e = Number(exp)
  const neg = mant.startsWith('-')
  const [int = '', frac = ''] = mant.replace('-', '').split('.')
  const digits = int + frac
  const point = int.length + e
  let out: string
  if (point <= 0) out = '0.' + '0'.repeat(-point) + digits
  else if (point >= digits.length) out = digits + '0'.repeat(point - digits.length)
  else out = digits.slice(0, point) + '.' + digits.slice(point)
  return neg ? '-' + out : out
}

/**
 * Money from a JS number, rounded to the currency's minor units (default
 * `halfAwayFromZero`). `spec` may be an ISO code or a full spec.
 */
export function moneyFromNumber(
  amount: number,
  spec: CurrencySpec | string,
  mode: RoundingMode = 'halfAwayFromZero',
): MoneyValue {
  return MoneyValue.parseRound(numberToDecimal(amount), spec, mode)
}

// ------------------------------------------------------------ formatting

export interface FormatMoneyOptions {
  /** BCP 47 locale (default 'es', like `formatCurrency`). */
  locale?: string
  /** Overrides the spec resolved with `currencySpec(currency_code)`. */
  spec?: CurrencySpec
  /** Intl `currencyDisplay` (default 'symbol'). */
  display?: 'symbol' | 'narrowSymbol' | 'code' | 'name'
}

type StringFormat = {
  format(v: string): string
  formatToParts(v: string): Intl.NumberFormatPart[]
}

/**
 * Formats money with `Intl.NumberFormat`, using exactly `spec.minorUnits`
 * fraction digits and passing the decimal STRING to Intl (no parseFloat, so
 * 1e12 VES or 0.1 + 0.2 never lose digits). Returns '' for a malformed amount
 * and `"<amount> <code>"` if Intl rejects the currency.
 */
export function formatMoney(m: Money | MoneyValue, options: FormatMoneyOptions = {}): string {
  const json = m instanceof MoneyValue ? m.toJSON() : m
  let amount: string
  try {
    amount = canonicalDecimal(json.amount)
  } catch {
    return ''
  }
  const code = json.currency_code
  let spec: CurrencySpec
  try {
    spec = options.spec ?? currencySpec(code)
  } catch {
    return `${amount} ${code}`
  }
  try {
    const nf = new Intl.NumberFormat(options.locale ?? 'es', {
      style: 'currency',
      currency: code,
      currencyDisplay: options.display ?? 'symbol',
      minimumFractionDigits: spec.minorUnits,
      maximumFractionDigits: spec.minorUnits,
    }) as unknown as StringFormat
    if (!spec.symbolPosition) return nf.format(amount)
    return placeSymbol(nf.formatToParts(amount), spec.symbolPosition)
  } catch {
    return `${amount} ${code}`
  }
}

function placeSymbol(parts: Intl.NumberFormatPart[], position: 'before' | 'after'): string {
  const symbol = parts.find((p) => p.type === 'currency')?.value ?? ''
  const sign = parts.filter((p) => p.type === 'minusSign' || p.type === 'plusSign').map((p) => p.value).join('')
  const number = parts
    .filter((p) => p.type !== 'currency' && p.type !== 'minusSign' && p.type !== 'plusSign')
    .map((p) => p.value)
    .join('')
    .trim()
  return position === 'before' ? `${sign}${symbol}${number}` : `${sign}${number} ${symbol}`
}
