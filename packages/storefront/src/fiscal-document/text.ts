/**
 * Text helpers of the rules engine. Pure; no DOM, no network.
 */

const MARKS = /\p{M}+/gu

/** Removes accents WITHOUT changing the length (a character that would change length stays as is). Keeps the case. */
export function stripMarks(s: string): string {
  let out = ''
  for (const ch of s) {
    const base = ch.normalize('NFD').replace(MARKS, '')
    out += base.length === ch.length ? base : ch
  }
  return out
}

/**
 * Removes accents and lowercases WITHOUT changing the length: every character maps to exactly one, so an index
 * found in the folded text is the same index in the original. A character that would change length stays as is.
 */
export function foldAligned(s: string): string {
  let out = ''
  for (const ch of s) {
    const low = ch.normalize('NFD').replace(MARKS, '').toLowerCase()
    out += low.length === ch.length ? low : ch
  }
  return out
}

/** Accent-less, lowercase, single-spaced: the base of every phrase comparison. */
export function foldText(s: string): string {
  return foldAligned(s).replace(/\s+/g, ' ').trim()
}

/** Collapses every kind of space (incl. non-breaking and line breaks) into one space. */
export function squash(s: string): string {
  return s.replace(/[  -​  　﻿]/g, ' ').replace(/\s+/g, ' ').trim()
}

export const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
}

const MONTH_ALT = Object.keys(MONTHS).join('|')

function iso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const t = new Date(Date.UTC(y, m - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * First date in `foldedText` as `YYYY-MM-DD`: `15 de marzo de 2026`, `march 15, 2026`, `2026-03-15`, `15/03/2026`.
 * Numeric `a/b/yyyy` follows `order` (`dmy` default). `null` when none is a real date.
 */
export function findDate(foldedText: string, order: 'dmy' | 'mdy' | 'ymd' = 'dmy'): string | null {
  const t = foldedText
  const candidates: { at: number; value: string | null }[] = []
  const push = (m: RegExpExecArray | null, f: (m: RegExpExecArray) => string | null) => {
    if (m) candidates.push({ at: m.index, value: f(m) })
  }
  push(new RegExp(`\\b(\\d{1,2})\\s*(?:de|del)?\\s*(${MONTH_ALT})\\s*(?:de|del|,)?\\s*(\\d{4})\\b`).exec(t), (m) => iso(+m[3]!, MONTHS[m[2]!]!, +m[1]!))
  push(new RegExp(`\\b(${MONTH_ALT})\\s+(\\d{1,2})\\s*,?\\s*(\\d{4})\\b`).exec(t), (m) => iso(+m[3]!, MONTHS[m[1]!]!, +m[2]!))
  push(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(t), (m) => iso(+m[1]!, +m[2]!, +m[3]!))
  push(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/.exec(t), (m) => {
    const a = +m[1]!
    const b = +m[2]!
    return order === 'mdy' ? iso(+m[3]!, a, b) : iso(+m[3]!, b, a)
  })
  return candidates.filter((c) => c.value).sort((a, b) => a.at - b.at)[0]?.value ?? null
}

/** Whole days from `iso` (`YYYY-MM-DD`) to `now`; `null` for an invalid date. Negative: in the future. */
export function ageInDays(isoDate: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) return null
  const then = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.floor((today - then) / 86_400_000)
}

/** Hex SHA-256 of the bytes (Web Crypto: browsers, Node 20+, edge runtimes). */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle
  if (!subtle) throw new TypeError('sha256Hex: Web Crypto (crypto.subtle) is not available')
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const digest = await subtle.digest('SHA-256', bytes as unknown as BufferSource)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
