import { useEffect, useState } from 'react'

/** Default delay for free-text search → server/URL (table, kanban, relation). */
export const SEARCH_DEBOUNCE_MS = 350

/**
 * Returns `value` delayed by `ms`. The input stays live; only the returned
 * value lags — use it for fetches and URL sync so typing does not thrash.
 */
export function useDebouncedValue<T>(value: T, ms: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}
