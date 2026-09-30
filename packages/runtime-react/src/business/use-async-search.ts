import { useEffect, useState } from 'react'
import { useDebouncedValue } from '../use-debounced-value'

/** Búsqueda async con debounce y cancelación. `search` debe ser estable (useCallback). */
export function useAsyncSearch<T>(
    query: string,
    search: (q: string, signal: AbortSignal) => Promise<T[]>,
    opts: { minChars?: number; delay?: number } = {},
): { results: T[]; loading: boolean; error: boolean } {
    const { minChars = 2, delay = 250 } = opts
    const q = useDebouncedValue(query.trim(), delay)
    const [results, setResults] = useState<T[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(false)

    useEffect(() => {
        if (q.length < minChars) {
            setResults([])
            setLoading(false)
            setError(false)
            return
        }
        const ctrl = new AbortController()
        setLoading(true)
        setError(false)
        search(q, ctrl.signal)
            .then((rows) => {
                if (!ctrl.signal.aborted) setResults(rows)
            })
            .catch(() => {
                if (!ctrl.signal.aborted) {
                    setResults([])
                    setError(true)
                }
            })
            .finally(() => {
                if (!ctrl.signal.aborted) setLoading(false)
            })
        return () => ctrl.abort()
    }, [q, search, minChars])

    return { results, loading, error }
}
