/**
 * Soporte unificado: tipos del contrato (generados de los fixtures, ver
 * `scripts/gen-support-types.mjs`), vista del caso para la UI y cliente
 * `createSupportApi` desacoplado del transporte.
 *
 * Nada de URLs ni de auth aqui: el host inyecta un `SupportTransport` (su fetch con
 * sesion) y, si quiere tiempo real, un `SupportEventSource`.
 */
import type { SupportAttachment, SupportCallbackEvent } from "./generated/support-contract.js";

export * from "./generated/support-contract.js";

// ---------------------------------------------------------------------------
// Vista del caso (API de OPS `/api/support/cases`). No forma parte del contrato
// Hub<->instancia, por eso no sale de los fixtures.
// ---------------------------------------------------------------------------

/** Quien escribio. `reporter` es la persona de la instancia; `ai` es Aby. */
export type SupportAuthorType = "reporter" | "agent" | "ai" | "system";

export type SupportCaseStatus = "open" | "resolved" | "closed";

/** Adjunto tal como lo pinta la UI: el del contrato mas su caducidad. */
export interface SupportAttachmentView extends Partial<SupportAttachment> {
  /** Estable dentro del mensaje; si falta se usa el indice. */
  id?: string;
  name: string;
  /** Fin de vida de la URL firmada (RFC 3339). */
  expires_at?: string;
  /** El servidor ya sabe que caduco (tiene prioridad sobre `expires_at`). */
  expired?: boolean;
}

export interface SupportMessage {
  id: string;
  author_type: SupportAuthorType;
  author_name?: string;
  body: string;
  /** RFC 3339. */
  created_at: string;
  attachments?: SupportAttachmentView[];
  /** Solo en cliente: estado de envio de un mensaje optimista. */
  state?: "sending" | "failed";
}

/** Si el Hub ya recibio el caso: en el outbox, aceptado o rechazado. */
export type SupportHubState = "pending" | "synced" | "failed";

export interface SupportCase {
  folio: string;
  subject: string;
  description?: string;
  status: SupportCaseStatus;
  severity?: string;
  hub_state?: SupportHubState;
  /** Texto de la solucion cuando `status` es `resolved`. */
  solution?: string;
  opened_at?: string;
  updated_at?: string;
  resolved_at?: string;
  /** Los ultimos mensajes (50 por defecto, 200 maximo), en orden cronologico. */
  messages: SupportMessage[];
  /** Cursor `before` para pedir los mensajes anteriores (`listMessages`). Ausente si no hay mas. */
  messages_older_cursor?: string;
}

export interface SupportCaseSummary {
  folio: string;
  subject: string;
  status: SupportCaseStatus;
  severity?: string;
  hub_state?: SupportHubState;
  updated_at?: string;
}

export type SupportSeverity = "blocker" | "high" | "normal" | "low";

export interface CreateSupportCaseInput {
  subject: string;
  description: string;
  severity?: SupportSeverity;
  /** Canal de origen (`aby`, `addon_soporte`, `api`). */
  channel?: string;
  attachments?: SupportAttachmentView[];
}

export interface SendSupportMessageInput {
  /** Clave de idempotencia (`client_message_id` del contrato). */
  clientMessageId: string;
  body: string;
  attachments?: SupportAttachmentView[];
}

/** Un adjunto esta caducado si el servidor lo marca o si `expires_at` ya paso. */
export function isAttachmentExpired(a: Pick<SupportAttachmentView, "expired" | "expires_at">, now: number = Date.now()): boolean {
  if (a.expired) return true;
  if (!a.expires_at) return false;
  const t = Date.parse(a.expires_at);
  return Number.isFinite(t) && t <= now;
}

/**
 * Aplica un evento del callback (`desk_message`, `ai_action`, `desk_resolved`...) a un caso.
 * Es puro e idempotente por `message_id`/`delivery_id`; los eventos desconocidos se ignoran
 * (el contrato exige tolerarlos).
 */
export function applySupportEvent(current: SupportCase, ev: SupportCallbackEvent): SupportCase {
  if (ev.ticket_folio !== current.folio) return current;
  const at = ev.timestamp ? new Date(ev.timestamp * 1000).toISOString() : new Date().toISOString();
  const push = (author_type: SupportAuthorType, body: string): SupportCase => {
    const id = ev.message_id || ev.delivery_id;
    if (!body && !ev.attachments?.length) return current;
    if (current.messages.some((m) => m.id === id)) return current;
    const message: SupportMessage = {
      id,
      author_type,
      author_name: ev.author_name,
      body,
      created_at: at,
      attachments: ev.attachments?.map((a, i) => ({ ...a, id: `${id}:${i}` })),
    };
    return { ...current, messages: [...current.messages, message] };
  };
  switch (ev.event) {
    case "desk_message":
      return push("agent", ev.body ?? "");
    case "issue_commented":
      return push("agent", ev.comment);
    case "ai_action":
      return push("ai", ev.body ?? "");
    case "desk_resolved":
      return { ...current, status: "resolved", solution: ev.solution || current.solution };
    case "issue_closed":
      return { ...current, status: "closed", solution: ev.solution || current.solution };
    case "desk_reopened":
      return { ...current, status: "open" };
    default:
      return current;
  }
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export interface SupportRequest {
  method: "GET" | "POST";
  /** Ruta relativa a la base del host, p. ej. `/api/support/cases/OPS-1`. */
  path: string;
  /** Parametros de query; los `undefined` se omiten. */
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

/** Respuesta del transporte. `headers` es el `Headers` de fetch (hace falta `X-Next-Cursor`). */
export interface SupportResponse<T> {
  data: T;
  headers?: { get(name: string): string | null };
}

/** Lo implementa el host con su cliente HTTP autenticado. Debe rechazar si la respuesta no es 2xx. */
export type SupportTransport = <T>(req: SupportRequest) => Promise<SupportResponse<T>>;

/** Suscripcion al flujo de eventos de un caso; devuelve la funcion para cancelar. */
export type SupportEventSource = (folio: string, onEvent: (ev: SupportCallbackEvent) => void) => () => void;

/** Pagina keyset: `nextCursor` es el que se pasa en la siguiente peticion; ausente en la ultima. */
export interface SupportPage<T> {
  items: T[];
  nextCursor?: string;
}

/** Codigos de `{ error: { code, message } }` que devuelve la API de casos. */
export type SupportErrorCode =
  | "support_disabled"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "invalid_request"
  | "subject_required"
  | "body_required"
  | "body_too_long"
  | "too_many_attachments"
  | "invalid_attachment"
  | "case_resolved"
  | "case_closed"
  | "case_not_resolved"
  | "internal";

/**
 * Saca el codigo de error de lo que rechace el transporte del host: acepta el cuerpo
 * `{error:{code}}` directo, o colgado de `body`, `data` o `response` (axios/ky/fetch).
 */
export function supportErrorCode(err: unknown): SupportErrorCode | (string & {}) | undefined {
  const seen = (v: unknown, depth = 0): string | undefined => {
    if (!v || typeof v !== "object" || depth > 3) return undefined;
    const o = v as Record<string, unknown>;
    const e = o.error;
    if (e && typeof e === "object" && typeof (e as { code?: unknown }).code === "string") return (e as { code: string }).code;
    for (const k of ["body", "data", "response"]) {
      const r = seen(o[k], depth + 1);
      if (r) return r;
    }
    return typeof o.code === "string" ? o.code : undefined;
  };
  return seen(err);
}

export interface PageParams {
  limit?: number;
  signal?: AbortSignal;
}

export interface SupportApiOptions {
  /** Prefijo de las rutas. Defecto `/api/support`. */
  basePath?: string;
  /** Tiempo real (SSE/WS del host). Sin el, `subscribe` es un no-op. */
  events?: SupportEventSource;
}

export interface SupportApi {
  /** `GET /cases?status&limit&cursor`. El cursor siguiente viene en `X-Next-Cursor`. */
  listCases(params?: PageParams & { status?: SupportCaseStatus; cursor?: string }): Promise<SupportPage<SupportCaseSummary>>;
  createCase(input: CreateSupportCaseInput): Promise<SupportCase>;
  /** `GET /cases/:folio?limit&before`: el caso con sus ultimos mensajes. */
  getCase(folio: string, params?: PageParams & { before?: string }): Promise<SupportCase>;
  /** `GET /cases/:folio/messages?limit&before`: mensajes anteriores, en orden cronologico. */
  listMessages(folio: string, params?: PageParams & { before?: string }): Promise<SupportPage<SupportMessage>>;
  sendMessage(folio: string, input: SendSupportMessageInput): Promise<SupportMessage>;
  /** `POST /cases/:folio/reopen`. El cuerpo es opcional. */
  reopen(folio: string, input?: { body?: string; clientMessageId?: string }): Promise<SupportCase>;
  subscribe(folio: string, onEvent: (ev: SupportCallbackEvent) => void): () => void;
}

const CURSOR_HEADER = "X-Next-Cursor";

export function createSupportApi(transport: SupportTransport, opts: SupportApiOptions = {}): SupportApi {
  const base = (opts.basePath ?? "/api/support").replace(/\/+$/, "");
  const caseUrl = (folio: string) => `${base}/cases/${encodeURIComponent(folio)}`;
  const data = async <T>(req: SupportRequest) => (await transport<T>(req)).data;
  const page = async <T>(req: SupportRequest): Promise<SupportPage<T>> => {
    const res = await transport<T[]>(req);
    return { items: res.data ?? [], nextCursor: res.headers?.get(CURSOR_HEADER) || undefined };
  };
  return {
    listCases: ({ status, limit, cursor, signal } = {}) =>
      page<SupportCaseSummary>({ method: "GET", path: `${base}/cases`, query: { status, limit, cursor }, signal }),
    createCase: (input) => data<SupportCase>({ method: "POST", path: `${base}/cases`, body: input }),
    getCase: (folio, { limit, before, signal } = {}) =>
      data<SupportCase>({ method: "GET", path: caseUrl(folio), query: { limit, before }, signal }),
    listMessages: (folio, { limit, before, signal } = {}) =>
      page<SupportMessage>({ method: "GET", path: `${caseUrl(folio)}/messages`, query: { limit, before }, signal }),
    sendMessage: (folio, input) =>
      data<SupportMessage>({
        method: "POST",
        path: `${caseUrl(folio)}/messages`,
        body: { client_message_id: input.clientMessageId, body: input.body, attachments: input.attachments },
      }),
    reopen: (folio, input = {}) =>
      data<SupportCase>({
        method: "POST",
        path: `${caseUrl(folio)}/reopen`,
        body: { client_message_id: input.clientMessageId, body: input.body },
      }),
    subscribe: (folio, onEvent) => (opts.events ? opts.events(folio, onEvent) : () => {}),
  };
}
