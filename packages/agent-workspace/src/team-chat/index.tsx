import { lazy, Suspense, useState, useEffect, useCallback, useRef, useMemo, type ClipboardEvent } from 'react'
import { Fragment } from 'react/jsx-runtime'
import { useTranslation } from 'react-i18next'
import { useWorkspacePlatformConfig } from '../host'
import { format, formatDistanceToNow } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import {
  ArrowLeft,
  MessageSquarePlus,
  Search as SearchIcon,
  Send,
  MessagesSquare,
  Phone,
  Video,
  ScreenShare,
  Paperclip,
  FileIcon,
  Hash,
} from 'lucide-react'

import { api } from '../host'
import { cn } from '@asteby/metacore-ui'
import { getImageUrl } from '@asteby/metacore-starter-core'
import { useWorkspaceUser } from '../host'
import { useWebSocketContext, type WSEvent } from '../host'
import { Button } from '@asteby/metacore-ui'
import { ScrollArea } from '@asteby/metacore-ui'
import { Skeleton } from '@asteby/metacore-ui'
import { toast } from 'sonner'

import {
  type TeamChatChannel,
  type TeamChatMessage,
  type ChatAttachment,
  type MessageReplyPreview,
  parseAttachments,
  callEventFromMessage,
  messagePreviewText,
  isAudioAttachment,
} from './data/types'
import { ChatListItem } from './components/chat-list-item'
import { ChannelAvatar, channelDisplayName } from './components/channel-avatar'
import { NewMessageDialog } from './components/new-message-dialog'
import { CreateChannelDialog } from './components/create-channel-dialog'
import { MessageReactions } from './components/message-reactions'
import { CallEventBubble } from './components/call-event-bubble'
import { ChatEmbedList, isChatEmbed } from './components/chat-embed-card'
import { ComposerExtraActions } from './components/composer-extra-actions'
import { VoiceMessage } from './components/voice-message'
import { ReplyQuote } from './components/reply-quote'
import { useCall } from './call-provider'
import type { CallKind } from '../lib/chrome-media'
import { ABY_CHANNEL_ID, consumeTeamDraft, registerAbyInboxOpener, registerTeamChatInboxOpener } from '../lib/aby-widget'
import { rememberAbyFocus, rememberTeamChannel } from '../lib/chat-context'
import { Mascot } from '../workspace/mascot'
import { useMascotFaceStore } from '../lib/mascot-face-store'
const AbyChatPane = lazy(() =>
  import('../workspace/aby-chat-pane').then((m) => ({ default: m.AbyChatPane })),
)

const WS_EVENT = 'INTERNAL_CHAT_MESSAGE'
const WS_REACTION = 'INTERNAL_CHAT_REACTION'

export function TeamChat() {
  const { t, i18n } = useTranslation()
  const { mascot_name: mascotName, mascot_skin: mascotSkin } = useWorkspacePlatformConfig()
  const mascotState = useMascotFaceStore((s) => s.state)
  const locale = i18n.language?.startsWith('es') ? es : enUS
  const currentUser = useWorkspaceUser()
  const {
    subscribe,
    setActiveTeamChatChannelId,
    presenceByUserId,
  } = useWebSocketContext()
  const { startCall: startWebRTCCall, joinCall: joinWebRTCCall, session: callSession } = useCall()

  const [channels, setChannels] = useState<TeamChatChannel[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<TeamChatMessage[]>([])
  const [loadingChannels, setLoadingChannels] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [createChannelOpen, setCreateChannelOpen] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<ChatAttachment[]>([])
  const [replyTo, setReplyTo] = useState<MessageReplyPreview | null>(null)

  const activeIdRef = useRef<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  /** Jump to bottom without animation after opening a channel. */
  const pendingOpenRef = useRef(false)
  /** Keep pinned to latest while user hasn't scrolled up. */
  const stickBottomRef = useRef(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  activeIdRef.current = activeId

  const showAby = activeId === ABY_CHANNEL_ID
  const youLabel = t('team_chat.you', 'Tú')

  useEffect(() => {
    return registerAbyInboxOpener(() => setActiveId(ABY_CHANNEL_ID))
  }, [])

  useEffect(() => {
    return registerTeamChatInboxOpener((opts) => {
      const draft = consumeTeamDraft() || opts
      if (draft?.channelId) setActiveId(draft.channelId)
      if (draft?.message) {
        setDraft((prev) => (prev ? `${prev} ${draft.message}` : draft.message!).trim())
      }
      if (draft?.attachments?.length) {
        setPendingFiles((prev) => [...prev, ...draft.attachments!])
      }
      requestAnimationFrame(() => composerRef.current?.focus())
    })
  }, [])

  const activeChannel = useMemo(
    () => (showAby ? null : channels.find((c) => c.id === activeId) ?? null),
    [channels, activeId, showAby],
  )

  useEffect(() => {
    if (activeId === ABY_CHANNEL_ID) rememberAbyFocus()
    else if (activeId) rememberTeamChannel(activeId)
  }, [activeId])

  const dmPresence = useMemo(() => {
    if (!activeChannel?.dm_user) return null
    const live = presenceByUserId[activeChannel.dm_user.id]
    const online = live?.online ?? !!activeChannel.dm_user.online
    const lastSeen = live?.last_seen || activeChannel.dm_user.last_seen_at || null
    return { online, lastSeen }
  }, [activeChannel, presenceByUserId])

  const loadChannels = useCallback(async () => {
    try {
      const { data } = await api.get('/internal-chat/channels')
      const list: TeamChatChannel[] = data.channels ?? []
      setChannels(list)
      return list
    } catch {
      toast.error(t('team_chat.load_error', 'No se pudieron cargar los canales'))
      return [] as TeamChatChannel[]
    } finally {
      setLoadingChannels(false)
    }
  }, [t])

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

  // Refresh active_call badges after focus / WS recovery so "Unirse" appears post-relogin.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadChannels()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    const t = window.setInterval(() => void loadChannels(), 15000)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      window.clearInterval(t)
    }
  }, [loadChannels])

  const markRead = useCallback(async (channelId: string) => {
    setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, unread: 0 } : c)))
    try {
      await api.post(`/internal-chat/channels/${channelId}/read`)
    } catch {
      /* non-fatal */
    }
  }, [])

  // Load messages when the active channel changes.
  useEffect(() => {
    if (!activeId || activeId === ABY_CHANNEL_ID) {
      setMessages([])
      setLoadingMessages(false)
      setReplyTo(null)
      return
    }
    setReplyTo(null)
    pendingOpenRef.current = true
    stickBottomRef.current = true
    let cancelled = false
    setLoadingMessages(true)
    setMessages([])
    api
      .get(`/internal-chat/channels/${activeId}/messages`)
      .then(({ data }) => {
        if (cancelled) return
        setMessages(((data.messages ?? []) as TeamChatMessage[]).slice().reverse())
        markRead(activeId)
      })
      .catch(() => {
        if (!cancelled) toast.error(t('team_chat.messages_error', 'No se pudieron cargar los mensajes'))
      })
      .finally(() => !cancelled && setLoadingMessages(false))
    return () => {
      cancelled = true
    }
  }, [activeId, markRead, t])

  // Tell the global WS notifier which channel is focused so toasts fire for
  // other threads (and clear when leaving this page / clearing selection).
  useEffect(() => {
    setActiveTeamChatChannelId(activeId && activeId !== ABY_CHANNEL_ID ? activeId : null)
    return () => setActiveTeamChatChannelId(null)
  }, [activeId, setActiveTeamChatChannelId])

  // Realtime: append incoming messages, or bump unread on inactive channels.
  useEffect(() => {
    const unsub = subscribe(WS_EVENT, (evt: WSEvent) => {
      const msg = evt.payload as TeamChatMessage
      if (!msg?.channel_id) return
      if (msg.channel_id === activeIdRef.current) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
        markRead(msg.channel_id)
        setChannels((prev) =>
          prev.map((c) => (c.id === msg.channel_id ? { ...c, last_message: msg } : c)),
        )
      } else {
        let known = false
        setChannels((prev) => {
          const next = prev.map((c) => {
            if (c.id !== msg.channel_id) return c
            known = true
            return { ...c, unread: c.unread + 1, last_message: msg }
          })
          return next
        })
        setTimeout(() => {
          if (!known) loadChannels()
        }, 0)
      }
    })
    return unsub
  }, [subscribe, markRead, loadChannels])

  useEffect(() => {
    return subscribe(WS_REACTION, (evt: WSEvent) => {
      const p = evt.payload as {
        message_id?: string
        channel_id?: string
        reactions?: TeamChatMessage['reactions']
      }
      if (!p?.message_id || p.channel_id !== activeIdRef.current) return
      setMessages((prev) =>
        prev.map((m) =>
          m.id === p.message_id ? { ...m, reactions: p.reactions ?? [] } : m,
        ),
      )
    })
  }, [subscribe])

  // Merge PRESENCE_UPDATE into DM channel rows.
  useEffect(() => {
    return subscribe('PRESENCE_UPDATE', (evt: WSEvent) => {
      const p = evt.payload as { user_id?: string; online?: boolean; last_seen?: string }
      if (!p?.user_id) return
      setChannels((prev) =>
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

  // Pin to latest: instant on channel open (no smooth scroll animation).
  // Live messages only follow if the user hasn't scrolled up.
  useEffect(() => {
    if (loadingMessages) return
    const el = listRef.current
    if (!el) return
    const jump = () => {
      el.scrollTop = el.scrollHeight
    }
    if (pendingOpenRef.current || stickBottomRef.current) {
      jump()
      // Layout may settle after images/voice notes mount.
      requestAnimationFrame(jump)
      pendingOpenRef.current = false
    }
  }, [messages, loadingMessages, activeId])

  const onMessagesScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96
  }, [])
  const send = useCallback(async () => {
    const body = draft.trim()
    if ((!body && pendingFiles.length === 0) || !activeId || sending) return
    setSending(true)
    setDraft('')
    const files = pendingFiles
    const replying = replyTo
    setPendingFiles([])
    setReplyTo(null)
    // Own sends always pin to latest (even if user had scrolled up).
    stickBottomRef.current = true
    try {
      const payload: {
        body: string
        attachments?: ChatAttachment[]
        reply_to_id?: string
      } = { body }
      if (files.length) payload.attachments = files
      if (replying?.id) payload.reply_to_id = replying.id
      const { data } = await api.post(`/internal-chat/channels/${activeId}/messages`, payload)
      const msg = data.message as TeamChatMessage
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
      setChannels((prev) =>
        prev.map((c) => (c.id === activeId ? { ...c, last_message: msg } : c)),
      )
    } catch {
      toast.error(t('team_chat.send_error', 'No se pudo enviar el mensaje'))
      setDraft(body)
      setPendingFiles(files)
      if (replying) setReplyTo(replying)
    } finally {
      setSending(false)
      // Keep typing: disabling the textarea during send steals focus.
      requestAnimationFrame(() => {
        const el = composerRef.current
        if (!el) return
        el.focus()
        el.style.height = 'auto'
        el.style.height = Math.min(el.scrollHeight, 128) + 'px'
        // Composer height change can grow the list viewport after the message paint.
        if (stickBottomRef.current && listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight
        }
      })
    }
  }, [draft, activeId, sending, pendingFiles, replyTo, t])

  const sendAttachments = useCallback(
    async (files: ChatAttachment[], body = '') => {
      if (!activeId || (!body && files.length === 0)) return
      setSending(true)
      const replying = replyTo
      setReplyTo(null)
      stickBottomRef.current = true
      try {
        const payload: {
          body: string
          attachments: ChatAttachment[]
          reply_to_id?: string
        } = { body, attachments: files }
        if (replying?.id) payload.reply_to_id = replying.id
        const { data } = await api.post(`/internal-chat/channels/${activeId}/messages`, payload)
        const msg = data.message as TeamChatMessage
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
        setChannels((prev) =>
          prev.map((c) => (c.id === activeId ? { ...c, last_message: msg } : c)),
        )
      } catch {
        toast.error(t('team_chat.send_error', 'No se pudo enviar el mensaje'))
        setPendingFiles((prev) => [...prev, ...files])
        if (replying) setReplyTo(replying)
      } finally {
        setSending(false)
        requestAnimationFrame(() => {
          if (stickBottomRef.current && listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight
          }
        })
      }
    },
    [activeId, replyTo, t],
  )

  const startReply = useCallback((m: TeamChatMessage) => {
    const previewBody =
      m.body?.trim() ||
      messagePreviewText(m) ||
      'Mensaje'
    setReplyTo({
      id: m.id,
      sender_id: m.sender_id,
      sender_name: m.sender_name,
      body: previewBody,
    })
    requestAnimationFrame(() => composerRef.current?.focus())
  }, [])

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      try {
        const { data } = await api.post(`/internal-chat/messages/${messageId}/reactions`, {
          emoji,
        })
        if (data?.reactions) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, reactions: data.reactions } : m,
            ),
          )
        }
      } catch {
        toast.error(t('team_chat.reaction_error', 'No se pudo reaccionar'))
      }
    },
    [t],
  )

  const attachFiles = useCallback(async (fileList: FileList | File[] | null) => {
    if (!fileList || (Array.isArray(fileList) ? fileList.length === 0 : fileList.length === 0)) return
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
        toast.error(t('team_chat.upload_error', 'No se pudo subir el archivo'))
      }
    }
    if (uploaded.length) setPendingFiles((prev) => [...prev, ...uploaded])
  }, [t])

  const handleComposerPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const dt = e.clipboardData
      if (!dt) return
      const files: File[] = []
      for (const item of Array.from(dt.items || [])) {
        if (item.kind !== 'file') continue
        const f = item.getAsFile()
        if (!f) continue
        if (
          f.type.startsWith('image/') ||
          f.type.startsWith('video/') ||
          f.type.startsWith('audio/')
        ) {
          files.push(f)
        }
      }
      if (!files.length && dt.files?.length) {
        for (const f of Array.from(dt.files)) {
          if (
            f.type.startsWith('image/') ||
            f.type.startsWith('video/') ||
            f.type.startsWith('audio/')
          ) {
            files.push(f)
          }
        }
      }
      if (!files.length) return
      e.preventDefault()
      void attachFiles(files)
    },
    [attachFiles],
  )

  const startCall = useCallback(
    (kind: CallKind) => {
      if (!activeChannel) return
      if (callSession) {
        toast.message('Ya hay una llamada activa')
        return
      }
      void startWebRTCCall({
        channelId: activeChannel.id,
        kind,
        title: channelDisplayName(activeChannel),
      })
    },
    [activeChannel, callSession, startWebRTCCall],
  )

  const joinActiveCall = useCallback(() => {
    if (!activeChannel?.active_call || callSession) return
    void joinWebRTCCall({
      callId: activeChannel.active_call.id,
      channelId: activeChannel.id,
      kind: (activeChannel.active_call.kind as CallKind) || 'audio',
      title: channelDisplayName(activeChannel),
    })
  }, [activeChannel, callSession, joinWebRTCCall])

  // A DM was created/opened from the compose dialog: merge it into the inbox
  // (idempotent) and make it the active conversation.
  const handleDMOpened = useCallback((channel: TeamChatChannel) => {
    setChannels((prev) => {
      const exists = prev.some((c) => c.id === channel.id)
      return exists ? prev.map((c) => (c.id === channel.id ? { ...c, ...channel } : c)) : [channel, ...prev]
    })
    setActiveId(channel.id)
  }, [])

  const filteredChannels = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return channels
    return channels.filter((c) => channelDisplayName(c).toLowerCase().includes(q))
  }, [channels, search])

  const headerSubtitle = (() => {
    if (!activeChannel) return ''
    if (activeChannel.kind === 'dm') {
      if (dmPresence?.online) return t('team_chat.online', 'En línea')
      if (dmPresence?.lastSeen) {
        return t('team_chat.last_seen', 'Última conexión {{when}}', {
          when: formatDistanceToNow(new Date(dmPresence.lastSeen), { locale, addSuffix: true }),
        })
      }
      return activeChannel.dm_user?.email || t('team_chat.direct_message', 'Mensaje directo')
    }
    return activeChannel.description || t('team_chat.channel', 'Canal')
  })()

  const groupedMessages = useMemo(() => {
    const groups: Record<string, TeamChatMessage[]> = {}
    for (const m of messages) {
      const key = format(new Date(m.created_at), 'PP', { locale })
      ;(groups[key] ??= []).push(m)
    }
    return groups
  }, [messages, locale])

  const isChannel = activeChannel && activeChannel.kind !== 'dm'

  return (
    <>
      <div className='flex h-full min-h-0 flex-col px-4 pt-2 pb-2 sm:px-6 sm:pt-6'>
        <section className='flex min-h-0 flex-1 gap-6'>
          <div className='relative flex w-full min-h-0 flex-1 flex-col gap-2 overflow-hidden sm:w-56 sm:flex-none lg:w-72 2xl:w-80'>
            {/* No sticky on mobile: top-16 under the SDK header left a huge empty gap.
                Title/search stay pinned via flex; only the channel list scrolls. */}
            <div className='shrink-0 -mx-4 bg-background px-4 pb-2 sm:mx-0 sm:p-0'>
              <div className='flex items-center justify-between py-1.5 sm:py-2'>
                <div className='flex gap-2'>
                  <h1 className='text-2xl font-bold'>{t('team_chat.title', 'Mensajes')}</h1>
                  <MessagesSquare size={20} />
                </div>
                <div className='flex items-center gap-0.5'>
                  <Button
                    size='icon'
                    variant='ghost'
                    onClick={() => setCreateChannelOpen(true)}
                    className='rounded-lg'
                    title={t('team_chat.create_channel', 'Nuevo canal')}
                  >
                    <Hash size={22} className='stroke-muted-foreground' />
                  </Button>
                  <Button
                    size='icon'
                    variant='ghost'
                    onClick={() => setComposeOpen(true)}
                    className='rounded-lg'
                    title={t('team_chat.new_message', 'Nuevo mensaje')}
                  >
                    <MessageSquarePlus size={24} className='stroke-muted-foreground' />
                  </Button>
                </div>
              </div>

              <label
                className={cn(
                  'focus-within:ring-ring focus-within:ring-1 focus-within:outline-hidden',
                  'border-border flex h-10 w-full items-center space-x-0 rounded-md border ps-2',
                )}
              >
                <SearchIcon size={15} className='me-2 stroke-slate-500' />
                <span className='sr-only'>{t('team_chat.search', 'Buscar')}</span>
                <input
                  type='text'
                  className='w-full flex-1 bg-inherit text-sm focus-visible:outline-hidden'
                  placeholder={t('team_chat.search_placeholder', 'Buscar conversación…')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>

            <ScrollArea className='-mx-3 min-h-0 flex-1 p-3'>
              {loadingChannels ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className='mb-1 flex items-center gap-3 rounded-lg px-2.5 py-2'>
                    <Skeleton className='size-10 shrink-0 rounded-lg' />
                    <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
                      <div className='flex items-center justify-between gap-2'>
                        <Skeleton className='h-3.5 w-28' />
                        <Skeleton className='h-3 w-8' />
                      </div>
                      <Skeleton className='h-3 w-full max-w-[85%]' />
                    </div>
                  </div>
                ))
              ) : (
                <>
                  {(!search.trim() ||
                    'aby'.includes(search.trim().toLowerCase()) ||
                    'asistente'.includes(search.trim().toLowerCase())) && (
                    <button
                      type='button'
                      onClick={() => setActiveId(ABY_CHANNEL_ID)}
                      className={cn(
                        'group mb-1 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                        'hover:bg-accent hover:text-accent-foreground',
                        showAby && 'bg-muted',
                      )}
                    >
                      <Mascot skin={mascotSkin} size={40} state={mascotState} />
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-center gap-2'>
                          <span className='flex-1 truncate text-sm font-semibold'>{mascotName || 'Aby'}</span>
                        </div>
                        <div className='flex items-center gap-2'>
                          <span className='text-muted-foreground line-clamp-1 flex-1 text-ellipsis text-xs'>
                            {t('team_chat.aby_preview', 'Asistente de IA')}
                          </span>
                        </div>
                      </div>
                    </button>
                  )}
                  {filteredChannels.length === 0 && search.trim() &&
                  !('aby'.includes(search.trim().toLowerCase()) ||
                    'asistente'.includes(search.trim().toLowerCase())) ? (
                    <div className='flex flex-col items-center justify-center gap-1 py-10 text-center text-sm text-muted-foreground'>
                      {t('team_chat.no_results', 'Sin resultados para tu búsqueda')}
                    </div>
                  ) : (
                    filteredChannels.map((ch) => {
                      const live = ch.dm_user ? presenceByUserId[ch.dm_user.id] : undefined
                      const online = live?.online ?? !!ch.dm_user?.online
                      return (
                        <ChatListItem
                          key={ch.id}
                          channel={ch}
                          isSelected={activeId === ch.id}
                          currentUserId={currentUser?.id}
                          youLabel={youLabel}
                          locale={locale}
                          online={online}
                          onSelect={(c) => setActiveId(c.id)}
                        />
                      )
                    })
                  )}
                </>
              )}
            </ScrollArea>
          </div>

          {showAby ? (
            <div
              className={cn(
                // Mobile: own the viewport above app chrome so back/X aren't covered.
                'bg-background fixed inset-0 z-[110] flex w-full flex-col border shadow-xs',
                'sm:static sm:inset-auto sm:z-auto sm:flex-1 sm:rounded-md',
              )}
              style={{
                paddingTop: 'env(safe-area-inset-top, 0px)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }}
            >
              <div className='bg-card mb-1 flex flex-none items-center justify-between gap-2 p-4 shadow-lg sm:rounded-t-md'>
                <div className='flex min-w-0 gap-3'>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='-ms-2 size-11 shrink-0 sm:hidden'
                    onClick={() => setActiveId(null)}
                    title={t('common.back', 'Volver')}
                    aria-label={t('common.back', 'Volver')}
                  >
                    <ArrowLeft className='rtl:rotate-180' />
                  </Button>
                  <div className='flex min-w-0 items-center gap-2 lg:gap-4'>
                    <Mascot skin={mascotSkin} size={40} state={mascotState} />
                    <div className='min-w-0'>
                      <span className='block truncate text-sm font-medium lg:text-base'>{mascotName || 'Aby'}</span>
                      <p className='text-muted-foreground truncate text-xs'>
                        {t('team_chat.aby_subtitle', 'Asistente de IA')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <Suspense fallback={null}>
                <AbyChatPane className='min-h-0 flex-1' />
              </Suspense>
            </div>
          ) : activeChannel ? (
            <div
              className={cn(
                'bg-background fixed inset-0 z-[110] flex w-full flex-col border shadow-xs',
                'sm:static sm:inset-auto sm:z-auto sm:flex sm:flex-1 sm:rounded-md',
              )}
              style={{
                paddingTop: 'env(safe-area-inset-top, 0px)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }}
            >
              <div className='bg-card mb-1 flex flex-none items-center justify-between gap-2 p-4 shadow-lg sm:rounded-t-md'>
                <div className='flex min-w-0 gap-3'>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='-ms-2 size-11 shrink-0 sm:hidden'
                    onClick={() => setActiveId(null)}
                    title={t('common.back', 'Volver')}
                    aria-label={t('common.back', 'Volver')}
                  >
                    <ArrowLeft className='rtl:rotate-180' />
                  </Button>
                  <div className='flex min-w-0 items-center gap-2 lg:gap-4'>
                    <ChannelAvatar
                      channel={activeChannel}
                      size='md'
                      online={activeChannel.kind === 'dm' ? !!dmPresence?.online : undefined}
                    />
                    <div className='min-w-0'>
                      <span className='block truncate text-sm font-medium lg:text-base'>
                        {channelDisplayName(activeChannel)}
                      </span>
                      <p
                        className={cn(
                          'truncate text-xs',
                          dmPresence?.online ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {headerSubtitle}
                      </p>
                    </div>
                  </div>
                </div>
                <div className='flex shrink-0 items-center gap-0.5'>
                  {activeChannel.active_call && !callSession && (
                    <Button
                      size='sm'
                      variant='default'
                      className='mr-1 h-8 gap-1.5 rounded-lg'
                      title='Unirse a la llamada'
                      onClick={joinActiveCall}
                    >
                      <Phone className='size-3.5' />
                      Unirse
                    </Button>
                  )}
                  <Button
                    size='icon'
                    variant='ghost'
                    className='rounded-lg'
                    title={t('team_chat.audio_call', 'Llamada de audio')}
                    onClick={() => startCall('audio')}
                  >
                    <Phone className='size-4' />
                  </Button>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='rounded-lg'
                    title={t('team_chat.video_call', 'Videollamada')}
                    onClick={() => startCall('video')}
                  >
                    <Video className='size-4' />
                  </Button>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='rounded-lg'
                    title={t('team_chat.screen_share', 'Compartir pantalla')}
                    onClick={() => startCall('screen')}
                  >
                    <ScreenShare className='size-4' />
                  </Button>
                </div>
              </div>

              <div className='flex min-h-0 flex-1 flex-col gap-2 rounded-md px-4 pt-0'>
                <div className='flex min-h-0 flex-1 flex-col'>
                  <div className='relative -me-4 flex min-h-0 flex-1 flex-col overflow-y-hidden'>
                    <div
                      ref={listRef}
                      onScroll={onMessagesScroll}
                      className='flex min-h-0 w-full grow flex-col justify-start gap-4 overflow-y-auto py-2 pe-4 pb-2'
                    >
                      {loadingMessages ? (
                        <div className='mt-auto flex flex-col gap-3 p-2'>
                          {[
                            { side: 'end', w: 'w-[55%]' },
                            { side: 'start', w: 'w-[62%]' },
                            { side: 'end', w: 'w-[40%]' },
                            { side: 'start', w: 'w-[70%]' },
                            { side: 'end', w: 'w-[48%]' },
                          ].map((row, i) => (
                            <div
                              key={i}
                              className={cn(
                                'flex flex-col gap-1',
                                row.side === 'end' ? 'items-end self-end' : 'items-start self-start',
                                row.w,
                              )}
                            >
                              <Skeleton
                                className={cn(
                                  'h-11 w-full',
                                  row.side === 'end'
                                    ? 'rounded-[16px_16px_0_16px] bg-primary/15'
                                    : 'rounded-[16px_16px_16px_0] bg-muted',
                                )}
                              />
                            </div>
                          ))}
                        </div>
                      ) : messages.length === 0 ? (
                        <div className='m-auto flex flex-col items-center gap-2 text-center text-sm text-muted-foreground'>
                          <MessagesSquare className='size-8 opacity-40' />
                          <p>{t('team_chat.empty', 'Aún no hay mensajes. ¡Saluda al equipo!')}</p>
                        </div>
                      ) : (
                        Object.keys(groupedMessages).map((day) => (
                          <Fragment key={day}>
                            <div className='sticky top-2 z-20 flex justify-center py-2'>
                              <span className='bg-secondary/80 text-secondary-foreground rounded-full px-3 py-1 text-xs font-medium shadow-xs backdrop-blur-md'>
                                {day}
                              </span>
                            </div>
                            {groupedMessages[day].map((m, index) => {
                              const mine = m.sender_id === currentUser?.id
                              const prev = groupedMessages[day][index - 1]
                              const showSender = isChannel && !mine && (!prev || prev.sender_id !== m.sender_id)
                              const attachments = parseAttachments(m.attachments)
                              const callEvt = callEventFromMessage(m)
                              if (callEvt) {
                                return (
                                  <div
                                    key={m.id}
                                    className={cn(
                                      'flex w-fit max-w-[min(100%,17rem)] flex-col md:max-w-md',
                                      mine ? 'items-stretch self-end' : 'items-stretch self-start',
                                    )}
                                  >
                                    <CallEventBubble
                                      call={callEvt}
                                      label={m.body || 'Llamada'}
                                      mine={mine}
                                      onCallback={
                                        !mine
                                          ? (kind) => startCall(kind)
                                          : undefined
                                      }
                                    />
                                    <span className='mt-0.5 px-1 text-[10px] text-muted-foreground'>
                                      {format(new Date(m.created_at), 'p', { locale })}
                                    </span>
                                  </div>
                                )
                              }
                              const embedAtts = attachments.filter(isChatEmbed)
                              const fileAtts = attachments.filter(
                                (a) => !isChatEmbed(a) && a.type !== 'call' && a.url,
                              )
                              const audioOnly =
                                !m.body?.trim() &&
                                !m.reply_to &&
                                fileAtts.length > 0 &&
                                fileAtts.every((a) => isAudioAttachment(a))
                              const embedOnly =
                                !m.body?.trim() &&
                                !m.reply_to &&
                                embedAtts.length > 0 &&
                                fileAtts.length === 0
                              return (
                                <div
                                  key={m.id}
                                  id={`msg-${m.id}`}
                                  className={cn(
                                    'flex flex-col scroll-mt-16',
                                    audioOnly
                                      ? 'w-fit max-w-[min(100%,17rem)]'
                                      : embedOnly
                                        ? 'w-[min(100%,18rem)]'
                                        : 'max-w-[85%] md:max-w-md',
                                    mine
                                      ? audioOnly
                                        ? 'items-end self-end'
                                        : 'items-stretch self-end'
                                      : audioOnly
                                        ? 'items-start self-start'
                                        : 'items-stretch self-start',
                                  )}
                                >
                                <MessageReactions
                                  reactions={m.reactions}
                                  align={mine ? 'end' : 'start'}
                                  onToggle={(emoji) => void toggleReaction(m.id, emoji)}
                                  onReply={() => startReply(m)}
                                >
                                {audioOnly ? (
                                  <div
                                    className={cn(
                                      'relative flex w-fit max-w-full flex-col gap-0.5',
                                      mine ? 'items-end' : 'items-start',
                                    )}
                                  >
                                    {showSender && (
                                      <p className='mb-0.5 px-1 text-[11px] font-semibold text-primary'>
                                        {m.sender_name}
                                      </p>
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
                                    <span
                                      className={cn(
                                        'px-1 text-[10px] text-muted-foreground',
                                        mine ? 'self-end text-right' : 'self-start text-left',
                                      )}
                                    >
                                      {format(new Date(m.created_at), 'p', { locale })}
                                    </span>
                                  </div>
                                ) : embedOnly ? (
                                  <div className='relative flex w-full flex-col items-stretch gap-0.5'>
                                    {showSender && (
                                      <p className='mb-0.5 px-1 text-[11px] font-semibold text-primary'>
                                        {m.sender_name}
                                      </p>
                                    )}
                                    <ChatEmbedList attachments={embedAtts} />
                                    <span className='px-1 text-right text-[10px] text-muted-foreground'>
                                      {format(new Date(m.created_at), 'p', { locale })}
                                    </span>
                                  </div>
                                ) : (
                                <div
                                  className={cn(
                                    'chat-box relative w-full whitespace-pre-wrap break-words px-3 py-2 shadow-lg',
                                    mine
                                      ? 'bg-primary/90 text-primary-foreground rounded-[16px_16px_0_16px]'
                                      : 'bg-muted rounded-[16px_16px_16px_0]',
                                  )}
                                >
                                  {showSender && (
                                    <p className='mb-0.5 text-[11px] font-semibold text-primary'>
                                      {m.sender_name}
                                    </p>
                                  )}
                                  {m.reply_to && (
                                    <ReplyQuote
                                      reply={m.reply_to}
                                      mine={mine}
                                      onJump={() => {
                                        document
                                          .getElementById(`msg-${m.reply_to!.id}`)
                                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                      }}
                                    />
                                  )}
                                  {m.body ? <p className='text-sm leading-snug'>{m.body}</p> : null}
                                  {embedAtts.length > 0 && (
                                    <ChatEmbedList
                                      attachments={embedAtts}
                                      className={cn(m.body || m.reply_to ? 'mt-2' : '')}
                                    />
                                  )}
                                  {fileAtts.length > 0 && (
                                    <div className={cn('flex flex-col gap-2', m.body || m.reply_to || embedAtts.length ? 'mt-2' : '')}>
                                      {fileAtts.map((a, ai) => {
                                        const isImage = (a.mime_type || '').startsWith('image/')
                                        const isVideo = (a.mime_type || '').startsWith('video/')
                                        const isAudio = isAudioAttachment(a)
                                        const href = getImageUrl(a.url)
                                        if (isImage) {
                                          return (
                                            <a key={ai} href={href} target='_blank' rel='noreferrer'>
                                              <img
                                                src={href}
                                                alt={a.name || 'adjunto'}
                                                className='max-h-48 max-w-full rounded-lg object-cover'
                                              />
                                            </a>
                                          )
                                        }
                                        if (isVideo) {
                                          return (
                                            <video
                                              key={ai}
                                              src={href}
                                              controls
                                              className='max-h-56 max-w-full rounded-lg'
                                            />
                                          )
                                        }
                                        if (isAudio) {
                                          return (
                                            <VoiceMessage
                                              key={ai}
                                              src={href}
                                              waveform={a.waveform}
                                              durationSec={a.duration}
                                              mine={mine}
                                            />
                                          )
                                        }
                                        return (
                                          <a
                                            key={ai}
                                            href={href}
                                            target='_blank'
                                            rel='noreferrer'
                                            className={cn(
                                              'inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs underline-offset-2 hover:underline',
                                              mine ? 'bg-primary-foreground/10' : 'bg-background/60',
                                            )}
                                          >
                                            <FileIcon className='size-3.5 shrink-0' />
                                            <span className='truncate'>{a.name || 'Archivo'}</span>
                                          </a>
                                        )
                                      })}
                                    </div>
                                  )}
                                  <span
                                    className={cn(
                                      'mt-0.5 block text-right text-[10px]',
                                      mine ? 'text-primary-foreground/60' : 'text-muted-foreground',
                                    )}
                                  >
                                    {format(new Date(m.created_at), 'p', { locale })}
                                  </span>
                                </div>
                                )}
                                </MessageReactions>
                                </div>
                              )
                            })}
                          </Fragment>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {replyTo && (
                  <div className='border-border bg-muted/40 mb-1 rounded-lg border px-1 py-1'>
                    <ReplyQuote reply={replyTo} onClear={() => setReplyTo(null)} />
                  </div>
                )}

                {pendingFiles.length > 0 && (
                  <div className='space-y-1.5 pb-1'>
                    <ChatEmbedList attachments={pendingFiles.filter(isChatEmbed)} />
                    <div className='flex flex-wrap gap-2'>
                      {pendingFiles.map((f, i) => {
                        if (isChatEmbed(f)) return null
                        const href = getImageUrl(f.url)
                        const isImage = (f.mime_type || '').startsWith('image/')
                        return (
                          <div
                            key={`${f.url}-${i}`}
                            className='group relative inline-flex overflow-hidden rounded-lg border bg-muted/40'
                          >
                            {isImage ? (
                              <img
                                src={href}
                                alt={f.name || 'imagen'}
                                className='size-16 object-cover'
                              />
                            ) : (
                              <span className='inline-flex max-w-[160px] items-center gap-1.5 px-2 py-1.5 text-[11px]'>
                                <Paperclip className='size-3.5 shrink-0' />
                                <span className='truncate'>{f.name || 'archivo'}</span>
                              </span>
                            )}
                            <button
                              type='button'
                              className='absolute end-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-background/90 text-xs text-muted-foreground shadow-sm hover:text-foreground'
                              title='Quitar'
                              onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    {pendingFiles.some(isChatEmbed) && (
                      <button
                        type='button'
                        className='text-[10px] text-muted-foreground underline'
                        onClick={() => setPendingFiles((prev) => prev.filter((a) => !isChatEmbed(a)))}
                      >
                        Quitar adjuntos
                      </button>
                    )}
                  </div>
                )}

                <form
                  className='flex w-full flex-none gap-2 pb-3'
                  onSubmit={(e) => {
                    e.preventDefault()
                    send()
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type='file'
                    className='hidden'
                    multiple
                    accept='image/*,video/*,.pdf,.doc,.docx,.txt,.xls,.xlsx,.csv'
                    onChange={(e) => {
                      void attachFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  <div className='border-input bg-card focus-within:ring-ring flex flex-1 items-center gap-1 rounded-md border px-2 focus-within:ring-1 focus-within:outline-hidden'>
                    <ComposerExtraActions
                      onAttach={() => fileInputRef.current?.click()}
                      onEmoji={(emoji) => {
                        setDraft((prev) => prev + emoji)
                        requestAnimationFrame(() => composerRef.current?.focus())
                      }}
                      onVoiceReady={(file) => void sendAttachments([file], '')}
                      voiceDisabled={sending}
                      attachTitle={t('team_chat.attach', 'Adjuntar')}
                    />
                    <label className='flex min-h-8 min-w-0 flex-1 items-center self-stretch py-1'>
                      <span className='sr-only'>{t('team_chat.composer', 'Escribe un mensaje…')}</span>
                      <textarea
                        ref={composerRef}
                        placeholder={t('team_chat.composer', 'Escribe un mensaje…')}
                        className='max-h-32 w-full resize-none overflow-y-auto bg-transparent py-0 text-sm leading-8 focus-visible:outline-hidden'
                        rows={1}
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value)
                          e.target.style.height = 'auto'
                          e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px'
                        }}
                        onPaste={handleComposerPaste}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            const form = e.currentTarget.closest('form')
                            if (form) form.requestSubmit()
                          }
                        }}
                      />
                    </label>
                    <Button
                      variant='ghost'
                      size='icon'
                      type='submit'
                      className='h-8 w-8 shrink-0'
                      disabled={sending || (!draft.trim() && pendingFiles.length === 0)}
                      title={t('team_chat.send', 'Enviar')}
                    >
                      <Send size={20} />
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          ) : (
            <div className='bg-card absolute inset-0 start-full z-50 hidden w-full flex-1 flex-col justify-center rounded-md border shadow-xs sm:static sm:z-auto sm:flex'>
              {loadingChannels ? (
                <div className='mx-auto flex w-full max-w-sm flex-col items-center gap-4 px-6'>
                  <Skeleton className='size-16 rounded-full' />
                  <Skeleton className='h-6 w-40' />
                  <Skeleton className='h-4 w-56' />
                  <Skeleton className='h-9 w-36 rounded-md' />
                </div>
              ) : (
                <div className='flex flex-col items-center space-y-6'>
                  <div className='border-border flex size-16 items-center justify-center rounded-full border-2'>
                    <MessagesSquare className='size-8' />
                  </div>
                  <div className='space-y-2 text-center'>
                    <h1 className='text-xl font-semibold'>
                      {t('team_chat.your_messages', 'Tus mensajes')}
                    </h1>
                    <p className='text-muted-foreground text-sm'>
                      {t('team_chat.send_to_start', 'Envía un mensaje para comenzar una conversación.')}
                    </p>
                  </div>
                  <Button onClick={() => setComposeOpen(true)}>
                    {t('team_chat.new_message', 'Nuevo mensaje')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>

        <NewMessageDialog
          open={composeOpen}
          onOpenChange={setComposeOpen}
          currentUserId={currentUser?.id}
          onOpened={handleDMOpened}
        />
        <CreateChannelDialog
          open={createChannelOpen}
          onOpenChange={setCreateChannelOpen}
          currentUserId={currentUser?.id}
          onCreated={(ch) => {
            setChannels((prev) => [ch, ...prev.filter((c) => c.id !== ch.id)])
            setActiveId(ch.id)
          }}
        />
      </div>
    </>
  )
}

export default TeamChat
