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

export interface SupportCase {
  folio: string;
  subject: string;
  status: SupportCaseStatus;
  severity?: string;
  /** Texto de la solucion cuando `status` es `resolved`. */
  solution?: string;
  opened_at?: string;
  messages: SupportMessage[];
}

export interface SupportCaseSummary {
  folio: string;
  subject: string;
  status: SupportCaseStatus;
  updated_at?: string;
}

export interface CreateSupportCaseInput {
  subject: string;
  description: string;
  severity?: "blocker" | "high" | "normal" | "low";
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
  body?: unknown;
  signal?: AbortSignal;
}

/** Lo implementa el host con su cliente HTTP autenticado. Debe rechazar si la respuesta no es 2xx. */
export type SupportTransport = <T>(req: SupportRequest) => Promise<T>;

/** Suscripcion al flujo de eventos de un caso; devuelve la funcion para cancelar. */
export type SupportEventSource = (folio: string, onEvent: (ev: SupportCallbackEvent) => void) => () => void;

export interface SupportApiOptions {
  /** Prefijo de las rutas. Defecto `/api/support`. */
  basePath?: string;
  /** Tiempo real (SSE/WS del host). Sin el, `subscribe` es un no-op. */
  events?: SupportEventSource;
}

export interface SupportApi {
  listCases(signal?: AbortSignal): Promise<SupportCaseSummary[]>;
  createCase(input: CreateSupportCaseInput): Promise<SupportCase>;
  getCase(folio: string, signal?: AbortSignal): Promise<SupportCase>;
  sendMessage(folio: string, input: SendSupportMessageInput): Promise<SupportMessage>;
  subscribe(folio: string, onEvent: (ev: SupportCallbackEvent) => void): () => void;
}

export function createSupportApi(transport: SupportTransport, opts: SupportApiOptions = {}): SupportApi {
  const base = (opts.basePath ?? "/api/support").replace(/\/+$/, "");
  const caseUrl = (folio: string) => `${base}/cases/${encodeURIComponent(folio)}`;
  return {
    listCases: (signal) => transport<SupportCaseSummary[]>({ method: "GET", path: `${base}/cases`, signal }),
    createCase: (input) => transport<SupportCase>({ method: "POST", path: `${base}/cases`, body: input }),
    getCase: (folio, signal) => transport<SupportCase>({ method: "GET", path: caseUrl(folio), signal }),
    sendMessage: (folio, input) =>
      transport<SupportMessage>({
        method: "POST",
        path: `${caseUrl(folio)}/messages`,
        body: { client_message_id: input.clientMessageId, body: input.body, attachments: input.attachments },
      }),
    subscribe: (folio, onEvent) => (opts.events ? opts.events(folio, onEvent) : () => {}),
  };
}
