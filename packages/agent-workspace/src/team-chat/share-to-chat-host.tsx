// Un solo ShareToChatDialog para toda la app. Quien quiera «Enviar al chat»
// (la acción de registro registrada por el host, la barra de selección
// múltiple, el «Compartir» de la vista) llama a requestShareToChat; el diálogo
// vive montado una vez por shell (dentro del WebSocketProvider: el layout
// autenticado y las rutas inmersivas). Antes cada tabla y la página de
// lista montaban el suyo y el menú de fila lo inyectaba a mano.
import { useEffect, useState } from 'react'
import {
  ShareToChatDialog,
  type ShareToChatPayload,
} from './components/share-to-chat-dialog'

type Listener = (payload: ShareToChatPayload) => void

const listeners = new Set<Listener>()

/** Abre el diálogo de compartir. false si no hay host montado. */
export function requestShareToChat(payload: ShareToChatPayload): boolean {
  for (const l of [...listeners]) l(payload)
  return listeners.size > 0
}

export function ShareToChatHost() {
  const [payload, setPayload] = useState<ShareToChatPayload | null>(null)
  useEffect(() => {
    listeners.add(setPayload)
    return () => {
      listeners.delete(setPayload)
    }
  }, [])
  return (
    <ShareToChatDialog
      open={payload != null}
      onOpenChange={(open) => {
        if (!open) setPayload(null)
      }}
      payload={payload}
    />
  )
}
