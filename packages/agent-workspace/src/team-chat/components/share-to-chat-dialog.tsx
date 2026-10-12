import { useEffect, useMemo, useState } from 'react'
import { Bot, Loader2, MessageSquareShare, Search as SearchIcon } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from '@asteby/metacore-ui'
import { toast } from 'sonner'

import { api } from '../../host'
import { cn } from '@asteby/metacore-ui'
import { useWorkspacePlatformConfig } from '../../host'
import {
  openAbyWidget,
  openTeamChatWidget,
  readLastAbySession,
  readLastTeamChannelId,
} from '../../lib/aby-widget'
import { useWebSocketContext } from '../../host'
import {
  type ChatAttachment,
  type TeamChatChannel,
} from '../data/types'
import { ChannelAvatar, channelDisplayName } from './channel-avatar'
import {
  attachmentFromView,
  attachmentsFromRows,
  humanizeModelKey,
} from '../data/share-embed'

export type ShareToChatPayload =
  | { kind: 'records'; model: string; modelTitle?: string; rows: Record<string, unknown>[] }
  | { kind: 'view'; model: string; modelTitle?: string }

export function ShareToChatDialog({
  open,
  onOpenChange,
  payload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  payload: ShareToChatPayload | null
}) {
  const { mascot_name: mascotName } = useWorkspacePlatformConfig()
  const [channels, setChannels] = useState<TeamChatChannel[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [note, setNote] = useState('')
  const { widgetTeamChatChannelId } = useWebSocketContext()
  const preferredTeamId = widgetTeamChatChannelId || readLastTeamChannelId()
  const lastAby = readLastAbySession()

  useEffect(() => {
    if (!open) {
      setQuery('')
      setNote('')
      return
    }
    let cancelled = false
    setLoading(true)
    api
      .get('/internal-chat/channels')
      .then(({ data }) => {
        if (!cancelled) setChannels((data?.channels ?? []) as TeamChatChannel[])
      })
      .catch(() => {
        if (!cancelled) toast.error('No se pudieron cargar los chats')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = channels.filter((ch) => ch.kind !== 'broadcast')
    if (q) {
      list = list.filter((ch) => channelDisplayName(ch).toLowerCase().includes(q))
    }
    // Pin current / last conversation first.
    if (preferredTeamId) {
      list = [
        ...list.filter((c) => c.id === preferredTeamId),
        ...list.filter((c) => c.id !== preferredTeamId),
      ]
    }
    return list
  }, [channels, query, preferredTeamId])

  const preferredChannel = useMemo(
    () => channels.find((c) => c.id === preferredTeamId) || null,
    [channels, preferredTeamId],
  )

  const modelTitle =
    payload?.modelTitle?.trim() ||
    (payload ? humanizeModelKey(payload.model) : 'Registros')

  const buildAttachments = (): ChatAttachment[] => {
    if (!payload) return []
    return payload.kind === 'view'
      ? [attachmentFromView(payload.model, modelTitle)]
      : attachmentsFromRows(payload.model, modelTitle, payload.rows)
  }

  /** Stage embeds in team composer — do not auto-send. */
  const shareToTeam = (channel: TeamChatChannel) => {
    if (!payload) return
    const attachments = buildAttachments()
    if (!attachments.length) {
      toast.error('Nada para compartir')
      return
    }
    onOpenChange(false)
    openTeamChatWidget({
      channelId: channel.id,
      message: note.trim() || undefined,
      attachments,
    })
  }

  /** Open Aby in the last thread when possible (not the conversation picker). */
  const shareToAby = () => {
    if (!payload) return
    const attachments = buildAttachments()
    if (!attachments.length) {
      toast.error('Nada para compartir')
      return
    }
    onOpenChange(false)
    openAbyWidget({
      message: note.trim() || undefined,
      attachments,
      sessionId: lastAby?.id,
      sessionTitle: lastAby?.title,
    })
  }

  const shareToPreferredTeam = () => {
    if (!preferredChannel) return
    shareToTeam(preferredChannel)
  }

  const heading =
    payload?.kind === 'view'
      ? 'Compartir vista en chat'
      : payload && payload.kind === 'records' && payload.rows.length > 1
        ? `Compartir ${payload.rows.length} registros`
        : 'Compartir en chat'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='gap-0 overflow-hidden p-0 sm:max-w-[420px]'>
        <DialogHeader className='border-b px-4 py-3'>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <MessageSquareShare className='size-4' />
            {heading}
          </DialogTitle>
        </DialogHeader>
        <div className='border-b px-3 py-2'>
          <div className='relative'>
            <SearchIcon className='pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Buscar chat o ${mascotName || 'Aby'}…`}
              className='h-9 pl-8'
            />
          </div>
        </div>
        <div className='max-h-[320px] overflow-y-auto p-2'>
          {preferredChannel && !query.trim() && (
            <button
              type='button'
              onClick={shareToPreferredTeam}
              className='mb-1 flex w-full items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-2 py-2 text-left hover:bg-primary/10'
            >
              <ChannelAvatar channel={preferredChannel} size='sm' online={preferredChannel.dm_user?.online} />
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-sm font-semibold'>
                  {channelDisplayName(preferredChannel)}
                </span>
                <span className='block text-[11px] text-muted-foreground'>
                  {widgetTeamChatChannelId === preferredChannel.id
                    ? 'Chat actual — continuar'
                    : 'Último chat — continuar'}
                </span>
              </span>
            </button>
          )}
          {(!query.trim() ||
            'aby'.includes(query.trim().toLowerCase()) ||
            'asistente'.includes(query.trim().toLowerCase())) && (
            <button
              type='button'
              onClick={shareToAby}
              className='mb-1 flex w-full items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-2 py-2 text-left hover:bg-emerald-500/10'
            >
              <span className='flex size-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'>
                <Bot className='size-4' />
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block truncate text-sm font-semibold'>{mascotName || 'Aby'}</span>
                <span className='block text-[11px] text-muted-foreground'>
                  {lastAby?.title
                    ? `Continuar · ${lastAby.title}`
                    : 'Asistente de IA'}
                </span>
              </span>
            </button>
          )}
          {loading ? (
            <div className='flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground'>
              <Loader2 className='size-4 animate-spin' /> Cargando…
            </div>
          ) : filtered.length === 0 ? (
            <p className='py-8 text-center text-sm text-muted-foreground'>Sin chats de equipo</p>
          ) : (
            filtered.map((ch) => (
              <button
                key={ch.id}
                type='button'
                onClick={() => shareToTeam(ch)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/80',
                  preferredTeamId === ch.id && 'bg-muted/40',
                )}
              >
                <ChannelAvatar channel={ch} size='sm' online={ch.dm_user?.online} />
                <span className='min-w-0 flex-1 truncate text-sm font-medium'>
                  {channelDisplayName(ch)}
                </span>
              </button>
            ))
          )}
        </div>
        <div className='border-t px-3 py-2'>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder='Nota opcional (se adjunta, no se envía sola)'
            className='h-9'
          />
        </div>
        <div className='flex justify-end border-t px-3 py-2'>
          <Button type='button' variant='ghost' size='sm' onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
