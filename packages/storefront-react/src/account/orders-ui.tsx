/** Small shared pieces of the order screens: date formatting, hidden text, copy button, text resolution. */
import { formatMoney } from '@asteby/storefront'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useResolvedLocale } from '../locale.js'
import { accountMessages, fill, type AccountMessages } from './orders-messages.js'

const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

/**
 * Text the server (or the carrier through it) sent, ready to render: a trimmed non-empty string, a finite number as
 * text, else `null`. Every free-text field passes here, so an object or a number where a string was expected never
 * reaches React as a child (which throws) and never prints as `[object Object]`.
 */
export function str(v: unknown): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

/** A `Money` formatted, or `null` when it is missing or malformed (never a made-up `$0.00`). */
export function moneyText(v: unknown, locale: string): string | null {
  if (!v || typeof v !== 'object') return null
  const { amount, currency_code } = v as Record<string, unknown>
  const a = typeof amount === 'number' ? String(amount) : amount
  if (typeof a !== 'string' || !a.trim() || !Number.isFinite(Number(a)) || typeof currency_code !== 'string' || !/^[A-Za-z]{3}$/.test(currency_code)) return null
  return formatMoney({ amount: a.trim(), currency_code: currency_code.toUpperCase() }, locale)
}

/** Visually hidden text for screen readers. */
export function Hidden({ children }: { children: ReactNode }) {
  return <span style={SR_ONLY}>{children}</span>
}

export type AccountTextProps = {
  /** BCP 47; defaults to the provider's, then `es-MX`. */
  locale?: string
  /** Per-key text overrides (a store's own words). */
  messages?: Partial<AccountMessages>
  /** IANA time zone for dates (`America/Mexico_City`). Pass the store's own to get the same text on server and browser. */
  timeZone?: string
}

/** The texts and the date formatter of a component. */
export function useAccountText({ locale, messages, timeZone }: AccountTextProps) {
  const resolved = useResolvedLocale(locale)
  const m = accountMessages(resolved, messages)
  const date = (iso: string | null | undefined, style: 'date' | 'datetime' = 'date'): string | null => formatDate(iso, resolved, style, timeZone)
  const t = (key: keyof AccountMessages, vars?: Record<string, string | number>): string => (vars ? fill(m[key], vars) : m[key])
  return { locale: resolved, m, t, date, timeZone }
}

/** `"12 de agosto de 2026"`; `null` for a missing or invalid value. A bare `YYYY-MM-DD` is a calendar day, not an instant. */
export function formatDate(iso: string | null | undefined, locale: string, style: 'date' | 'datetime' = 'date', timeZone?: string): string | null {
  if (!iso || typeof iso !== 'string') return null
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso)
  const d = new Date(dayOnly ? `${iso}T12:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return null
  const zone = dayOnly ? 'UTC' : timeZone
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long', ...(style === 'datetime' && !dayOnly ? { timeStyle: 'short' } : {}), ...(zone ? { timeZone: zone } : {}) }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/** A `<time>` with its machine value. Server and browser may disagree on the zone: the text is allowed to differ. */
export function Time({ value, text, className }: { value: string | null | undefined; text: string | null; className?: string | undefined }) {
  if (!value || !text) return null
  return (
    <time dateTime={value} className={className} suppressHydrationWarning>
      {text}
    </time>
  )
}

/** Plural by count (`one` for 1) with the `{count}` template. */
export function plural(m: AccountMessages, base: 'order.items', count: number): string {
  return fill(base === 'order.items' && count === 1 ? m['order.items.one'] : m['order.items.other'], { count })
}

export type CopyButtonProps = {
  value: string
  label: string
  copiedLabel: string
  failedLabel: string
  className?: string | undefined
  /** Accessible name when the visible label is generic ("Copiar" for the tracking number). */
  ariaLabel?: string | undefined
  'data-sf-copy'?: string
}

/**
 * Copies `value` to the clipboard. The result is announced in a polite live region (visible text or not) so it is
 * heard; when the browser refuses (no permission, insecure context) the buyer is told to select the text instead.
 */
export function CopyButton({ value, label, copiedLabel, failedLabel, className, ariaLabel, ...rest }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value)
      setState('copied')
    } catch {
      setState('failed')
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), 3000)
  }, [value])
  return (
    <>
      <button type="button" onClick={copy} className={className} aria-label={ariaLabel} data-sf-copy={rest['data-sf-copy'] ?? ''} data-state={state}>
        {state === 'copied' ? copiedLabel : label}
      </button>
      <span role="status" aria-live="polite" data-sf-copy-status style={state === 'failed' ? undefined : SR_ONLY}>
        {state === 'copied' ? copiedLabel : state === 'failed' ? failedLabel : ''}
      </span>
    </>
  )
}
