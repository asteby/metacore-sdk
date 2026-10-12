import { useState } from 'react'
import { Mascot } from '@asteby/metacore-app-providers'
import { CopilotChat } from './copilot-chat'
import { useCopilot } from './context'
import { AGENT_PANEL } from './surfaces'
import { useDraggableFab, type FabPosition } from './use-draggable-fab'

export interface CopilotWidgetProps {
  /** Initial FAB spot (right-anchored); a position the user dragged wins. */
  defaultPosition?: FabPosition
  defaultOpen?: boolean
  zIndex?: number
}

/** Floating action button + anchored chat panel. Renders nothing without `canChat`. */
export function CopilotWidget({ defaultPosition, defaultOpen = false, zIndex = 50 }: CopilotWidgetProps) {
  const { permissions, branding, labels } = useCopilot()
  const [open, setOpen] = useState(defaultOpen)
  const fab = useDraggableFab(defaultPosition)
  if (!permissions.canChat) return null
  const { panelLayout: p } = fab

  return (
    <>
      {open && (
        <div
          className={AGENT_PANEL}
          style={{
            position: 'fixed',
            zIndex,
            bottom: p.bottom,
            right: p.right,
            width: p.width,
            height: p.height,
            overflow: 'hidden',
          }}
        >
          <CopilotChat onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        type="button"
        aria-label={open ? labels.close : labels.open}
        aria-expanded={open}
        className="fixed flex size-12 items-center justify-center rounded-full border bg-background shadow-lg"
        style={{ ...fab.fabStyle, zIndex }}
        onPointerDown={fab.onFabPointerDown}
        onPointerMove={fab.onFabPointerMove}
        onPointerUp={fab.onFabPointerUp}
        onClick={() => {
          if (!fab.shouldSkipFabClick()) setOpen((o) => !o)
        }}
      >
        {branding.avatar ?? <Mascot skin={branding.mascotSkin} size={36} />}
      </button>
    </>
  )
}
