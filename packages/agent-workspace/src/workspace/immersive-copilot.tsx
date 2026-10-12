import { CallProvider } from '../team-chat/call-provider'
import { AIChatWidget } from './ai-chat-widget'
import { bottomLeftFabPosition } from './use-draggable-fab'

/**
 * Aby inside an immersive addon (POS, kiosks). Loaded as one lazy chunk after
 * the addon paints, so the chat stack (widget, call provider, markdown,
 * motion) stays off the addon's critical path. The widget calls useCall(),
 * hence its own CallProvider. Bottom-left default: the addon's primary action
 * (POS "Crear venta") owns the bottom-right corner.
 */
export default function ImmersiveCopilot() {
  return (
    <CallProvider>
      <AIChatWidget fabDefault={bottomLeftFabPosition()} />
    </CallProvider>
  )
}
