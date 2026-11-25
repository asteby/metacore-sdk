// GENERADO por scripts/gen-support-types.mjs. No editar a mano.
// Fuente: fixtures del contrato (metacore-kernel: support/contract/testdata).
// Huella de los fixtures: sha256:f5cd6b3e7485921dfdfe0c24fc8be8408c7e7d8cc70578c1e71df1ab931d8eb8
// Fixtures usados: callback_ai_action, callback_desk_message, callback_desk_resolved, callback_issue_closed, callback_issue_commented, desk_case_opened, desk_case_opened_channel, desk_message, embed_session_claims, error_channel_inactive, error_contract_upgrade_required, error_not_linked, error_not_linked_v1, escalate_request_v1, escalate_request_v2, escalate_response_v1, escalate_response_v1_duplicate, escalate_response_v2_pending, link_ack_request, link_request, link_response_active, link_response_pending, message_request_v1, message_request_v2, message_response, public_profile, thread_case, thread_message, visitor_erased

export interface SupportAttachment {
  url: string
  name: string
  content_type?: string
  size: number
  mime_type?: string
}

export interface SupportAttachmentRef {
  ref: string
  name: string
  mime: string
  size: number
}

export interface SupportCaseRef {
  id: string
  folio: string
  channel: "desk" | (string & {})
}

export interface SupportChannelRef {
  id: string
  public_id: string
  name: string
  kind: "org" | (string & {})
}

export interface SupportDeskCase {
  instance_id: string
  instance_name: string
  company_name: string
  folio: string
  subject: string
  description: string
  priority: "high" | "normal" | (string & {})
  issue_url: string
  issue_number: number
  opened_at: string
  severity?: "high" | (string & {})
  instance_context?: SupportInstanceContext
  case_id?: string
  channel?: SupportChannelRef
  requester?: SupportRequester
}

export interface SupportDeskMessage {
  id: string
  author_type: "reporter" | (string & {})
  author_name: string
  body: string
  created_at: string
}

export interface SupportFallbackContact {
  email?: string
  url?: string
}

export interface SupportIncidentRef {
  kind: "sync_failed" | (string & {})
  message: string
  at: string
}

export interface SupportInstanceContext {
  instance_id: string
  name: string
  product: string
  version: string
  customer?: string
  license_status: string
  partner?: string
  severity?: "high" | (string & {})
  recent_incidents?: SupportIncidentRef[]
  plan?: string
  last_heartbeat?: string
}

export interface SupportLinkInfo {
  source: "auto" | "manual" | (string & {})
  state: "active" | "pending" | (string & {})
  enabled: boolean
  callback_url: string
}

export interface SupportLinkSummary {
  source: "auto" | (string & {})
  state: "pending" | (string & {})
}

export interface SupportMessageView {
  id: string
  author_type: "agent" | "reporter" | "system" | (string & {})
  author_name?: string
  body: string
  created_at: string
  attachments?: SupportAttachment[]
}

export interface SupportRequester {
  kind: "visitor" | (string & {})
  verified: boolean
  display_name: string
  user_ref: string
  email?: string
}

export interface SupportSource {
  channel: "aby" | (string & {})
  user_ref: string
  locale: string
}

export interface SupportTicket {
  folio: string
  subject: string
  description: string
  priority: "high" | (string & {})
}

export interface SupportTranscriptTurn {
  role: "agent" | "ai" | "user" | (string & {})
  text: string
  at?: string
}

export interface SupportEscalateRequest {
  ticket: SupportTicket
  summary: string
  transcript: SupportTranscriptTurn[]
  callback: {
    url: string
  }
  contract?: number
  severity?: "high" | (string & {})
  source?: SupportSource
  attachments?: SupportAttachmentRef[]
}

export interface SupportEscalateResponse {
  issue_url: string
  issue_number: number
  status: "open" | (string & {})
  duplicate?: boolean
  case?: SupportCaseRef
  link?: SupportLinkSummary
  callback_secret?: string
}

export interface SupportMessageRequest {
  ticket: {
    folio: string
  }
  author: {
    type: "reporter" | (string & {})
    name: string
  }
  body: string
  message_id?: string
  attachments: SupportAttachment[]
  client_message_id?: string
}

export interface SupportMessageResponse {
  status: "accepted" | (string & {})
  message_id: string
  duplicate: boolean
}

export interface SupportLinkRequest {
  contract: number
  callback: {
    url: string
  }
}

export interface SupportLinkResponse {
  link: SupportLinkInfo
  callback_secret?: string
}

export interface SupportLinkAckRequest {
  proof: string
}

export interface SupportCallbackEvent {
  event: "ai_action" | "desk_message" | "desk_resolved" | "issue_closed" | "issue_commented" | (string & {})
  ticket_folio: string
  issue_url: string
  issue_number: number
  comment: string
  solution: string
  body?: string
  author_name?: string
  action?: string
  delivery_id: string
  timestamp: number
  contract?: number
  message_id?: string
  attachments?: SupportAttachment[]
}

export interface SupportDeskIngestEvent {
  delivery_id: string
  event: "case_opened" | "message" | (string & {})
  timestamp: number
  contract?: number
  case: SupportDeskCase
  message?: SupportDeskMessage
}

export interface SupportErrorBody {
  error: {
    code: "channel_inactive" | "contract_upgrade_required" | "not_linked" | (string & {})
    message: string
    reason?: "autolink_off" | "owner" | (string & {})
    instance_id?: string
  }
}

export interface SupportCaseView {
  case_id?: string
  folio: string
  channel?: string
  subject: string
  description?: string
  status: "resolved" | (string & {})
  severity?: "normal" | (string & {})
  hub_state?: "synced" | (string & {})
  solution?: string
  opened_at?: string
  updated_at?: string
  resolved_at?: string
  messages: SupportMessageView[]
  messages_older_cursor?: string
}

export interface SupportEmbedSessionClaims {
  ch: string
  vis: string
  ori: string
  idn: boolean
  nbf: number
  exp: number
  jti: string
}

export interface SupportPublicProfile {
  version?: number
  brand_color?: string
  appearance?: "auto" | (string & {})
  position?: "bottom-right" | (string & {})
  logo_url?: string
  default_locale?: string
  texts?: Record<string, {
    launcher?: string
    greeting?: string
    offline?: string
  }>
  fallback_contact?: SupportFallbackContact
}

export interface SupportVisitorErasedEvent {
  delivery_id: string
  event: "visitor_erased" | (string & {})
  timestamp: number
  contract?: number
  channel: SupportChannelRef
  user_ref: string
  case_ids?: string[]
  erased_at: string
}

/** Eventos observados en los fixtures. El contrato admite mas: los receptores responden 2xx a los desconocidos. */
export const SUPPORT_FIXTURE_EVENTS = ["ai_action","case_opened","desk_message","desk_resolved","issue_closed","issue_commented","message","visitor_erased"] as const
