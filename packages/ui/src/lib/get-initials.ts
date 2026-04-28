// Tiny helper used by every avatar in the platform — chat headers, profile
// dropdowns, dynamic-table avatar cells, sidebar nav, etc. Lived inline in
// each app for too long. Centralised here so a single fix propagates.

export interface GetInitialsOptions {
    /** Maximum number of initials to take. Defaults to 2. */
    max?: number
    /** Fallback when the input is empty / nullish. Defaults to '?'. */
    fallback?: string
}

/**
 * Returns the uppercase initials of a name. Splits on whitespace, takes the
 * first character of each token, caps at `max` (default 2). Trims the input
 * and returns `fallback` when the result would be empty.
 *
 *   getInitials('Alice Johnson')          // 'AJ'
 *   getInitials('  alice   johnson  ')    // 'AJ'
 *   getInitials('Maria del Carmen', { max: 3 })  // 'MDC'
 *   getInitials('')                       // '?'
 *   getInitials(undefined)                // '?'
 */
export function getInitials(
    name: string | null | undefined,
    options: GetInitialsOptions = {},
): string {
    const { max = 2, fallback = '?' } = options
    if (!name) return fallback
    const trimmed = name.trim()
    if (!trimmed) return fallback
    const initials = trimmed
        .split(/\s+/)
        .map((part) => part[0] ?? '')
        .filter(Boolean)
        .slice(0, max)
        .join('')
        .toUpperCase()
    return initials || fallback
}
