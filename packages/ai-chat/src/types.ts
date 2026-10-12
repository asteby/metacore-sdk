import type { ReactNode } from 'react'

export interface ChatAttachment {
  url: string
  name: string
  mime_type: string
  size?: number
}

export interface ChatProposal {
  id: string
  title: string
  summary?: string
  status?: 'pending' | 'approved' | 'rejected'
  /** Preserved from the `action/model/payload` shape, when that was used. */
  action?: string
  model?: string
  payload?: unknown
}

/** Wire shape accepted for proposals: `title/summary` or `action/model/payload`. */
export interface RawProposal {
  id: string | number
  title?: string
  summary?: string
  action?: string
  model?: string
  payload?: unknown
  status?: 'pending' | 'approved' | 'rejected'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  attachments?: ChatAttachment[]
  proposals?: ChatProposal[]
  /** Arrived in this session (not history): revealed progressively. */
  fresh?: boolean
  /** The turn failed; `content` holds the user-facing reason. */
  error?: boolean
}

export interface SendMessageInput {
  message: string
  sessionId: string | null
  attachments?: ChatAttachment[]
  signal?: AbortSignal
}

export interface SendMessageResult {
  sessionId: string
  reply: string
  proposals?: ChatProposal[]
  attachments?: ChatAttachment[]
}

export interface ChatSessionSummary {
  id: string
  title: string
  last_message?: string
  updated_at?: string
}

/**
 * Transport the chat talks through. The host injects an implementation
 * (see `createHttpChatClient`), so the package never imports an app's API
 * layer, stores or routes.
 */
export interface ChatClient {
  send(input: SendMessageInput): Promise<SendMessageResult>
  listSessions?(): Promise<ChatSessionSummary[]>
  loadHistory?(sessionId: string): Promise<ChatMessage[]>
  decideProposal?(id: string, approve: boolean): Promise<void>
}

/** Minimal axios-like surface; any `{ get, post }` client fits. */
export interface HttpLike {
  get<T = any>(url: string, config?: any): Promise<{ data: T }>
  post<T = any>(url: string, body?: unknown, config?: any): Promise<{ data: T }>
}

export interface CopilotPermissions {
  /** Can the current user open the copilot at all. Default true. */
  canChat?: boolean
  /** Can the user approve/reject proposals. Default true. */
  canDecideProposals?: boolean
}

export interface CopilotBranding {
  /** Assistant display name. Default "Copiloto". */
  name?: string
  /** Mascot skin key (see `MASCOT_SKINS` in app-providers). */
  mascotSkin?: string
  /** Custom avatar node; replaces the mascot when provided. */
  avatar?: ReactNode
}

export interface CopilotLabels {
  placeholder: string
  send: string
  open: string
  close: string
  thinking: string
  denied: string
  approve: string
  reject: string
  newChat: string
  emptyTitle: string
  error: string
  retry: string
  offline: string
  demo: string
  decideError: string
  historyError: string
  sessions: string
  newSession: string
}

export const DEFAULT_LABELS: CopilotLabels = {
  placeholder: 'Escribe un mensaje…',
  send: 'Enviar',
  open: 'Abrir copiloto',
  close: 'Cerrar copiloto',
  thinking: 'Pensando…',
  denied: 'No tienes permiso para usar el copiloto.',
  approve: 'Aprobar',
  reject: 'Rechazar',
  newChat: 'Nueva conversación',
  emptyTitle: '¿En qué te ayudo?',
  error: 'No pude completar la solicitud. Intenta de nuevo.',
  retry: 'Reintentar',
  offline: 'Sin conexión. Podrás enviar mensajes cuando vuelva la red.',
  demo: 'Datos demostrativos',
  decideError: 'No se pudo registrar la decisión. Intenta de nuevo.',
  historyError: 'No se pudo cargar la conversación.',
  sessions: 'Conversaciones',
  newSession: 'Conversación actual',
}
