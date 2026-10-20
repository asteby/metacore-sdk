/**
 * Cache coherence on the client.
 *
 * The backend (metacore-kernel `cachecoherence`) keeps ONE epoch that moves
 * every time something the UI is derived from changes: an addon is installed,
 * upgraded, enabled, disabled or uninstalled, or the server restarts. It
 * tells the browser in two ways:
 *
 *   - `X-Cache-Epoch` on every API response (a token for the caller's org);
 *   - a `CACHE_EPOCH_CHANGED` WebSocket frame, instantly, without a request.
 *
 * A tab that was open while that happened still holds the previous world —
 * translations, manifests, navigation, permissions, metadata, option lists.
 * This module is where that is noticed, once, for everyone:
 *
 *   observeCacheEpoch(token)   report a token seen (first one = baseline)
 *   onCacheEpochChange(fn)     react when it moves
 *   wireCacheEpochPush(ws)     feed it from the WebSocket frame
 *   attachCacheEpoch(axios)    feed it from every response + retry stale state
 *
 * The state lives on `globalThis`, and a small window-event protocol lets
 * packages that do not depend on the SDK core (marketplace, i18n, ...) report
 * and receive without importing it:
 *
 *   window "metacore:cache-epoch-observed"  { detail: { epoch } }   (report)
 *   window "metacore:cache-epoch-changed"   { detail: { epoch, previous, source } }
 */

export const CACHE_EPOCH_HEADER = "x-cache-epoch";
/** WebSocket frame type the backend publishes on every cache bump. */
export const CACHE_EPOCH_WS_TYPE = "CACHE_EPOCH_CHANGED" as const;
/** window event: a package saw a token (the core compares it). */
export const CACHE_EPOCH_OBSERVED_EVENT = "metacore:cache-epoch-observed";
/** window event: the epoch moved (everything derived from it is stale). */
export const CACHE_EPOCH_CHANGED_EVENT = "metacore:cache-epoch-changed";

export type CacheEpochSource = "header" | "push" | "event";

export interface CacheEpochChange {
  epoch: string;
  previous: string | null;
  source: CacheEpochSource;
}

type Listener = (change: CacheEpochChange) => void;

interface State {
  current: string | null;
  listeners: Set<Listener>;
  busWired: boolean;
}

const STATE_KEY = Symbol.for("metacore.cache-epoch");

function state(): State {
  const g = globalThis as unknown as Record<symbol, State | undefined>;
  let s = g[STATE_KEY];
  if (!s) {
    s = { current: null, listeners: new Set(), busWired: false };
    g[STATE_KEY] = s;
  }
  if (!s.busWired) {
    s.busWired = true;
    // Packages that only know the window protocol report through this.
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener(CACHE_EPOCH_OBSERVED_EVENT, (e) => {
        const epoch = (e as CustomEvent<{ epoch?: unknown }>).detail?.epoch;
        observeCacheEpoch(epoch, "event");
      });
    }
  }
  return s;
}

/** The last token seen, or null before the first API answer. */
export function currentCacheEpoch(): string | null {
  return state().current;
}

function emit(change: CacheEpochChange): void {
  for (const l of [...state().listeners]) {
    try {
      l(change);
    } catch {
      /* a misbehaving listener must not block the others */
    }
  }
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    try {
      window.dispatchEvent(new CustomEvent(CACHE_EPOCH_CHANGED_EVENT, { detail: change }));
    } catch {
      /* non-DOM environment */
    }
  }
}

/**
 * Report a token. The first one is the baseline and fires nothing; a different
 * one afterwards fires every listener (and the window event). Empty or
 * non-string values are ignored: a proxy that strips the header must not look
 * like a change. Returns true when it fired.
 */
export function observeCacheEpoch(token: unknown, source: CacheEpochSource = "header"): boolean {
  if (typeof token !== "string") return false;
  const next = token.trim();
  if (!next) return false;
  const s = state();
  if (s.current === null) {
    s.current = next;
    return false;
  }
  if (next === s.current) return false;
  const previous = s.current;
  s.current = next;
  emit({ epoch: next, previous, source });
  return true;
}

/**
 * Forget the held token: the next one seen becomes the baseline and fires
 * nothing. Use after a push already caused the refresh, so the header that
 * follows does not cause a second one.
 */
export function rebaselineCacheEpoch(): void {
  state().current = null;
}

/** Subscribe to epoch changes. Returns the unsubscribe fn. */
export function onCacheEpochChange(listener: Listener): () => void {
  const s = state();
  s.listeners.add(listener);
  return () => {
    s.listeners.delete(listener);
  };
}

/** Test seam. */
export function resetCacheEpochForTests(): void {
  const s = state();
  s.current = null;
  s.listeners.clear();
}

/** Reads the token out of a fetch `Headers`, an axios headers bag or a plain object. */
export function epochFromHeaders(headers: unknown): string | undefined {
  if (!headers || typeof headers !== "object") return undefined;
  const h = headers as { get?: (k: string) => unknown } & Record<string, unknown>;
  if (typeof h.get === "function") {
    const v = h.get(CACHE_EPOCH_HEADER);
    if (typeof v === "string") return v;
  }
  const v = h[CACHE_EPOCH_HEADER] ?? h["X-Cache-Epoch"];
  return typeof v === "string" ? v : undefined;
}

/** Structural WebSocket client (same shape as `ManifestHotSwapClient`). */
export interface CacheEpochPushClient {
  subscribe: (type: string, handler: (message: { type?: string; payload?: unknown }) => void) => () => void;
}

/**
 * Feed the epoch from the `CACHE_EPOCH_CHANGED` WebSocket frame. The frame is a
 * direct "refresh now" signal: its token describes the bump's own scope, not
 * the per-org view the header carries, so it is NOT compared with the header
 * token. Listeners fire with `source: "push"` and the next header becomes the
 * new baseline (no double refresh). Returns the unsubscribe fn; accepts
 * undefined so call sites need not branch.
 */
export function wireCacheEpochPush(client: CacheEpochPushClient | undefined | null): () => void {
  if (!client) return () => {};
  return client.subscribe(CACHE_EPOCH_WS_TYPE, (message) => {
    const epoch = (message?.payload as { epoch?: unknown } | undefined)?.epoch;
    const s = state();
    const previous = s.current;
    rebaselineCacheEpoch();
    emit({
      epoch: typeof epoch === "string" && epoch ? epoch : "push",
      previous,
      source: "push",
    });
  });
}

// ---------------------------------------------------------------------------
// Stale server state
// ---------------------------------------------------------------------------

const STALE_PATTERNS = [
  /cached plan must not change result type/i,
  /SQLSTATE\s*0A000/i,
  /prepared statement\s+"?[^"\s]*"?\s+does not exist/i,
  /SQLSTATE\s*26000/i,
  /stale[_ -]?(?:plan|state|epoch)/i,
];

function collectText(err: unknown, out: string[], depth = 0): void {
  if (err == null || depth > 4) return;
  if (typeof err === "string") {
    out.push(err);
    return;
  }
  if (typeof err !== "object") return;
  const o = err as Record<string, unknown>;
  for (const k of ["message", "error", "code", "detail", "details", "text", "body"]) {
    const v = o[k];
    if (typeof v === "string") out.push(v);
    else if (v && typeof v === "object") collectText(v, out, depth + 1);
  }
  if (o.response) collectText(o.response, out, depth + 1);
  if (o.data) collectText(o.data, out, depth + 1);
}

/**
 * True when an error says the SERVER's cached state was out of date (a prepared
 * plan outdated by a migration, SQLSTATE 0A000 / 26000, or an explicit
 * stale-state code). Understands thrown Errors, axios errors
 * (`response.data.error.message`), `MarketplaceError` and plain strings.
 *
 * Those failures happen before the statement ran and the server already
 * dropped the stale state, which is why a single retry is safe and enough.
 */
export function isStaleStateError(err: unknown): boolean {
  const texts: string[] = [];
  collectText(err, texts);
  return texts.some((t) => STALE_PATTERNS.some((re) => re.test(t)));
}

export interface StaleRetryOptions {
  /** Pause before the retry, ms (lets the server finish dropping its state). Default 200. */
  delayMs?: number;
  /** Called when a retry is about to run. */
  onRetry?: (err: unknown) => void;
}

/** Runs `fn`; if it fails with a stale-state error, waits briefly and runs it ONCE more. */
export async function withStaleRetry<T>(fn: () => Promise<T>, options: StaleRetryOptions = {}): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isStaleStateError(err)) throw err;
    options.onRetry?.(err);
    await new Promise((r) => setTimeout(r, options.delayMs ?? 200));
    return fn();
  }
}

/** Minimal axios-like surface `attachCacheEpoch` needs. */
export interface AxiosLikeForEpoch {
  interceptors: {
    response: {
      use: (
        onFulfilled: (res: any) => any,
        onRejected: (err: any) => any,
      ) => number;
      eject?: (id: number) => void;
    };
  };
  request: (config: any) => Promise<any>;
}

/** Marker on a request config that already had its one stale-state retry. */
export const STALE_RETRIED_FLAG = "__metacoreStaleRetried";

/**
 * Wire an axios-like client: every response reports its `X-Cache-Epoch`
 * (success or error), and a request that failed with a stale-state error is
 * re-sent ONCE (`config.__metacoreStaleRetried`). Returns the eject function.
 */
export function attachCacheEpoch(client: AxiosLikeForEpoch, options: StaleRetryOptions = {}): () => void {
  const id = client.interceptors.response.use(
    (res) => {
      observeCacheEpoch(epochFromHeaders(res?.headers));
      return res;
    },
    async (err) => {
      observeCacheEpoch(epochFromHeaders(err?.response?.headers));
      const config = err?.config as Record<string, unknown> | undefined;
      if (config && !config[STALE_RETRIED_FLAG] && isStaleStateError(err)) {
        config[STALE_RETRIED_FLAG] = true;
        options.onRetry?.(err);
        await new Promise((r) => setTimeout(r, options.delayMs ?? 200));
        return client.request(config);
      }
      return Promise.reject(err);
    },
  );
  return () => client.interceptors.response.eject?.(id);
}
