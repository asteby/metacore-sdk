import type { ToolDef, ToolInputParam } from '@asteby/metacore-sdk'

export type { ToolDef, ToolInputParam }

/**
 * Request enviada al host backend (ops o link) para ejecutar una tool
 * instalada. El host se encarga del dispatch HMAC-firmado al endpoint del
 * addon (lo hace kernel/tool.HTTPDispatcher en Go).
 */
export interface ToolExecutionRequest {
  /** manifest.Manifest.Key del addon hospedador */
  addon_key: string
  /** ToolDef.ID dentro del addon */
  tool_id: string
  /** UUID de la installer.Installation para scoping por tenant */
  installation_id: string
  /** Parámetros ya extraídos por el LLM o recolectados del form UI */
  parameters: Record<string, unknown>
  /** Contexto opcional que el host pasa al dispatcher (user_id, locale, ...) */
  context?: Record<string, unknown>
}

/** Envelope de respuesta que el backend devuelve tras dispatchar la tool. */
export interface ToolExecutionResponse {
  success: boolean
  data?: unknown
  error?: string
  metadata?: Record<string, unknown>
}

/** Error de validación client-side antes de enviar la request. */
export interface ValidationError {
  param: string
  reason: string
}
