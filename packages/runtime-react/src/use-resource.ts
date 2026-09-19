/**
 * Tiny data-fetching hooks for federated addons.
 *
 * Addon-safe replacement for `@tanstack/react-query`: pulling tanstack into a
 * federated remote risks a duplicate query-client / version clash with the
 * host and bloats the MF bundle (see @asteby/metacore-runtime-react's
 * singleton react-query for HOST-side code, which does not apply inside a
 * federated addon bundle). These hooks cover exactly what an addon panel
 * needs — a polling GET resource and an imperative mutation — over any
 * fetch-like client.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface ResourceState<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  /**
   * True once `isLoading` has stayed on for `stuckAfterMs` without landing.
   * Whatever the exact timing race (an aborted fetch racing a remount, a
   * slow/hung request), a caller needs a way OUT — a spinner with no escape
   * hatch is a dead end. This never claims to know WHY the fetch is stuck;
   * it only tells the caller long enough has passed to offer a retry
   * instead of an indefinite loading state.
   */
  stuck: boolean;
}

const DEFAULT_STUCK_AFTER_MS = 8_000;

export function useResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown>,
  options?: {
    refetchInterval?: number;
    enabled?: boolean;
    /** Threshold in ms before `stuck` flips true. Default 8000. */
    stuckAfterMs?: number;
  },
): ResourceState<T> {
  const enabled = options?.enabled ?? true;
  const stuckAfterMs = options?.stuckAfterMs ?? DEFAULT_STUCK_AFTER_MS;
  const [data, setData] = useState<T | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const hasDataRef = useRef(false);
  const [tick, setTick] = useState(0);
  const [stuck, setStuck] = useState(false);

  const refetch = useCallback(() => {
    setStuck(false);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    // Stale-while-revalidate: once we have data, refetches/polls revalidate in
    // the background without flipping isLoading — the UI keeps showing the last
    // values instead of collapsing to a "loading" blank every poll.
    if (!hasDataRef.current) setIsLoading(true);
    setStuck(false);
    const stuckTimer = !hasDataRef.current
      ? setTimeout(() => {
          if (active) setStuck(true);
        }, stuckAfterMs)
      : undefined;
    fetcherRef
      .current(controller.signal)
      .then((res) => {
        if (!active) return;
        hasDataRef.current = true;
        setData(res);
        setError(null);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (!active) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        clearTimeout(stuckTimer);
        if (active && !controller.signal.aborted) {
          setIsLoading(false);
          setStuck(false);
        }
      });
    return () => {
      active = false;
      clearTimeout(stuckTimer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, stuckAfterMs, ...deps]);

  // Polling
  const interval = options?.refetchInterval;
  useEffect(() => {
    if (!enabled || !interval) return;
    const id = setInterval(() => setTick((t) => t + 1), interval);
    return () => clearInterval(id);
  }, [enabled, interval]);

  return { data, isLoading, error, refetch, stuck: stuck && isLoading };
}

export interface MutationState<TArgs, TResult> {
  mutateAsync: (args: TArgs) => Promise<TResult>;
  isPending: boolean;
  error: Error | null;
}

export function useMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
): MutationState<TArgs, TResult> {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const mutateAsync = useCallback(async (args: TArgs) => {
    setIsPending(true);
    setError(null);
    try {
      return await fnRef.current(args);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      throw err;
    } finally {
      setIsPending(false);
    }
  }, []);

  return { mutateAsync, isPending, error };
}
