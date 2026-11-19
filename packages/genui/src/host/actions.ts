// Politica de acciones del host. `usePageAction` ya resuelve por si mismo `set`
// (estado), `emit page.*` y `navigate` sin confirmacion; TODO lo demas llega al
// `onAction` del host. `createActionHandler` arma ese `onAction` con lista
// blanca: lo que no esta permitido se ignora (y se reporta con `onBlocked`).
import type { GenUIActionRequest } from '../registry'
import { isSafeInternalPath } from './paths'

export type BlockedReason = 'verb' | 'emit_id' | 'path'

export interface ActionPolicy {
  /** Verbos permitidos. Default: `navigate` y `emit`. `invoke` y `submit` nunca por defecto. */
  verbs?: readonly string[]
  /** Ids de `emit` permitidos (lista o predicado). Default: ninguno. */
  emitIds?: readonly string[] | ((id: string) => boolean)
  /** Navegacion interna (ya validada con {@link isSafeInternalPath}). */
  onNavigate?: (path: string) => void
  /** Evento permitido hacia el host. */
  onEmit?: (id: string, params: Record<string, unknown> | undefined, req: GenUIActionRequest) => void
  /** Accion ignorada y motivo (telemetria / depuracion). */
  onBlocked?: (req: GenUIActionRequest, reason: BlockedReason) => void
}

const DEFAULT_VERBS = ['navigate', 'emit'] as const

export function createActionHandler(policy: ActionPolicy = {}): (req: GenUIActionRequest) => void {
  const verbs = new Set<string>(policy.verbs ?? DEFAULT_VERBS)
  const emitOk = (id: string) => (typeof policy.emitIds === 'function' ? policy.emitIds(id) : (policy.emitIds ?? []).includes(id))
  return (req) => {
    const a = req.action as { do?: unknown; id?: unknown; params?: unknown; route?: { path?: unknown } }
    const block = (reason: BlockedReason) => policy.onBlocked?.(req, reason)
    const verb = typeof a.do === 'string' ? a.do : ''
    if (!verbs.has(verb)) return block('verb')
    if (verb === 'navigate') {
      const path = a.route?.path
      if (!isSafeInternalPath(path)) return block('path')
      return policy.onNavigate?.(path)
    }
    if (verb === 'emit') {
      if (typeof a.id !== 'string' || !emitOk(a.id)) return block('emit_id')
      const params = a.params && typeof a.params === 'object' ? (a.params as Record<string, unknown>) : undefined
      return policy.onEmit?.(a.id, params, req)
    }
    // Verbo en la lista pero sin semantica generica: el host lo implementa por su cuenta.
    return block('verb')
  }
}
