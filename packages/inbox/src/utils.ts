import type { InboxTime } from './types'

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ')

export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background'

export const TOUCH_BTN =
  'inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg transition-colors duration-150 motion-reduce:transition-none'

export function toDate(t: InboxTime): Date | null {
  const d = t instanceof Date ? t : new Date(t)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Compact list timestamp: time today, weekday this week, short date after. */
export function formatListTime(t: InboxTime, locale: string, now = Date.now()): string {
  const d = toDate(t)
  if (!d) return ''
  const diff = now - d.getTime()
  const day = 86_400_000
  if (diff < day && new Date(now).getDate() === d.getDate()) {
    return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }
  if (diff < 6 * day) return d.toLocaleDateString(locale, { weekday: 'short' })
  const sameYear = new Date(now).getFullYear() === d.getFullYear()
  return d.toLocaleDateString(locale, sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: '2-digit' })
}

export function formatFullTime(t: InboxTime, locale: string): string {
  const d = toDate(t)
  return d ? d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

export function formatBytes(n?: number): string {
  if (n == null || !Number.isFinite(n)) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function initials(name: string): string {
  const parts = name.replace(/[<>"@]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  const a = parts[0]!.charAt(0)
  const b = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : ''
  return (a + b).toUpperCase()
}

/** Returns the URL only when it is http(s), blob: or scheme-less (relative); otherwise undefined (blocks javascript:, data:...). */
export function safeUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  const clean = url.replace(/[\u0000-\u0020]/g, '')
  if (!clean) return undefined
  return /^[a-z][a-z0-9+.-]*:/i.test(clean) ? (/^(https?|blob):/i.test(clean) ? url.trim() : undefined) : url.trim()
}
