/**
 * Soporte unificado: tipos del contrato (generados de los fixtures, ver
 * `scripts/gen-support-types.mjs`), vista del caso para la UI y cliente
 * `createSupportApi` desacoplado del transporte.
 *
 * Nada de URLs ni de auth aqui: el host inyecta un `SupportTransport` (su fetch con
 * sesion) y, si quiere tiempo real, un `SupportEventSource`.
 */
import type { SupportAttachment, SupportCallbackEvent, SupportCaseView, SupportMessageView } from "./generated/support-contract.js";

export * from "./generated/support-contract.js";
export * from "./support-embed.js";

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

/**
 * Mensaje del hilo. Sale de `MessageView` del contrato (generado): solo se angosta el
 * `author_type` (el contrato tolera valores nuevos, la UI pinta los conocidos) y se anade el
 * estado de envio, que es de cliente.
 */
export type SupportMessage = Omit<SupportMessageView, "author_type" | "attachments"> & {
  author_type: SupportAuthorType;
  attachments?: SupportAttachmentView[];
  /** Solo en cliente: estado de envio de un mensaje optimista. */
  state?: "sending" | "failed";
};

/** Si el Hub ya recibio el caso: en el outbox, aceptado o rechazado. */
export type SupportHubState = "pending" | "synced" | "failed";

/**
 * Caso con sus ultimos mensajes (50 por defecto, 200 maximo, cronologicos). Sale de `CaseView`
 * del contrato (generado): `case_id` y `channel` (id publico) solo vienen del Hub; `hub_state`
 * solo de una instancia. `messages_older_cursor` es el cursor `before` de `listMessages`.
 */
export type SupportCase = Omit<SupportCaseView, "status" | "severity" | "hub_state" | "messages"> & {
  status: SupportCaseStatus;
  severity?: string;
  hub_state?: SupportHubState;
  messages: SupportMessage[];
};

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

/** Resultado de proyectar un evento sobre un hilo (espejo de `contract.ProjectEvent` del kernel). */
export interface SupportEventProjection {
  /** Mensaje que agrega el evento; ausente si no agrega ninguno. */
  message?: SupportMessage;
  /** Estado del caso que implica; ausente si lo deja igual. */
  status?: SupportCaseStatus;
  /** Falso para un evento que el contrato no describe (el receptor debe ignorarlo y aceptarlo). */
  known: boolean;
}

/**
 * Proyecta un evento del callback sobre el hilo con la misma semantica que `ProjectEvent` del
 * kernel (support/contract/channels.go): ids, autores y estado implicado no se reinventan aqui.
 */
export function projectSupportEvent(ev: SupportCallbackEvent): SupportEventProjection {
  const id = ev.message_id || ev.delivery_id;
  const created_at = ev.timestamp ? new Date(ev.timestamp * 1000).toISOString() : new Date().toISOString();
  const make = (author_type: SupportAuthorType, body: string): SupportMessage | undefined =>
    !body && !ev.attachments?.length
      ? undefined
      : {
          id,
          author_type,
          author_name: ev.author_name,
          body,
          created_at,
          attachments: ev.attachments?.map((a, i) => ({ ...a, id: `${id}:${i}` })),
        };
  switch (ev.event) {
    case "desk_message":
      return { known: true, message: make("agent", ev.body ?? "") };
    case "issue_commented":
      return { known: true, message: make("agent", ev.body || ev.comment) };
    case "ai_action":
      return { known: true, message: make("ai", ev.body ?? "") };
    case "desk_resolved":
      return { known: true, status: "resolved", message: make("system", ev.solution || ev.body || "") };
    case "issue_closed":
      return { known: true, status: "closed", message: make("system", ev.solution || ev.comment) };
    case "desk_reopened":
      return { known: true, status: "open", message: make("system", ev.body ?? "") };
    case "visitor_erased":
      return { known: true };
    default:
      return { known: false };
  }
}

/**
 * Aplica un evento del callback (`desk_message`, `ai_action`, `desk_resolved`...) a un caso.
 * Es puro e idempotente por `message_id`/`delivery_id`; los eventos desconocidos se ignoran
 * (el contrato exige tolerarlos). La semantica es la de `projectSupportEvent`.
 */
export function applySupportEvent(current: SupportCase, ev: SupportCallbackEvent): SupportCase {
  if (ev.ticket_folio !== current.folio) return current;
  const { message, status } = projectSupportEvent(ev);
  let next = current;
  if (message && !current.messages.some((m) => m.id === message.id)) next = { ...next, messages: [...next.messages, message] };
  if (status) next = { ...next, status, solution: ev.solution || next.solution };
  return next;
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
  | "already_resolved"
  | "origin_not_allowed"
  | "channel_inactive"
  | "session_expired"
  | "identity_invalid"
  | "captcha_required"
  | "channel_quota_exceeded"
  | "channel_ai_cap_reached"
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
