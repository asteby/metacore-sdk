/**
 * Transporte de la sesion de embed del soporte con canales (`docs/DISENO-CANALES-SOPORTE.md` §3.4 y §4).
 *
 * Corre dentro del iframe del Hub (mismo origen que la API): abre una sesion de corta vida, la
 * renueva al 80 % del TTL y firma cada peticion con ella. La sesion vive solo en la clausura de
 * este modulo: no se devuelve ni se pasa a callbacks, de modo que ni el sitio anfitrion ni el
 * resto del frame la ven. Nada esta fijado: la base, la ruta de sesiones, el almacen del token de
 * visitante y el `fetch` los inyecta el host.
 */
import type { SupportCallbackEvent, SupportPublicProfile } from "./generated/support-contract.js";
import type { SupportEventSource, SupportRequest, SupportResponse, SupportTransport } from "./support.js";

/** Cuerpo de `POST …/sessions` (§3.4). */
export interface EmbedSessionRequest {
  channel: string;
  parent_origin: string;
  visitor_token?: string;
  identity?: string;
  captcha?: string;
  locale?: string;
}

/** Respuesta `201` de `POST …/sessions`. `session` es el sobre `asteby1.…` (secreto). */
export interface EmbedSessionResponse {
  session: string;
  expires_at: string;
  visitor_token?: string;
  visitor?: { kind?: string; display_name?: string };
  profile?: SupportPublicProfile;
}

/** Lo que el frame puede saber de la sesion: nunca el token. */
export interface EmbedSessionInfo {
  /** Fin de vida de la sesion (ms desde epoch). */
  expiresAt: number;
  /** Cuando se renovara (ms desde epoch). */
  renewAt: number;
  identified: boolean;
  visitor?: EmbedSessionResponse["visitor"];
  profile?: SupportPublicProfile;
}

/** Almacen del token de visitante (el frame inyecta el de su `localStorage`; puede no existir). */
export interface VisitorTokenStore {
  get(): string | null | undefined;
  set(token: string): void;
  clear(): void;
}

export interface EmbedTransportOptions {
  /** Base de la API del Hub; vacio o ausente = mismo origen. Solo http(s). */
  baseUrl?: string;
  /** Id publico del canal (`sch_…`). */
  channel: string;
  /** Origen del padre, tal como lo reporta el navegador (`event.origin`). */
  parentOrigin: string;
  /** Ruta de `POST` de sesiones, relativa a `baseUrl` (p. ej. `/v1/support/embed/sessions`). */
  sessionPath: string;
  /** JWT de identidad firmado por la empresa; se lee al abrir o renovar sesion. */
  identity?: () => string | undefined | null;
  visitorToken?: VisitorTokenStore;
  locale?: string;
  /** Token del proveedor de captcha, si el canal lo exige (`captcha_required`). */
  captcha?: () => string | undefined | null;
  fetch?: typeof fetch;
  now?: () => number;
  /** Fraccion del TTL tras la que se renueva. Defecto 0.8. */
  renewAt?: number;
  /** Genera `client_message_id`. Defecto `crypto.randomUUID`. */
  newId?: () => string;
  onSession?: (info: EmbedSessionInfo) => void;
  /** Fallo de la renovacion programada (la proxima peticion reintenta). */
  onSessionError?: (err: EmbedHttpError) => void;
}

/** Error HTTP del embed. `body` tiene la forma `{error:{code}}` para que `supportErrorCode` lo lea. */
export class EmbedHttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    const code = readCode(body);
    super(message ?? (code ? `${code} (${status})` : `HTTP ${status}`));
    this.name = "EmbedHttpError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

function readCode(body: unknown): string | undefined {
  const e = body && typeof body === "object" ? (body as { error?: unknown }).error : undefined;
  return e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string" ? (e as { code: string }).code : undefined;
}

export interface EmbedTransport {
  /** Transporte para `createSupportApi(embed.transport, { basePath, events: embed.events(basePath) })`. */
  transport: SupportTransport;
  /** Abre la sesion (idempotente mientras sea vigente) y programa la renovacion. */
  start(): Promise<EmbedSessionInfo>;
  /** Cancela la renovacion y olvida la sesion. */
  stop(): void;
  /** `stop()` y borra el token de visitante. */
  logout(): void;
  /** Foto de la sesion actual sin el token, o `undefined`. */
  info(): EmbedSessionInfo | undefined;
  /**
   * Tiempo real: SSE leido con `fetch` en streaming (permite `Authorization`, que `EventSource` no).
   * `basePath` es el mismo que el de `createSupportApi`. Reconecta con retroceso exponencial.
   */
  events(basePath: string, opts?: { retryMs?: number; maxRetryMs?: number }): SupportEventSource;
}

const DEFAULT_RENEW = 0.8;

/** Solo http(s) absoluta o vacia (mismo origen). */
function cleanBase(base: string | undefined): string {
  if (!base) return "";
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    throw new Error("createEmbedTransport: baseUrl invalida");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("createEmbedTransport: baseUrl debe ser http(s)");
  return u.origin + u.pathname.replace(/\/+$/, "");
}

function buildUrl(base: string, path: string, query?: SupportRequest["query"]): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return `${base}${path}${s ? `?${s}` : ""}`;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Adapta la forma de `createSupportApi` (OPS) a la API del widget del Hub (§4.4). */
function adaptRequest(req: SupportRequest, newId: () => string, locale: string | undefined): unknown {
  if (req.method === "POST" && /\/cases$/.test(req.path)) {
    const b = (req.body ?? {}) as { subject?: string; description?: string };
    return { subject: b.subject || undefined, body: b.description ?? "", client_message_id: newId(), locale };
  }
  if (req.method === "POST" && /\/messages$/.test(req.path)) {
    const b = (req.body ?? {}) as { client_message_id?: string; body?: string };
    return { body: b.body ?? "", client_message_id: b.client_message_id };
  }
  return req.body;
}

export function createEmbedTransport(opts: EmbedTransportOptions): EmbedTransport {
  const base = cleanBase(opts.baseUrl);
  const doFetch: typeof fetch = (...a) => (opts.fetch ?? globalThis.fetch)(...a);
  const now = opts.now ?? Date.now;
  const frac = opts.renewAt && opts.renewAt > 0 && opts.renewAt < 1 ? opts.renewAt : DEFAULT_RENEW;
  const newId = opts.newId ?? (() => globalThis.crypto.randomUUID());

  // Secreto: solo existe en esta clausura.
  let token: string | undefined;
  let state: EmbedSessionInfo | undefined;
  let inflight: Promise<EmbedSessionInfo> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = () => {
    clearTimer();
    if (stopped || !state) return;
    timer = setTimeout(
      () => {
        open().catch((e) => opts.onSessionError?.(e instanceof EmbedHttpError ? e : new EmbedHttpError(0, undefined, String(e))));
      },
      Math.max(0, state.renewAt - now()),
    );
  };

  const open = (): Promise<EmbedSessionInfo> => {
    if (inflight) return inflight;
    inflight = (async () => {
      const body: EmbedSessionRequest = {
        channel: opts.channel,
        parent_origin: opts.parentOrigin,
        visitor_token: opts.visitorToken?.get() || undefined,
        identity: opts.identity?.() || undefined,
        captcha: opts.captcha?.() || undefined,
        locale: opts.locale,
      };
      const res = await doFetch(base + opts.sessionPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      const data = (await readBody(res)) as Partial<EmbedSessionResponse> | undefined;
      if (!res.ok) throw new EmbedHttpError(res.status, data);
      const exp = data?.expires_at ? Date.parse(data.expires_at) : NaN;
      if (!data || typeof data.session !== "string" || !data.session || !Number.isFinite(exp)) {
        throw new EmbedHttpError(502, undefined, "respuesta de sesion invalida");
      }
      const issued = now();
      token = data.session;
      if (data.visitor_token) {
        try {
          opts.visitorToken?.set(data.visitor_token);
        } catch {
          // Almacenamiento bloqueado (terceros): el visitante es efimero.
        }
      }
      state = {
        expiresAt: exp,
        renewAt: issued + Math.max(0, (exp - issued) * frac),
        identified: !!body.identity,
        visitor: data.visitor,
        profile: data.profile,
      };
      schedule();
      opts.onSession?.(state);
      return state;
    })().finally(() => {
      inflight = undefined;
    });
    return inflight;
  };

  const ensure = async (): Promise<string> => {
    stopped = false;
    if (!token || !state || now() >= state.renewAt) await open();
    return token as string;
  };

  const forget = () => {
    token = undefined;
    state = undefined;
  };

  const send = async <T>(req: SupportRequest, retried = false): Promise<SupportResponse<T>> => {
    const bearer = await ensure();
    const res = await doFetch(buildUrl(base, req.path, req.query), {
      method: req.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bearer}`,
        ...(req.method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: req.method === "POST" ? JSON.stringify(adaptRequest(req, newId, opts.locale) ?? {}) : undefined,
      signal: req.signal,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    const data = await readBody(res);
    if (!res.ok) {
      const code = readCode(data);
      if (res.status === 401 && code === "session_expired" && !retried) {
        forget();
        return send<T>(req, true);
      }
      // El Hub responde `already_resolved`; la UI del hilo conoce `case_resolved`.
      const body = code === "already_resolved" ? { error: { ...(data as { error: object }).error, code: "case_resolved" } } : data;
      throw new EmbedHttpError(res.status, body);
    }
    if (data === undefined && req.method === "POST" && /\/messages$/.test(req.path)) {
      // 202 sin cuerpo: se confirma con lo enviado.
      const b = (req.body ?? {}) as { client_message_id?: string; body?: string };
      return {
        data: { id: b.client_message_id ?? newId(), author_type: "reporter", body: b.body ?? "", created_at: new Date(now()).toISOString() } as T,
        headers: res.headers,
      };
    }
    return { data: data as T, headers: res.headers };
  };

  const events = (basePath: string, o: { retryMs?: number; maxRetryMs?: number } = {}): SupportEventSource => {
    const root = basePath.replace(/\/+$/, "");
    return (caseId, onEvent) => {
      const ctl = new AbortController();
      const first = o.retryMs ?? 1000;
      const max = o.maxRetryMs ?? 30000;
      let delay = first;
      void (async () => {
        while (!ctl.signal.aborted) {
          try {
            const bearer = await ensure();
            const res = await doFetch(buildUrl(base, `${root}/cases/${encodeURIComponent(caseId)}/events`), {
              headers: { Accept: "text/event-stream", Authorization: `Bearer ${bearer}` },
              signal: ctl.signal,
              credentials: "omit",
              cache: "no-store",
              referrerPolicy: "no-referrer",
            });
            if (res.status === 401) {
              forget();
            } else if (res.ok && res.body) {
              delay = first;
              await readSse(res.body, (data) => {
                try {
                  const ev = JSON.parse(data) as SupportCallbackEvent;
                  if (ev && typeof ev === "object" && typeof ev.event === "string") onEvent(ev);
                } catch {
                  // Linea corrupta: se ignora; el contrato exige tolerar lo desconocido.
                }
              });
            }
          } catch {
            if (ctl.signal.aborted) return;
          }
          if (ctl.signal.aborted) return;
          await new Promise((r) => setTimeout(r, delay));
          delay = Math.min(max, delay * 2);
        }
      })();
      return () => ctl.abort();
    };
  };

  return {
    transport: (req) => send(req),
    start: async () => {
      stopped = false;
      if (!state || now() >= state.renewAt) await open();
      return state as EmbedSessionInfo;
    },
    stop: () => {
      stopped = true;
      clearTimer();
      forget();
    },
    logout: () => {
      try {
        opts.visitorToken?.clear();
      } catch {
        // idem
      }
      stopped = true;
      clearTimer();
      forget();
    },
    info: () => state,
    events,
  };
}

/** Lector minimo de `text/event-stream`: entrega el `data:` de cada evento. */
async function readSse(stream: ReadableStream<Uint8Array>, onData: (data: string) => void): Promise<void> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) onData(data);
    }
  }
}
