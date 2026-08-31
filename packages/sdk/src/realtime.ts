/**
 * Realtime contract — what a host exposes so federated addons (POS, kiosk,
 * kitchen display, inbox…) react to data changes without polling and without
 * opening a socket of their own.
 *
 * The host owns ONE authenticated WebSocket and bridges the kernel's
 * canonical CRUD events into lean, org-scoped `DATA_EVENT` frames (see
 * ops `docs/REALTIME.md`). Addons never see row values over this channel —
 * only identity + which keys changed — so subscribing can't leak anything the
 * row API would have hidden. The typical reaction is "refetch what I show".
 *
 * Where it shows up:
 *   - `AddonAPI.realtime` — handed to `register(api)` (shell addons).
 *   - `host.realtime` on the {@link AddonHostContext} prop immersive route
 *     components receive (POS terminal, kiosk…).
 *   - `@asteby/metacore-websocket` ships `createRealtimeClient` (the wire
 *     protocol); `@asteby/metacore-runtime-react` ships `useRealtime` /
 *     `useRealtimeInvalidate` and the opt-in `realtime` prop of
 *     `DynamicTable` / `DynamicKanban`.
 */

/** CRUD action carried by a data event. `resync` is synthesised client-side
 *  when the server reports dropped frames: treat it as "refetch everything
 *  you show for this model". */
export type DataEventAction = "created" | "updated" | "deleted" | "resync";

/** One org-scoped, value-free data change (wire payload of `DATA_EVENT`). */
export interface DataEvent {
  /** Organization the change belongs to — always the subscriber's own org. */
  org_id: string;
  /** Owning addon key (`kernel` for core models). */
  addon: string;
  /** Model key as declared in the manifest (e.g. `SalesOrder`). */
  model: string;
  /** Physical table (e.g. `sales_orders`) when the host knows it. */
  table?: string;
  action: DataEventAction;
  /** Record id; empty for `resync`. */
  id: string;
  /** Stage machine transition, only when the stage column changed. */
  stage_from?: string;
  stage_to?: string;
  /** User who caused the change (empty for system actors). */
  actor_id?: string;
  /** RFC 3339 timestamp of the (last coalesced) change. */
  at: string;
  /** Keys whose value changed (updates only). Never the values themselves. */
  fields?: string[];
  /** Extra events merged into this frame inside the coalescing window. */
  coalesced?: number;
}

export type RealtimeStatus = "connecting" | "open" | "closed";

export interface RealtimeSubscribeOptions {
  /**
   * Models to listen to — model keys (`SalesOrder`), table names
   * (`sales_orders`) or qualified `addon.Model`. Matching is case-insensitive.
   * `"*"` subscribes to every model of the org (use sparingly).
   * Omitted / empty → the handler only sees `resync` notices.
   */
  models?: string[];
  /** Actions to deliver. Default: every action. `resync` is always delivered. */
  events?: DataEventAction[];
}

export type DataEventHandler = (event: DataEvent) => void;

/**
 * The realtime primitive a host injects. Implementations ref-count model
 * subscriptions (the server only forwards subscribed models), re-subscribe
 * after a reconnect and never throw from `subscribe`.
 */
export interface RealtimeAPI {
  /**
   * Start receiving data events. Returns the unsubscribe function — call it
   * on unmount. Safe to call before the socket is open: the subscription is
   * sent as soon as the connection is (re)established.
   */
  subscribe(opts: RealtimeSubscribeOptions, handler: DataEventHandler): () => void;
  /** Current connection status of the underlying transport. */
  status(): RealtimeStatus;
  /**
   * Observe status changes (optional). Returns an unsubscribe function.
   * Hosts backed by a socket they don't own may omit it.
   */
  onStatus?(listener: (status: RealtimeStatus) => void): () => void;
}

/**
 * Shape of the `host` prop the shell forwards to immersive addon routes
 * (`layout: "immersive"` — POS terminal, kiosk, kitchen display). Every field
 * is optional so hosts can grow it incrementally; addons must tolerate a
 * missing key. Hosts may extend it with their own fields.
 */
export interface AddonHostContext {
  /** Active branch / location, when the host models tenant branches. */
  branchId?: string | null;
  /** Authenticated operator as the host wants the addon to see them. */
  user?: { id: string; name: string; [key: string]: unknown } | null;
  /** Org currency (ISO 4217). */
  currencyCode?: string;
  /** Live data changes for the operator's org — see {@link RealtimeAPI}. */
  realtime?: RealtimeAPI;
  /**
   * Legacy raw frame subscription (`"<addon>.<model>.<action>"` or `"*"`).
   * Prefer `realtime` — it is filtered server-side and value-free.
   */
  subscribe?: (eventType: string, handler: (event: { type: string; payload: unknown }) => void) => () => void;
  [key: string]: unknown;
}

/** Wire message types of the realtime protocol (server → client). */
export const REALTIME_MESSAGE = {
  DataEvent: "DATA_EVENT",
  Subscribed: "DATA_SUBSCRIBED",
  Dropped: "DATA_EVENTS_DROPPED",
} as const;

/** Client → server verbs (shared with the chat subscription frames; the
 *  presence of `models` selects the realtime meaning). */
export const REALTIME_COMMAND = {
  Subscribe: "SUBSCRIBE",
  Unsubscribe: "UNSUBSCRIBE",
} as const;

/** Body of `GET /api/realtime/info` — discovery for the client. */
export interface RealtimeInfo {
  enabled: boolean;
  /** Absolute `/ws` URL derived from the request (proxy-aware). */
  ws_url: string;
  /** Channels the caller may join — today exactly `["org:<org_id>"]`. */
  channels: string[];
  protocol: number;
  coalesce_ms: number;
  max_events_per_sec: number;
  max_models_per_connection: number;
}

/** True when an event matches the subscription filter. `resync` always does. */
export function dataEventMatches(opts: RealtimeSubscribeOptions, event: DataEvent): boolean {
  if (event.action === "resync") {
    return !opts.models || opts.models.length === 0 || modelMatches(opts.models, event);
  }
  if (opts.events && opts.events.length > 0 && !opts.events.includes(event.action)) {
    return false;
  }
  if (!opts.models || opts.models.length === 0) return false;
  return modelMatches(opts.models, event);
}

function modelMatches(models: string[], event: DataEvent): boolean {
  const model = event.model.toLowerCase();
  const table = (event.table ?? "").toLowerCase();
  const qualified = `${event.addon}.${event.model}`.toLowerCase();
  for (const raw of models) {
    const m = raw.trim().toLowerCase();
    if (!m) continue;
    if (m === "*" || m === model || (table && m === table) || m === qualified) return true;
  }
  return false;
}
