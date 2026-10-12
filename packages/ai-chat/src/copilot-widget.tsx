import { useEffect, useRef, useState } from 'react'
import { Mascot } from '@asteby/metacore-app-providers'
import { CopilotChat, type CopilotChatProps } from './copilot-chat'
import { useCopilot } from './context'
import { AGENT_FOCUS, AGENT_PANEL } from './surfaces'
import { useDraggableFab, type FabPosition } from './use-draggable-fab'

export interface CopilotWidgetProps {
  /** Initial FAB spot (right-anchored); a position the user dragged wins. */
  defaultPosition?: FabPosition
  defaultOpen?: boolean
  zIndex?: number
  /** Forwarded to `CopilotChat`: past sessions for the picker. */
  sessions?: CopilotChatProps['sessions']
  /** Forwarded to `CopilotChat`: called when the user picks a session. */
  onSelectSession?: CopilotChatProps['onSelectSession']
  /** Forwarded to `CopilotChat`: shows the demo badge (overrides the provider). */
  demo?: CopilotChatProps['demo']
}

/** Floating action button + anchored chat panel. Renders nothing without `canChat`. */
export function CopilotWidget({ defaultPosition, defaultOpen = false, zIndex = 50, sessions, onSelectSession, demo }: CopilotWidgetProps) {
  const { permissions, branding, labels } = useCopilot()
  const [open, setOpen] = useState(defaultOpen)
  const fab = useDraggableFab(defaultPosition)
  const fabRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(defaultOpen)

  // Focus management: into the composer on open, back to the FAB on close.
  useEffect(() => {
    if (open === wasOpen.current) return
    wasOpen.current = open
    if (open) {
      const target = panelRef.current?.querySelector<HTMLElement>('textarea') ?? panelRef.current
      target?.focus()
    } else {
      fabRef.current?.focus()
    }
  }, [open])

  // Escape closes the panel even when focus sits outside it (e.g. a toast).
  // Yields to anything else that claims the key: handled events, IME
  // composition, other modal dialogs and text fields outside the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return
      const t = e.target instanceof Element ? e.target : null
      if (t && !panelRef.current?.contains(t)) {
        if (t.closest('[aria-modal="true"], dialog[open]')) return
        if (t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
      }
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (!permissions.canChat) return null
  const { panelLayout: p } = fab

  return (
    <>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="false" /* non-modal: the page stays usable behind the floating panel */
          aria-label={branding.name ?? 'Copiloto'}
          tabIndex={-1}
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
          <CopilotChat onClose={() => setOpen(false)} sessions={sessions} onSelectSession={onSelectSession} demo={demo} />
        </div>
      )}
      <button
        type="button"
        aria-label={open ? labels.close : labels.open}
        aria-expanded={open}
        ref={fabRef}
        className={`fixed flex size-12 items-center justify-center rounded-full border bg-background shadow-lg ${AGENT_FOCUS}`}
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
