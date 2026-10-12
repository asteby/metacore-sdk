import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { ExternalLink, Maximize2, Minimize2 } from 'lucide-react'
import { Mascot } from '@asteby/metacore-app-providers'
import type { ChannelAdapter } from './channels'
import { CopilotChat, type CopilotChatProps } from './copilot-chat'
import { CopilotInbox } from './copilot-inbox'
import { useCopilot } from './context'
import { AGENT_FOCUS, AGENT_PANEL } from './surfaces'
import { useChannels } from './use-channels'
import { useDraggableFab, type FabPosition } from './use-draggable-fab'

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')
const TOUCH = 'inline-flex min-h-11 min-w-11 items-center justify-center'
const EXPANDED_SURFACE =
  'bg-[var(--surface-panel,var(--card))] [backdrop-filter:var(--backdrop-panel,none)] [-webkit-backdrop-filter:var(--backdrop-panel,none)]'

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
  /**
   * Channel inbox: bot + agents + team conversations from your backend.
   * Without it the widget is the single copilot chat (unchanged).
   */
  channels?: ChannelAdapter
  /** Show the built-in bot channel first in the inbox. Default true. */
  includeBot?: boolean
  /** Route of the app's own full-screen workspace; adds an "open full view" link. */
  fullscreenHref?: string
  /**
   * Handle "open full view" yourself (SPA navigation). Receives the active
   * channel id. The widget closes afterwards.
   */
  onOpenFullscreen?: (ctx: { channelId: string | null }) => void
  /** Start expanded (viewport-filling). Users toggle it with the header button. */
  defaultExpanded?: boolean
  /** Channel to open first when nothing was remembered. */
  defaultChannelId?: string | null
  /** localStorage namespace for the last-opened channel. Default "metacore-ai-chat". */
  storageKey?: string
  /** Hide the whole widget (e.g. on routes that already show the full workspace). */
  hidden?: boolean
}

function useIsNarrow(maxWidth = 639): boolean {
  const query = `(max-width: ${maxWidth}px)`
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [query])
  return narrow
}

function readLast(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeLast(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value)
    else localStorage.removeItem(key)
  } catch {
    /* storage unavailable (private mode / blocked): the memory is a convenience */
  }
}

/** Floating action button + anchored chat panel. Renders nothing without `canChat`. */
export function CopilotWidget({
  defaultPosition,
  defaultOpen = false,
  zIndex = 50,
  sessions,
  onSelectSession,
  demo,
  channels,
  includeBot = true,
  fullscreenHref,
  onOpenFullscreen,
  defaultExpanded = false,
  defaultChannelId = null,
  storageKey = 'metacore-ai-chat',
  hidden = false,
}: CopilotWidgetProps) {
  const { permissions, branding, labels } = useCopilot()
  const [open, setOpen] = useState(defaultOpen)
  const [expanded, setExpanded] = useState(defaultExpanded)
  const narrow = useIsNarrow()
  const lastKey = `${storageKey}:channel`
  const [activeId, setActiveId] = useState<string | null>(() => (channels ? readLast(lastKey) ?? defaultChannelId : null))
  const channelState = useChannels(channels, activeId)
  const fab = useDraggableFab(defaultPosition)
  const fabRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const wasOpen = useRef(defaultOpen)
  // Phones always get the viewport-filling layout.
  const filling = expanded || narrow

  const select = useCallback(
    (id: string | null) => {
      setActiveId(id)
      writeLast(lastKey, id)
    },
    [lastKey],
  )
  const close = useCallback(() => {
    setOpen(false)
    setExpanded(false)
  }, [])
  // Escape steps back: expanded → floating, then closes.
  const escape = useCallback(() => {
    if (expanded) setExpanded(false)
    else setOpen(false)
  }, [expanded])

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
      escape()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, escape])

  if (!permissions.canChat || hidden) return null
  const { panelLayout: p } = fab
  const unread = channelState.totalUnread

  const openFullscreen = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpenFullscreen) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    onOpenFullscreen({ channelId: activeId })
    close()
  }
  const actions = (
    <>
      {!narrow && (
        <button
          type="button"
          aria-label={expanded ? labels.collapse : labels.expand}
          title={expanded ? labels.collapse : labels.expand}
          aria-pressed={expanded}
          onClick={() => setExpanded((x) => !x)}
          className={cx(TOUCH, 'rounded-md hover:bg-muted', AGENT_FOCUS)}
        >
          {expanded ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
        </button>
      )}
      {(fullscreenHref || onOpenFullscreen) && (
        <a
          href={fullscreenHref ?? '#'}
          aria-label={labels.openFullscreen}
          title={labels.openFullscreen}
          onClick={openFullscreen}
          className={cx(TOUCH, 'rounded-md hover:bg-muted', AGENT_FOCUS)}
        >
          <ExternalLink className="size-4" aria-hidden />
        </a>
      )}
    </>
  )

  const surface = filling
    ? {
        className: cx(EXPANDED_SURFACE, 'animate-in fade-in-0 duration-200 motion-reduce:animate-none'),
        style: {
          position: 'fixed' as const,
          zIndex,
          inset: 0,
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          overflow: 'hidden',
        },
      }
    : {
        className: cx(AGENT_PANEL, 'animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none'),
        style: {
          position: 'fixed' as const,
          zIndex,
          bottom: p.bottom,
          right: p.right,
          width: p.width,
          height: p.height,
          overflow: 'hidden',
        },
      }

  return (
    <>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal={filling ? 'true' : 'false'} /* floating: the page stays usable; filling: it is covered */
          aria-label={branding.name ?? 'Copiloto'}
          tabIndex={-1}
          className={surface.className}
          style={surface.style}
        >
          {channels ? (
            <CopilotInbox
              adapter={channels}
              state={channelState}
              activeId={activeId}
              onSelect={select}
              expanded={filling}
              includeBot={includeBot}
              actions={actions}
              onClose={close}
              onEscape={escape}
            />
          ) : (
            <div className={cx('mx-auto h-full w-full', filling && 'max-w-3xl')}>
              <CopilotChat
                onClose={close}
                onEscape={escape}
                headerEnd={actions}
                sessions={sessions}
                onSelectSession={onSelectSession}
                demo={demo}
              />
            </div>
          )}
        </div>
      )}
      {!(open && filling) && (
        <button
          type="button"
          aria-label={open ? labels.close : labels.open}
          aria-expanded={open}
          ref={fabRef}
          className={cx('fixed flex size-12 items-center justify-center rounded-full border bg-background shadow-lg', AGENT_FOCUS)}
          style={{ ...fab.fabStyle, zIndex }}
          onPointerDown={fab.onFabPointerDown}
          onPointerMove={fab.onFabPointerMove}
          onPointerUp={fab.onFabPointerUp}
          onClick={() => {
            if (!fab.shouldSkipFabClick()) setOpen((o) => !o)
          }}
        >
          {branding.avatar ?? <Mascot skin={branding.mascotSkin} size={36} />}
          {unread > 0 && !open && (
            <span
              aria-label={`${unread} ${labels.unread}`}
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}
    </>
  )
}
