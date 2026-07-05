// Shared incremental-loading primitives for DynamicTable and DynamicKanban.
//   - `dedupeById` appends a page of rows to the accumulated set, dropping any
//     id already present (the server may re-paginate / overlap between a global
//     page and a scoped top-up).
//   - `useInfiniteScrollSentinel` wires an IntersectionObserver: attach
//     `rootRef` to the scroll container and `sentinelRef` to a sentinel at its
//     bottom; when the sentinel enters view (and it's enabled) `onLoadMore`
//     fires. Degrades to a no-op where IntersectionObserver is unavailable
//     (older/SSR/happy-dom) so callers still render.
import { useEffect, useRef } from 'react'

/**
 * Returns a NEW array = `existing` followed by every row in `incoming` whose
 * `id` is not already present. Stable on identity/order of `existing`. Pure.
 */
export function dedupeById<T extends { id?: any }>(
  existing: T[],
  incoming: T[],
): T[] {
  if (incoming.length === 0) return existing
  const seen = new Set(existing.map((r) => String(r?.id)))
  const additions: T[] = []
  for (const row of incoming) {
    const key = String(row?.id)
    if (seen.has(key)) continue
    seen.add(key)
    additions.push(row)
  }
  return additions.length === 0 ? existing : [...existing, ...additions]
}

export interface UseInfiniteScrollOptions {
  /** Fired when the sentinel scrolls into view and loading is enabled. */
  onLoadMore: () => void
  /** When true, the observer is inert (no more pages, or a load in flight). */
  disabled?: boolean
  /** Pixels of pre-fetch margin below the viewport. Default 200. */
  rootMargin?: number
}

export interface InfiniteScrollRefs<
  R extends HTMLElement = HTMLDivElement,
  S extends HTMLElement = HTMLDivElement,
> {
  rootRef: React.RefObject<R | null>
  sentinelRef: React.RefObject<S | null>
}

/**
 * IntersectionObserver-backed infinite scroll. Attach `rootRef` to the
 * scrollable container and `sentinelRef` to a small element at its bottom. The
 * latest `onLoadMore`/`disabled` are read through a ref so the observer isn't
 * torn down and rebuilt on every render.
 */
export function useInfiniteScrollSentinel<
  R extends HTMLElement = HTMLDivElement,
  S extends HTMLElement = HTMLDivElement,
>({
  onLoadMore,
  disabled = false,
  rootMargin = 200,
}: UseInfiniteScrollOptions): InfiniteScrollRefs<R, S> {
  const rootRef = useRef<R | null>(null)
  const sentinelRef = useRef<S | null>(null)
  const cb = useRef(onLoadMore)
  const disabledRef = useRef(disabled)
  const intersectingRef = useRef(false)
  cb.current = onLoadMore
  disabledRef.current = disabled

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (
      !sentinel ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          intersectingRef.current = entry.isIntersecting
          if (entry.isIntersecting && !disabledRef.current) {
            cb.current()
          }
        }
      },
      { root: rootRef.current ?? null, rootMargin: `0px 0px ${rootMargin}px 0px` },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
    // Re-create only when the margin changes; onLoadMore/disabled are read live.
  }, [rootMargin])

  // IntersectionObserver only fires on intersection CHANGES. If a loaded page
  // is too short to push the sentinel out of view (small screens, short
  // lanes), the sentinel stays intersecting and no further event ever comes —
  // the list stalls until the user jiggles the scroll. When a load finishes
  // (disabled flips back to false) and the sentinel is still in view, chain
  // the next page.
  useEffect(() => {
    if (!disabled && intersectingRef.current) cb.current()
  }, [disabled])

  return { rootRef, sentinelRef }
}
