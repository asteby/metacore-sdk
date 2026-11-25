// GENERADO por scripts/gen-support-types.mjs. No editar a mano.
// Fuente: fixtures del contrato (metacore-kernel: support/contract/testdata).
// Huella de los fixtures: sha256:24c4592407c7d336d359dd23eafe89fb25781439f75b2d4c38c4496f7330ef06
// Fixtures usados: callback_ai_action, callback_desk_message, callback_desk_resolved, callback_issue_closed, callback_issue_commented, desk_case_opened, desk_message, error_contract_upgrade_required, error_not_linked, error_not_linked_v1, escalate_request_v1, escalate_request_v2, escalate_response_v1, escalate_response_v1_duplicate, escalate_response_v2_pending, link_ack_request, link_request, link_response_active, link_response_pending, message_request_v1, message_request_v2, message_response

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

export interface SupportDeskCase {
  instance_id: string
  instance_name: string
  company_name: string
  folio: string
  subject: string
  description: string
  priority: "high" | (string & {})
  issue_url: string
  issue_number: number
  opened_at: string
  severity?: "high" | (string & {})
  instance_context?: SupportInstanceContext
}

export interface SupportDeskMessage {
  id: string
  author_type: "reporter" | (string & {})
  author_name: string
  body: string
  created_at: string
}

export interface SupportIncidentRef {
  kind: string
  message: string
  at: string
}

export interface SupportInstanceContext {
  instance_id: string
  name: string
  product: string
  version: string
  customer: string
  license_status: string
  partner: string
  severity: "high" | (string & {})
  recent_incidents: SupportIncidentRef[]
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
    code: "contract_upgrade_required" | "not_linked" | (string & {})
    message: string
    instance_id?: string
    reason?: "autolink_off" | (string & {})
  }
}

/** Eventos observados en los fixtures. El contrato admite mas: los receptores responden 2xx a los desconocidos. */
export const SUPPORT_FIXTURE_EVENTS = ["ai_action","case_opened","desk_message","desk_resolved","issue_closed","issue_commented","message"] as const
