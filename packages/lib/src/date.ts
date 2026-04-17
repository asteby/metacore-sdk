import {
  format as dfFormat,
  formatDistanceToNow,
  formatRelative as dfFormatRelative,
  parseISO,
  isValid,
} from 'date-fns'

export interface TimezoneInfo {
  value: string
  label: string
  offset: string
}

/** Normalizes any input (Date | string | number) to a Date, returns null if invalid. */
function toDate(input: Date | string | number | null | undefined): Date | null {
  if (input == null) return null
  if (input instanceof Date) return isValid(input) ? input : null
  if (typeof input === 'number') {
    const d = new Date(input)
    return isValid(d) ? d : null
  }
  const parsed = parseISO(input)
  if (isValid(parsed)) return parsed
  const fallback = new Date(input)
  return isValid(fallback) ? fallback : null
}

/**
 * Format a date using date-fns tokens.
 * @example formatDate('2024-01-15', 'dd/MM/yyyy') -> "15/01/2024"
 */
export function formatDate(
  input: Date | string | number | null | undefined,
  pattern: string = 'PPP',
  fallback: string = '',
): string {
  const d = toDate(input)
  if (!d) return fallback
  try {
    return dfFormat(d, pattern)
  } catch {
    return fallback
  }
}

/**
 * Distance to now: e.g. "5 minutes ago", "in 2 days".
 */
export function formatDistance(
  input: Date | string | number | null | undefined,
  options: { addSuffix?: boolean } = { addSuffix: true },
  fallback: string = '',
): string {
  const d = toDate(input)
  if (!d) return fallback
  try {
    return formatDistanceToNow(d, options)
  } catch {
    return fallback
  }
}

/**
 * Relative description: "yesterday at 3:00 PM", "last Wednesday at 10:00 AM".
 */
export function formatRelative(
  input: Date | string | number | null | undefined,
  baseDate: Date = new Date(),
  fallback: string = '',
): string {
  const d = toDate(input)
  if (!d) return fallback
  try {
    return dfFormatRelative(d, baseDate)
  } catch {
    return fallback
  }
}

/**
 * Returns all supported IANA timezones with their current GMT offset.
 */
export function getAllTimezones(): TimezoneInfo[] {
  const timezones: string[] =
    typeof Intl !== 'undefined' && (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf
      ? (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone')
      : [
          'UTC',
          'America/Mexico_City',
          'America/Bogota',
          'America/Santiago',
          'America/Argentina/Buenos_Aires',
          'America/New_York',
          'America/Los_Angeles',
          'Europe/Madrid',
          'Europe/London',
          'Europe/Paris',
          'Asia/Tokyo',
          'Asia/Shanghai',
          'Asia/Dubai',
          'Australia/Sydney',
        ]

  const now = new Date()

  return timezones
    .map((tz: string): TimezoneInfo => {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          timeZoneName: 'shortOffset',
        })
        const parts = formatter.formatToParts(now)
        const offset = parts.find((p) => p.type === 'timeZoneName')?.value || ''
        return {
          value: tz,
          label: `(${offset}) ${tz.replace(/_/g, ' ')}`,
          offset,
        }
      } catch {
        return { value: tz, label: tz, offset: '' }
      }
    })
    .sort((a: TimezoneInfo, b: TimezoneInfo) => {
      const getOffsetValue = (off: string): number => {
        if (!off || off === 'GMT') return 0
        const match = off.match(/GMT([+-])(\d+)(?::(\d+))?/)
        if (!match) return 0
        const sign = match[1] === '+' ? 1 : -1
        const hours = parseInt(match[2] ?? '0', 10)
        const minutes = parseInt(match[3] ?? '0', 10)
        return sign * (hours * 60 + minutes)
      }
      const oa = getOffsetValue(a.offset)
      const ob = getOffsetValue(b.offset)
      if (oa !== ob) return oa - ob
      return a.value.localeCompare(b.value)
    })
}
