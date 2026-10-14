import { useState, useRef, useEffect, useCallback, type ClipboardEvent } from 'react'
import { useLocation, Link } from '@tanstack/react-router'
import {
  X, Send, Minimize2,
  ArrowLeft, MessagesSquare, Phone, Video,
  Maximize2, ScreenShare,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button, Skeleton } from '@asteby/metacore-ui'
import { api } from '../host'
import { cn } from '@asteby/metacore-ui'
import { getImageUrl } from '@asteby/metacore-starter-core'
import { useWorkspaceUser } from '../host'
import type { FabPosition } from './use-draggable-fab'
import { useWebSocketContext, type WSEvent } from '../host'
import { useWorkspacePlatformConfig } from '../host'
import {
  type TeamChatChannel,
  type TeamChatMessage,
  type ChatAttachment,
  type MessageReplyPreview,
  parseAttachments,
  messagePreviewText,
  callEventFromMessage,
  isAudioAttachment,
} from '../team-chat/data/types'
import {
  ChannelAvatar,
  channelDisplayName,
} from '../team-chat/components/channel-avatar'
import { MessageReactions } from '../team-chat/components/message-reactions'
import { CallEventBubble } from '../team-chat/components/call-event-bubble'
import { ChatEmbedList, isChatEmbed } from '../team-chat/components/chat-embed-card'
import { ComposerExtraActions } from '../team-chat/components/composer-extra-actions'
import { VoiceMessage } from '../team-chat/components/voice-message'
import { ReplyQuote } from '../team-chat/components/reply-quote'
import { useCall } from '../team-chat/call-provider'
import { ABY_CHANNEL_ID, consumeTeamDraft, registerAbyWidgetOpener, registerChatWidgetMinimizer, registerTeamChatWidgetOpener } from '../lib/aby-widget'
import { readLastAbySession, readLastChatFocus, rememberAbyFocus, rememberTeamChannel } from '../lib/chat-context'
import { AbyChatPane } from './aby-chat-pane'
import { AbyLivePip } from './aby-live-pip'
import { useDraggableFab } from './use-draggable-fab'
import { Mascot } from './mascot'
import { useMascotFaceStore } from '../lib/mascot-face-store'
import { AGENT_BAR, AGENT_PANEL } from './agent-surfaces'
import { useAbyLiveStore } from '../lib/aby-live-store'
import {
  abyPiPLabel,
  openAbyDocumentPiP,
  supportsDocumentPiP,
  syncAbyDocumentPiP,
  type AbyPiPPhase,
} from '../lib/chrome-media'
import { toast } from 'sonner'

const TEAM_WS = 'INTERNAL_CHAT_MESSAGE'

/**
 * `fabDefault` only seeds the floating button's position when the user has
 * never dragged it (a dragged position persists and always wins). Immersive
 * surfaces pass a bottom-left default so the FAB does not sit on top of the
 * addon's primary bottom-right action.
 */
export function AIChatWidget({ fabDefault }: { fabDefault?: FabPosition } = {}) {
  const { mascot_name: mascotName, mascot_skin: mascotSkin } = useWorkspacePlatformConfig()
  // Misma mascota (piel y estado animado) que la bandeja de /team-chat.
  const mascotState = useMascotFaceStore((s) => s.state)
  const location = useLocation()
  const onTeamChatPage = location.pathname.includes('/team-chat')
  const onAgentPage = location.pathname.includes('/agent')
  const [open, setOpen] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const { subscribe, setWidgetTeamChatChannelId, presenceByUserId } =
    useWebSocketContext()
  const currentUser = useWorkspaceUser()

  const [teamChannels, setTeamChannels] = useState<TeamChatChannel[]>([])
  const [teamLoading, setTeamLoading] = useState(false)
  const [teamChannelId, setTeamChannelId] = useState<string | null>(null)
  const [teamMessages, setTeamMessages] = useState<TeamChatMessage[]>([])
  const [teamDraft, setTeamDraft] = useState('')
  const [teamSending, setTeamSending] = useState(false)
  const [teamMessagesLoading, setTeamMessagesLoading] = useState(false)
  const [teamPending, setTeamPending] = useState<ChatAttachment[]>([])
  const [teamReplyTo, setTeamReplyTo] = useState<MessageReplyPreview | null>(null)
  const teamChannelIdRef = useRef<string | null>(null)
  teamChannelIdRef.current = teamChannelId
  const teamScrollRef = useRef<HTMLDivElement>(null)
  const teamComposerRef = useRef<HTMLInputElement>(null)
  const teamFileRef = useRef<HTMLInputElement>(null)
  const { startCall, session: callSession } = useCall()

  const showAby = teamChannelId === ABY_CHANNEL_ID
  const {
    fabStyle,
    panelLayout,
    onFabPointerDown,
    onFabPointerMove,
    onFabPointerUp,
    shouldSkipFabClick,
  } = useDraggableFab(fabDefault)

  // Full /team-chat or /agent owns the inbox — hide the float there.
  useEffect(() => {
    if (onTeamChatPage || onAgentPage) {
      setOpen(false)
      setTeamChannelId(null)
      setWidgetTeamChatChannelId(null)
    }
  }, [onTeamChatPage, onAgentPage, setWidgetTeamChatChannelId])

  useEffect(() => {
    return registerAbyWidgetOpener((_draft) => {
      setMinimized(false)
      setOpen(true)
      setTeamChannelId(ABY_CHANNEL_ID)
    })
  }, [])

  useEffect(() => {
    return registerChatWidgetMinimizer(() => {
      void minimizeChatRef.current()
    })
  }, [])

  useEffect(() => {
    return registerTeamChatWidgetOpener((opts) => {
      if (onTeamChatPage) return
      setMinimized(false)
      setOpen(true)
      const draft = consumeTeamDraft() || opts
      const channelId = draft?.channelId || opts?.channelId || null
      setTeamChannelId(channelId)
      if (draft?.message) {
        setTeamDraft((prev) => (prev ? `${prev} ${draft.message}` : draft.message!).trim())
      }
      if (draft?.attachments?.length) {
        setTeamPending((prev) => [...prev, ...draft.attachments!])
      }
      requestAnimationFrame(() => teamComposerRef.current?.focus())
    })
  }, [onTeamChatPage])

  useEffect(() => {
    const focused =
      open && !minimized && teamChannelId && teamChannelId !== ABY_CHANNEL_ID
        ? teamChannelId
        : null
    setWidgetTeamChatChannelId(focused)
    return () => setWidgetTeamChatChannelId(null)
  }, [open, minimized, teamChannelId, setWidgetTeamChatChannelId])

  const [vp, setVp] = useState<{ mobile: boolean; h?: number; top?: number }>({
    mobile: false,
  })
  const abyDocPipRef = useRef<Window | null>(null)
  const [abyDocPipOpen, setAbyDocPipOpen] = useState(false)
  const minimizeChatRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 639px)')
    const vv = window.visualViewport
    const update = () =>
      setVp({ mobile: mq.matches, h: vv?.height, top: vv?.offsetTop })
    update()
    mq.addEventListener('change', update)
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    return () => {
      mq.removeEventListener('change', update)
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
    }
  }, [])

  const loadTeamChannels = useCallback(async () => {
    setTeamLoading(true)
    try {
      const { data } = await api.get('/internal-chat/channels')
      setTeamChannels(data.channels ?? [])
    } catch {
      setTeamChannels([])
    } finally {
      setTeamLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTeamChannels()
  }, [loadTeamChannels])

  useEffect(() => {
    if (open && !teamChannelId) {
      void loadTeamChannels()
    }
  }, [open, teamChannelId, loadTeamChannels])

  useEffect(() => {
    if (!teamChannelId || teamChannelId === ABY_CHANNEL_ID) {
      setTeamMessages([])
      setTeamMessagesLoading(false)
      setTeamReplyTo(null)
      return
    }
    setTeamReplyTo(null)
    let cancelled = false
    setTeamMessagesLoading(true)
    setTeamMessages([])
    api
      .get(`/internal-chat/channels/${teamChannelId}/messages`)
      .then(({ data }) => {
        if (cancelled) return
        const msgs = ((data.messages ?? []) as TeamChatMessage[]).slice().reverse()
        setTeamMessages(msgs)
        void api.post(`/internal-chat/channels/${teamChannelId}/read`).catch(() => {})
        const newest = msgs[msgs.length - 1]
        setTeamChannels((prev) =>
          prev.map((c) =>
            c.id === teamChannelId
              ? { ...c, unread: 0, last_message: newest ?? c.last_message }
              : c,
          ),
        )
      })
      .catch(() => {
        if (!cancelled) setTeamMessages([])
      })
      .finally(() => {
        if (!cancelled) setTeamMessagesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [teamChannelId])

  useEffect(() => {
    return subscribe(TEAM_WS, (evt: WSEvent) => {
      const msg = evt.payload as TeamChatMessage
      if (!msg?.channel_id) return
      if (open && msg.channel_id === teamChannelIdRef.current) {
        setTeamMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      }
      setTeamChannels((prev) => {
        let found = false
        const next = prev.map((c) => {
          if (c.id !== msg.channel_id) return c
          found = true
          return {
            ...c,
            last_message: msg,
            unread:
              open && msg.channel_id === teamChannelIdRef.current
                ? 0
                : c.unread + (msg.sender_id === currentUser?.id ? 0 : 1),
          }
        })
        return found ? next : prev
      })
    })
  }, [open, subscribe, currentUser?.id])

  useEffect(() => {
    return subscribe('INTERNAL_CHAT_REACTION', (evt: WSEvent) => {
      const p = evt.payload as {
        message_id?: string
        channel_id?: string
        reactions?: TeamChatMessage['reactions']
      }
      if (!p?.message_id || p.channel_id !== teamChannelIdRef.current) return
      setTeamMessages((prev) =>
        prev.map((m) => (m.id === p.message_id ? { ...m, reactions: p.reactions ?? [] } : m)),
      )
    })
  }, [subscribe])

  useEffect(() => {
    return subscribe('PRESENCE_UPDATE', (evt: WSEvent) => {
      const p = evt.payload as { user_id?: string; online?: boolean; last_seen?: string }
      if (!p?.user_id) return
      setTeamChannels((prev) =>
        prev.map((c) => {
          if (c.kind !== 'dm' || c.dm_user?.id !== p.user_id) return c
          return {
            ...c,
            dm_user: {
              ...c.dm_user!,
              online: !!p.online,
              last_seen_at: p.last_seen ?? c.dm_user!.last_seen_at,
            },
          }
        }),
      )
    })
  }, [subscribe])

  useEffect(() => {
    const el = teamScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [teamMessages, teamChannelId])

  const handleOpen = useCallback(() => {
    setOpen(true)
    setMinimized(false)
    // Resume last conversation (team or Aby) — don't dump to the picker.
    if (!teamChannelIdRef.current) {
      const focus = readLastChatFocus()
      if (focus?.kind === 'aby') {
        setTeamChannelId(ABY_CHANNEL_ID)
      } else if (focus?.kind === 'team' && focus.channelId) {
        setTeamChannelId(focus.channelId)
      }
    }
  }, [])

  useEffect(() => {
    if (teamChannelId === ABY_CHANNEL_ID) rememberAbyFocus()
    else if (teamChannelId) rememberTeamChannel(teamChannelId)
  }, [teamChannelId])

  const sendTeamMessage = useCallback(async () => {
    const body = teamDraft.trim()
    if ((!body && teamPending.length === 0) || !teamChannelId || teamSending) return
    setTeamSending(true)
    setTeamDraft('')
    const files = teamPending
    const replying = teamReplyTo
    setTeamPending([])
    setTeamReplyTo(null)
    try {
      const payload: {
        body: string
        attachments?: ChatAttachment[]
        reply_to_id?: string
      } = { body }
      if (files.length) payload.attachments = files
      if (replying?.id) payload.reply_to_id = replying.id
      const { data } = await api.post(`/internal-chat/channels/${teamChannelId}/messages`, payload)
      const msg = data.message as TeamChatMessage
      setTeamMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      setTeamChannels((prev) =>
        prev.map((c) =>
          c.id === teamChannelId ? { ...c, last_message: msg } : c,
        ),
      )
    } catch {
      setTeamDraft(body)
      setTeamPending(files)
      if (replying) setTeamReplyTo(replying)
    } finally {
      setTeamSending(false)
      requestAnimationFrame(() => teamComposerRef.current?.focus())
    }
  }, [teamDraft, teamChannelId, teamSending, teamPending, teamReplyTo])

  const attachTeamFiles = useCallback(async (fileList: FileList | File[] | null) => {
    if (!fileList || (Array.isArray(fileList) ? !fileList.length : !fileList.length)) return
    const list = Array.isArray(fileList) ? fileList : Array.from(fileList)
    const uploaded: ChatAttachment[] = []
    for (const file of list) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'chat')
      try {
        const { data } = await api.post('/upload', fd)
        if (data?.data?.url) {
          uploaded.push({
            url: data.data.url,
            name: data.data.original_name || file.name,
            mime_type: data.data.mime_type || file.type,
            size: data.data.size || file.size,
          })
        }
      } catch {
        toast.error('No se pudo subir el archivo')
      }
    }
    if (uploaded.length) setTeamPending((prev) => [...prev, ...uploaded])
  }, [])

  const handleTeamPaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const f = item.getAsFile()
          if (f) files.push(f)
        }
      }
      if (!files.length) return
      e.preventDefault()
      void attachTeamFiles(files)
    },
    [attachTeamFiles],
  )


  const activeTeamChannel = teamChannels.find((c) => c.id === teamChannelId) ?? null
  const teamUnread = teamChannels.reduce((n, c) => n + (c.unread || 0), 0)
  const abyLiveActive = useAbyLiveStore((s) => s.active)
  const abyLivePhase = useAbyLiveStore((s) => s.phase)
  const abyLiveHint = useAbyLiveStore((s) => s.hint)
  const abyLiveUtterance = useAbyLiveStore((s) => s.utterance)
  const abyLiveThoughts = useAbyLiveStore((s) => s.thoughts)
  const abyLiveMicMuted = useAbyLiveStore((s) => s.micMuted)
  const abyPendingProposal = useAbyLiveStore((s) => s.pendingProposal)

  const closeAbyDocPip = useCallback(() => {
    const w = abyDocPipRef.current
    abyDocPipRef.current = null
    setAbyDocPipOpen(false)
    try {
      w?.close()
    } catch {
      /* ignore */
    }
  }, [])

  const openAbyLive = useCallback(() => {
    closeAbyDocPip()
    setMinimized(false)
    setOpen(true)
    setTeamChannelId(ABY_CHANNEL_ID)
  }, [closeAbyDocPip])

  const minimizeChat = useCallback(async () => {
    // Hide panel immediately so the click feels real (Document PiP can take a beat).
    setMinimized(true)
    // Live + Chrome Document PiP → ventana que sigue al cambiar de pestaña.
    if (showAby && abyLiveActive && supportsDocumentPiP()) {
      try {
        closeAbyDocPip()
        const st = useAbyLiveStore.getState()
        const pip = await openAbyDocumentPiP(
          {
            phase: st.phase as AbyPiPPhase,
            label: abyPiPLabel(st.phase as AbyPiPPhase),
            hint: st.hint,
            utterance: st.utterance,
            thoughts: st.thoughts,
            micMuted: st.micMuted,
            proposal: st.pendingProposal,
            mascotName,
          },
          { width: 420, height: 340 },
        )
        if (pip) {
          abyDocPipRef.current = pip
          setAbyDocPipOpen(true)
          const onClick = (ev: Event) => {
            const t = ev.target as HTMLElement | null
            const action = t?.closest?.('[data-aby-action]') as HTMLElement | null
            const kind = action?.dataset.abyAction
            if (kind === 'mute') {
              ev.preventDefault()
              ev.stopPropagation()
              useAbyLiveStore.getState().toggleMicMuted()
              return
            }
            if (kind === 'approve' || kind === 'reject') {
              ev.preventDefault()
              ev.stopPropagation()
              useAbyLiveStore.getState().decidePending(kind === 'approve')
              return
            }
            openAbyLive()
          }
          pip.document.addEventListener('click', onClick)
          pip.addEventListener('pagehide', () => {
            pip.document.removeEventListener('click', onClick)
            if (abyDocPipRef.current === pip) {
              abyDocPipRef.current = null
              setAbyDocPipOpen(false)
            }
            setMinimized(true)
            try {
              window.focus()
            } catch {
              /* ignore */
            }
          })
          return
        }
      } catch (err) {
        console.error(err)
        toast.message('No se pudo abrir el PiP flotante; se minimiza en la página.')
      }
    }
  }, [showAby, abyLiveActive, closeAbyDocPip, openAbyLive, mascotName])

  minimizeChatRef.current = minimizeChat

  // Keep Document PiP in sync with live phase/hint/utterance/thoughts.
  useEffect(() => {
    const pip = abyDocPipRef.current
    if (!abyDocPipOpen || !pip || pip.closed) return
    syncAbyDocumentPiP(pip, {
      phase: abyLivePhase as AbyPiPPhase,
      label: abyPiPLabel(abyLivePhase as AbyPiPPhase),
      hint: abyLiveHint,
      utterance: abyLiveUtterance,
      thoughts: abyLiveThoughts,
      micMuted: abyLiveMicMuted,
      proposal: abyPendingProposal,
      mascotName,
    })
  }, [
    abyDocPipOpen,
    abyLivePhase,
    abyLiveHint,
    abyLiveUtterance,
    abyLiveThoughts,
    abyLiveMicMuted,
    abyPendingProposal,
    mascotName,
  ])

  // Live off or widget closed → tear down floating PiP.
  useEffect(() => {
    if (!open || !abyLiveActive) closeAbyDocPip()
  }, [open, abyLiveActive, closeAbyDocPip])

  useEffect(() => () => closeAbyDocPip(), [closeAbyDocPip])

  if (!open) {
    // Closing the widget stops live (pane unmounts). FAB only.
    if (onTeamChatPage || onAgentPage) return null
    return (
      <button
        type="button"
        onPointerDown={onFabPointerDown}
        onPointerMove={onFabPointerMove}
        onPointerUp={onFabPointerUp}
        onClick={() => {
          if (shouldSkipFabClick()) return
          handleOpen()
        }}
        style={fabStyle}
        className="fixed z-40 flex h-12 w-12 cursor-grab items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 active:cursor-grabbing"
        title="Chat (arrastrar para mover)"
      >
        <MessagesSquare className="h-6 w-6" />
        {teamUnread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {teamUnread > 9 ? '9+' : teamUnread}
          </span>
        )}
      </button>
    )
  }

  // Minimized + live: PiP orb, keep panel mounted (hidden) so mic/TTS continue.
  if (minimized && (onTeamChatPage || onAgentPage)) {
    return null
  }

  const panelHidden = minimized
  const showInPageAbyPip = minimized && abyLiveActive && showAby && !abyDocPipOpen
  const fabAnchor = (
    <button
      type="button"
      aria-hidden={panelHidden}
      onPointerDown={onFabPointerDown}
      onPointerMove={onFabPointerMove}
      onPointerUp={onFabPointerUp}
      onClick={() => {
        if (shouldSkipFabClick()) return
        if (panelHidden) setMinimized(false)
        else setOpen(false)
      }}
      style={fabStyle}
      className={cn(
        'fixed z-[45] flex h-12 w-12 cursor-grab items-center justify-center rounded-full shadow-lg transition-transform active:cursor-grabbing',
        panelHidden
          ? 'bg-primary text-primary-foreground hover:scale-105 active:scale-95'
          : 'border-2 border-primary bg-card text-primary hover:bg-muted',
      )}
      title={panelHidden ? 'Abrir chat' : 'Cerrar chat'}
    >
      {panelHidden ? (
        <MessagesSquare className="h-6 w-6" />
      ) : (
        <X className="h-5 w-5" />
      )}
      {panelHidden && teamUnread > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {teamUnread > 9 ? '9+' : teamUnread}
        </span>
      )}
    </button>
  )

  return (
    <>
      {/* One launcher only — do not add a second minimized "Chat" pill. */}
      {fabAnchor}
      {minimized && showInPageAbyPip ? (
        <AbyLivePip visible onOpen={openAbyLive} />
      ) : null}
    <div
      className={cn(
        'fixed flex flex-col',
        panelHidden && 'pointer-events-none invisible h-0 w-0 overflow-hidden border-0 opacity-0',
        !panelHidden && vp.mobile && 'inset-0 z-[110] rounded-none border-0 bg-card',
        !panelHidden &&
          !vp.mobile &&
          cn(
            'z-30 overflow-hidden',
            AGENT_PANEL,
            'animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-200 ease-out motion-reduce:animate-none',
          ),
      )}
      style={
        panelHidden
          ? undefined
          : vp.mobile
          ? {
              paddingTop: 'env(safe-area-inset-top, 0px)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              height: vp.h ? `${vp.h}px` : '100dvh',
              top: vp.top ?? 0,
              left: 0,
              right: 0,
            }
          : {
              bottom: panelLayout.bottom,
              right: panelLayout.right,
              width: panelLayout.width,
              height: panelLayout.height,
              maxHeight: panelLayout.height,
            }
      }
    >
      <div className={cn('flex shrink-0 items-center justify-between px-3 py-2.5', AGENT_BAR)}>
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          {showAby ? (
            <>
              <button
                type="button"
                className="rounded p-1.5 hover:bg-muted"
                onClick={() => setTeamChannelId(null)}
                title="Volver al chat de equipo"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <Mascot skin={mascotSkin} size={22} state={mascotState} className="shrink-0" />
              <span className="truncate">{mascotName}</span>
            </>
          ) : (
            <>
              <MessagesSquare className="h-4 w-4 shrink-0" />
              <span className="truncate">Chat de equipo</span>
              {teamUnread > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                  {teamUnread}
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {(!vp.mobile || (showAby && abyLiveActive)) && (
            <button
              type="button"
              onClick={() => void minimizeChat()}
              className={cn(
                'rounded hover:bg-muted',
                vp.mobile ? 'p-2.5' : 'p-1.5',
              )}
              title={
                showAby && abyLiveActive && supportsDocumentPiP()
                  ? 'Minimizar a PiP flotante (sigue en otras pestañas)'
                  : 'Minimizar para ver la app'
              }
            >
              <Minimize2 className={vp.mobile ? 'h-5 w-5' : 'h-4 w-4'} />
            </button>
          )}
          {showAby && (
            <Link
              to="/agent"
              search={{
                session: readLastAbySession()?.id,
              }}
              className="rounded p-1.5 hover:bg-muted"
              title="Abrir vista completa"
              onClick={() => {
                setOpen(false)
                setMinimized(false)
              }}
            >
              <Maximize2 className="h-4 w-4" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setMinimized(false)
            }}
            className={cn(
              'rounded-md hover:bg-muted',
              vp.mobile ? 'p-2.5' : 'p-1.5',
            )}
            title="Cerrar"
            aria-label="Cerrar chat"
          >
            <X className={vp.mobile ? 'h-6 w-6' : 'h-5 w-5'} />
          </button>
        </div>
      </div>

      {showAby ? (
        <AbyChatPane className="flex min-h-0 flex-1" />
      ) : (
        <>
          {teamChannelId && activeTeamChannel ? (
            <>
              <div className="flex items-center gap-2 border-b px-2 py-2">
                <button
                  type="button"
                  className="rounded p-1 hover:bg-muted"
                  onClick={() => setTeamChannelId(null)}
                  title="Volver"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <ChannelAvatar
                  channel={activeTeamChannel}
                  size="sm"
                  online={
                    activeTeamChannel.kind === 'dm'
                      ? !!(
                          presenceByUserId[activeTeamChannel.dm_user?.id || '']?.online ??
                          activeTeamChannel.dm_user?.online
                        )
                      : undefined
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{channelDisplayName(activeTeamChannel)}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {(() => {
                      if (activeTeamChannel.kind !== 'dm') {
                        return activeTeamChannel.description || 'Canal'
                      }
                      const dm = activeTeamChannel.dm_user
                      const live = dm ? presenceByUserId[dm.id] : undefined
                      const online = live?.online ?? !!dm?.online
                      if (online) return 'En línea'
                      const lastSeen = live?.last_seen || dm?.last_seen_at
                      if (lastSeen) {
                        try {
                          return `Últ. vez ${formatDistanceToNow(new Date(lastSeen), {
                            locale: es,
                            addSuffix: true,
                          })}`
                        } catch {
                          /* bad date */
                        }
                      }
                      return dm?.email || 'Mensaje directo'
                    })()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    className="rounded p-1.5 hover:bg-muted disabled:opacity-40"
                    title="Llamada de audio"
                    disabled={!!callSession}
                    onClick={() => {
                      if (callSession) {
                        toast.message('Ya hay una llamada activa')
                        return
                      }
                      void startCall({
                        channelId: activeTeamChannel.id,
                        kind: 'audio',
                        title: channelDisplayName(activeTeamChannel),
                      })
                    }}
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1.5 hover:bg-muted disabled:opacity-40"
                    title="Videollamada"
                    disabled={!!callSession}
                    onClick={() => {
                      if (callSession) {
                        toast.message('Ya hay una llamada activa')
                        return
                      }
                      void startCall({
                        channelId: activeTeamChannel.id,
                        kind: 'video',
                        title: channelDisplayName(activeTeamChannel),
                      })
                    }}
                  >
                    <Video className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1.5 hover:bg-muted disabled:opacity-40"
                    title="Compartir pantalla"
                    disabled={!!callSession}
                    onClick={() => {
                      if (callSession) {
                        toast.message('Ya hay una llamada activa')
                        return
                      }
                      void startCall({
                        channelId: activeTeamChannel.id,
                        kind: 'screen',
                        title: channelDisplayName(activeTeamChannel),
                      })
                    }}
                  >
                    <ScreenShare className="h-4 w-4" />
                  </button>
                  <Link
                    to="/team-chat"
                    className="rounded p-1.5 hover:bg-muted"
                    title="Abrir chat completo"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Link>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2" ref={teamScrollRef}>
                <div className="flex flex-col gap-1.5">
                  {teamMessagesLoading ? (
                    <div className="mt-auto flex flex-col gap-1.5 py-2" aria-busy="true" aria-label="Cargando mensajes">
                      <Skeleton className="ml-auto h-10 w-[55%] rounded-xl rounded-tr-none bg-primary/15" />
                      <Skeleton className="h-10 w-[65%] rounded-xl rounded-tl-none" />
                      <Skeleton className="ml-auto h-8 w-[40%] rounded-xl rounded-tr-none bg-primary/15" />
                      <Skeleton className="h-12 w-[70%] rounded-xl rounded-tl-none" />
                    </div>
                  ) : (
                    teamMessages.map((m) => {
                    const mine = m.sender_id === currentUser?.id
                    const attachments = parseAttachments(m.attachments)
                    const callEvt = callEventFromMessage(m)
                    if (callEvt) {
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            'flex w-fit max-w-[min(100%,17rem)] flex-col',
                            mine ? 'ml-auto items-stretch' : 'items-stretch',
                          )}
                        >
                          <CallEventBubble
                            call={callEvt}
                            label={m.body || 'Llamada'}
                            mine={mine}
                            onCallback={
                              !mine
                                ? (kind) => {
                                    if (callSession) {
                                      toast.message('Ya hay una llamada activa')
                                      return
                                    }
                                    void startCall({
                                      channelId: activeTeamChannel.id,
                                      kind,
                                      title: channelDisplayName(activeTeamChannel),
                                    })
                                  }
                                : undefined
                            }
                          />
                        </div>
                      )
                    }
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          'flex w-max max-w-[85%] flex-col',
                          mine ? 'ml-auto items-end' : 'items-start',
                        )}
                      >
                      <MessageReactions
                        reactions={m.reactions}
                        align={mine ? 'end' : 'start'}
                        onReply={() => {
                          setTeamReplyTo({
                            id: m.id,
                            sender_id: m.sender_id,
                            sender_name: m.sender_name,
                            body: m.body?.trim() || messagePreviewText(m) || 'Mensaje',
                          })
                          requestAnimationFrame(() => teamComposerRef.current?.focus())
                        }}
                        onToggle={async (emoji) => {
                          try {
                            const { data } = await api.post(`/internal-chat/messages/${m.id}/reactions`, { emoji })
                            if (data?.reactions) {
                              setTeamMessages((prev) =>
                                prev.map((x) => (x.id === m.id ? { ...x, reactions: data.reactions } : x)),
                              )
                            }
                          } catch {
                            /* ignore */
                          }
                        }}
                      >
                      {(() => {
                        const embedAtts = attachments.filter(isChatEmbed)
                        const fileAtts = attachments.filter(
                          (x) => !isChatEmbed(x) && x.type !== 'call' && x.url,
                        )
                        const audioOnly =
                          !m.body?.trim() &&
                          !m.reply_to &&
                          fileAtts.length > 0 &&
                          fileAtts.every((x) => isAudioAttachment(x))
                        const embedOnly =
                          !m.body?.trim() &&
                          !m.reply_to &&
                          embedAtts.length > 0 &&
                          fileAtts.length === 0
                        if (audioOnly) {
                          return (
                            <div
                              id={`wmsg-${m.id}`}
                              className={cn(
                                'relative flex w-fit max-w-[min(100%,17rem)] flex-col gap-0.5',
                                mine ? 'items-end' : 'items-start',
                              )}
                            >
                              {!mine && activeTeamChannel.kind !== 'dm' && (
                                <p className="px-1 text-[10px] font-semibold opacity-80">{m.sender_name}</p>
                              )}
                              {fileAtts.map((a, ai) => (
                                <VoiceMessage
                                  key={ai}
                                  src={getImageUrl(a.url)}
                                  waveform={a.waveform}
                                  durationSec={a.duration}
                                  mine={mine}
                                  standalone
                                />
                              ))}
                            </div>
                          )
                        }
                        if (embedOnly) {
                          return (
                            <div
                              id={`wmsg-${m.id}`}
                              className="relative flex w-[min(100%,18rem)] flex-col gap-0.5"
                            >
                              {!mine && activeTeamChannel.kind !== 'dm' && (
                                <p className="px-1 text-[10px] font-semibold opacity-80">{m.sender_name}</p>
                              )}
                              <ChatEmbedList attachments={embedAtts} />
                            </div>
                          )
                        }
                        return (
                      <div
                        id={`wmsg-${m.id}`}
                        className={cn(
                          'rounded-xl px-3 py-1.5 text-sm',
                          mine ? 'bg-primary text-primary-foreground' : 'bg-muted',
                        )}
                      >
                        {!mine && activeTeamChannel.kind !== 'dm' && (
                          <p className="mb-0.5 text-[10px] font-semibold opacity-80">{m.sender_name}</p>
                        )}
                        {m.reply_to && (
                          <ReplyQuote
                            reply={m.reply_to}
                            mine={mine}
                            compact
                            onJump={() => {
                              document
                                .getElementById(`wmsg-${m.reply_to!.id}`)
                                ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                            }}
                          />
                        )}
                        {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
                        {embedAtts.length > 0 && (
                          <ChatEmbedList
                            attachments={embedAtts}
                            className={cn(m.body || m.reply_to ? 'mt-1.5' : '')}
                          />
                        )}
                        {attachments.map((a, ai) => {
                          if (isChatEmbed(a) || a.type === 'call' || !a.url) return null
                          const href = getImageUrl(a.url)
                          if (isAudioAttachment(a)) {
                            return (
                              <VoiceMessage
                                key={ai}
                                src={href}
                                waveform={a.waveform}
                                durationSec={a.duration}
                                mine={mine}
                                className={m.body || m.reply_to || embedAtts.length ? 'mt-1' : undefined}                              />
                            )
                          }
                          if ((a.mime_type || '').startsWith('image/')) {
                            return <img key={ai} src={href} alt="" className="mt-1 max-h-40 rounded-lg" />
                          }
                          return (
                            <a key={ai} href={href} target="_blank" rel="noreferrer" className="mt-1 block text-xs underline">
                              {a.name || 'Archivo'}
                            </a>
                          )
                        })}
                      </div>
                        )
                      })()}
                      </MessageReactions>
                      </div>
                    )
                  })
                  )}
                </div>
              </div>
              {teamPending.length > 0 && (
                <div className="space-y-1.5 border-t px-2 pt-2">
                  <ChatEmbedList attachments={teamPending.filter(isChatEmbed)} />
                  <div className="flex flex-wrap gap-1.5">
                    {teamPending.map((a, i) => {
                      if (isChatEmbed(a)) return null
                      return (
                      <div key={`${a.url}-${i}`} className="relative">
                        {(a.mime_type || '').startsWith('image/') ? (
                          <img src={getImageUrl(a.url)} alt="" className="h-12 w-12 rounded object-cover" />
                        ) : (
                          <span className="block max-w-[100px] truncate rounded bg-muted px-2 py-1 text-[10px]">
                            {a.name || 'Archivo'}
                          </span>
                        )}
                        <button
                          type="button"
                          className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                          onClick={() => setTeamPending((prev) => prev.filter((_, j) => j !== i))}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                      )
                    })}
                  </div>
                  {teamPending.some(isChatEmbed) && (
                    <button
                      type="button"
                      className="text-[10px] text-muted-foreground underline"
                      onClick={() => setTeamPending((prev) => prev.filter((a) => !isChatEmbed(a)))}
                    >
                      Quitar adjuntos
                    </button>
                  )}
                </div>
              )}
              {teamReplyTo && (
                <div className="border-t px-2 pt-1.5">
                  <ReplyQuote reply={teamReplyTo} onClear={() => setTeamReplyTo(null)} />
                </div>
              )}
              <form
                className="flex shrink-0 items-center gap-0.5 border-t px-1.5 py-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void sendTeamMessage()
                }}
              >
                <input
                  ref={teamFileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void attachTeamFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                <ComposerExtraActions
                  onAttach={() => teamFileRef.current?.click()}
                  onEmoji={(emoji) => {
                    setTeamDraft((p) => p + emoji)
                    requestAnimationFrame(() => teamComposerRef.current?.focus())
                  }}
                  onVoiceReady={async (file) => {
                    if (!teamChannelId) return
                    setTeamSending(true)
                    try {
                      const { data } = await api.post(`/internal-chat/channels/${teamChannelId}/messages`, {
                        body: '',
                        attachments: [file],
                      })
                      const msg = data.message as TeamChatMessage
                      setTeamMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
                    } finally {
                      setTeamSending(false)
                      requestAnimationFrame(() => teamComposerRef.current?.focus())
                    }
                  }}
                  voiceDisabled={teamSending}
                />
                <input
                  ref={teamComposerRef}
                  value={teamDraft}
                  onChange={(e) => setTeamDraft(e.target.value)}
                  onPaste={handleTeamPaste}
                  placeholder="Escribe un mensaje…"
                  className="min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  type="submit"
                  disabled={(!teamDraft.trim() && teamPending.length === 0) || teamSending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              {teamLoading ? (
                <ul className="divide-y" aria-busy="true" aria-label="Cargando conversaciones">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <Skeleton className="size-9 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Skeleton className="h-3.5 w-28" />
                          <Skeleton className="h-3 w-8" />
                        </div>
                        <Skeleton className={cn('h-3', i % 2 === 0 ? 'w-[85%]' : 'w-[60%]')} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="divide-y">
                  <li>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60"
                      onClick={() => setTeamChannelId(ABY_CHANNEL_ID)}
                    >
                      <Mascot skin={mascotSkin} size={36} state={mascotState} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{mascotName || 'Aby'}</p>
                        <p className="truncate text-xs text-muted-foreground">Asistente de IA</p>
                      </div>
                    </button>
                  </li>
                  {teamChannels.map((ch) => {
                    const live = ch.dm_user ? presenceByUserId[ch.dm_user.id] : undefined
                    const online = live?.online ?? !!ch.dm_user?.online
                    return (
                    <li key={ch.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60"
                        onClick={() => setTeamChannelId(ch.id)}
                      >
                        <ChannelAvatar channel={ch} size="sm" online={ch.kind === 'dm' ? online : undefined} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-medium">{channelDisplayName(ch)}</p>
                            {ch.unread > 0 && (
                              <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                                {ch.unread}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {messagePreviewText(ch.last_message) || 'Sin mensajes'}
                          </p>
                        </div>
                      </button>
                    </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
    </>
  )
}

