/**
 * Host surface a federated page or panel talks to. The host (ops, starter-core)
 * implements these interfaces and hands them to the remote through
 * runtime-react's `<AddonPageHost>`; the remote only ever sees these shapes.
 *
 * Security contract: the remote never receives the operator's credentials.
 * {@link HostApi} is a client the HOST built on top of its own authenticated
 * transport; it returns response bodies only (no headers, no request config)
 * and errors as {@link HostApiError} (status + server message, nothing else),
 * so neither a success nor a failure can leak an `Authorization` header.
 * Remotes must not read `localStorage` for tokens.
 */

/** Query string values accepted by {@link HostApi}. */
export type HostApiParams = Record<
  string,
  string | number | boolean | null | undefined | ReadonlyArray<string | number>
>;

export interface HostApiRequestOptions {
  /** Query string, serialized by the host client. */
  params?: HostApiParams;
  /** Abort the request (unmount, superseded search…). */
  signal?: AbortSignal;
}

/**
 * Result of one batched read ({@link HostApi.q}): the envelope the kernel
 * returns for a list, record or metadata read, resolved on its own even when
 * other reads of the same batch fail.
 */
export interface HostQueryPart<T = unknown> {
  success: boolean;
  data?: T;
  meta?: unknown;
  message?: string;
}

/**
 * Authenticated API client provided by the host. Paths are relative to the
 * host API root (`/data/Shipment`, `/q`, an addon's own `contributions.api[]`
 * route…); the host adds auth, branch, locale and retries.
 */
export interface HostApi {
  get<T = unknown>(path: string, opts?: HostApiRequestOptions): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, opts?: HostApiRequestOptions): Promise<T>;
  put<T = unknown>(path: string, body?: unknown, opts?: HostApiRequestOptions): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown, opts?: HostApiRequestOptions): Promise<T>;
  delete<T = unknown>(path: string, opts?: HostApiRequestOptions): Promise<T>;
  /**
   * Batched read through `POST /q`: list, record and metadata reads
   * (`/data/Shipment`, `/data/Shipment/42`, `/metadata/table/Shipment`)
   * issued in the same tick share one request; each resolves on its own.
   * Paths the batch does not understand fall back to a plain GET.
   */
  q<T = unknown>(path: string, opts?: Pick<HostApiRequestOptions, "params">): Promise<HostQueryPart<T>>;
  /**
   * Run a capability query (e.g. `commerce.shipping.track`) with the viewer's
   * permissions. The host resolves the provider and caches briefly; the
   * remote never talks to the provider addon directly.
   */
  capability<T = unknown>(key: string, input: Record<string, unknown>): Promise<T>;
}

/** Error surfaced by {@link HostApi}: status and server message only. */
export class HostApiError extends Error {
  readonly status: number;
  readonly code?: string;
  /** Server error body (JSON) when there is one; never request config. */
  readonly data?: unknown;
  constructor(message: string, status: number, opts: { code?: string; data?: unknown } = {}) {
    super(message);
    this.name = "HostApiError";
    this.status = status;
    this.code = opts.code;
    this.data = opts.data;
  }
}

/** Organization the operator is working in, as the host exposes it. */
export interface HostOrg {
  id: string;
  name?: string;
  /** ISO 4217. */
  currency?: string;
  /** IANA time zone (`America/Mexico_City`). */
  timezone?: string;
  /** Local name of the sales tax (`IVA`, `VAT`, `Sales tax`). */
  taxLabel?: string;
}

/** Operator as the host wants the remote to see them (no credentials). */
export interface HostUser {
  id: string;
  name: string;
  role?: string;
  [key: string]: unknown;
}

/** Branch / location currently selected in the host. */
export interface HostBranch {
  id: string;
  name?: string;
}

/** One breadcrumb of the host header. `url` is a host URL (absolute path). */
export interface Breadcrumb {
  /** Already-translated label, or an i18n key the host resolves. */
  title: string;
  url?: string;
}

/** A button the page asks the host to render in its page header. */
export interface PageHeaderAction {
  key: string;
  label: string;
  /** Lucide icon name. */
  icon?: string;
  variant?: "default" | "secondary" | "outline" | "destructive" | "ghost";
  disabled?: boolean;
  onSelect: () => void;
}

/** What a page can ask of the host chrome (header, focus mode). */
export interface PageChrome {
  /** Page title shown in the host header and `document.title`. */
  title?: string;
  /** Short line under the title. */
  subtitle?: string;
  /** Header buttons, rendered by the host with its own design system. */
  actions?: PageHeaderAction[];
  /**
   * Focus mode: the host collapses its sidebar to give the page the content
   * area (an embedded map, a planner). The page stays inside the shell.
   */
  focus?: boolean;
}
