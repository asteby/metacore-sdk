import type { AbyOpenDraft } from './aby-widget'

/**
 * Qué hace el panel de Aby con un borrador que llega desde fuera del chat
 * (openAbyWidget): el buscador, el tablero, la voz, «Compartir con Aby».
 *
 *   send   → conversación nueva y el mensaje se envía en seguida (una pregunta).
 *   open   → abre esa conversación y deja el texto/adjuntos en el compositor.
 *   new    → conversación nueva con el texto/adjuntos en el compositor.
 *
 * Nunca devuelve «la lista de conversaciones»: con un borrador en mano, quedarse
 * en la lista escondía el texto en un compositor que no se veía.
 */
export type AbyDraftTarget =
  | { kind: 'send'; message: string }
  | { kind: 'open'; sessionId: string; title: string }
  | { kind: 'new' }

export function resolveAbyDraftTarget(
  draft: AbyOpenDraft,
  last: { id: string; title?: string } | null | undefined,
): AbyDraftTarget {
  const message = draft.message?.trim() ?? ''
  // Una pregunta con `send` es una conversación nueva aunque haya una anterior:
  // mezclarla con otro hilo cambia su contexto.
  if (draft.send && message && !draft.sessionId) return { kind: 'send', message }
  const sid = draft.sessionId || last?.id
  if (sid) {
    return { kind: 'open', sessionId: sid, title: draft.sessionTitle || last?.title || 'Conversación' }
  }
  return { kind: 'new' }
}
