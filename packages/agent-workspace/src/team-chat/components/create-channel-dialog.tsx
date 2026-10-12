import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Hash, Loader2, Megaphone, Users } from 'lucide-react'
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
import { initials, resolveUserAvatar } from './channel-avatar'
import { type TeamChatChannel } from '../data/types'
import { useChatOrgUsers } from '../hooks/use-chat-org-users'

interface CreateChannelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId?: string
  onCreated: (channel: TeamChatChannel) => void
}

/** Create a private group (topic) or org-wide broadcast channel. */
export function CreateChannelDialog({
  open,
  onOpenChange,
  currentUserId,
  onCreated,
}: CreateChannelDialogProps) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<'topic' | 'broadcast'>('topic')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const { users, loading } = useChatOrgUsers(open, currentUserId)

  useEffect(() => {
    if (!open) {
      setName('')
      setDescription('')
      setSelected({})
      setQuery('')
      setKind('topic')
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q),
    )
  }, [users, query])

  const submit = async () => {
    const n = name.trim()
    if (!n) {
      toast.error('Ponle un nombre al canal')
      return
    }
    setSaving(true)
    try {
      const payload: {
        name: string
        kind: string
        description?: string
        user_ids?: string[]
      } = {
        name: n,
        kind,
        description: description.trim() || undefined,
      }
      if (kind === 'topic') {
        payload.user_ids = Object.keys(selected).filter((id) => selected[id])
      }
      const { data } = await api.post('/internal-chat/channels', payload)
      const channel = data.channel as TeamChatChannel
      onCreated(channel)
      onOpenChange(false)
      toast.success(kind === 'broadcast' ? 'Canal de difusión creado' : 'Grupo creado')
    } catch {
      toast.error('No se pudo crear el canal')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='gap-0 overflow-hidden p-0 sm:max-w-[480px]'>
        <DialogHeader className='border-b px-4 py-3'>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <Hash className='size-4' />
            {t('team_chat.create_channel', 'Nuevo canal')}
          </DialogTitle>
        </DialogHeader>
        <div className='space-y-3 p-4'>
          <div className='grid grid-cols-2 gap-2'>
            <button
              type='button'
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                kind === 'topic' ? 'border-primary bg-primary/5' : 'hover:bg-muted/60',
              )}
              onClick={() => setKind('topic')}
            >
              <span className='flex items-center gap-1.5 font-medium'>
                <Users className='size-3.5' /> Grupo
              </span>
              <span className='text-[11px] text-muted-foreground'>
                Privado · miembros elegidos
              </span>
            </button>
            <button
              type='button'
              className={cn(
                'flex flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                kind === 'broadcast' ? 'border-primary bg-primary/5' : 'hover:bg-muted/60',
              )}
              onClick={() => setKind('broadcast')}
            >
              <span className='flex items-center gap-1.5 font-medium'>
                <Megaphone className='size-3.5' /> Difusión
              </span>
              <span className='text-[11px] text-muted-foreground'>
                Público · solo tú publicas
              </span>
            </button>
          </div>

          <div className='space-y-1.5'>
            <p className='text-xs font-medium text-muted-foreground'>Nombre</p>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === 'broadcast' ? 'Avisos, Novedades…' : 'Ventas, Ops…'}
              maxLength={80}
            />
          </div>
          <div className='space-y-1.5'>
            <p className='text-xs font-medium text-muted-foreground'>Descripción (opcional)</p>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder='Para qué es este canal'
              maxLength={200}
            />
          </div>

          {kind === 'topic' && (
            <div className='space-y-2'>
              <p className='text-xs font-medium text-muted-foreground'>Miembros</p>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Buscar personas…'
              />
              <div className='max-h-48 space-y-1 overflow-y-auto rounded-md border p-1'>
                {loading ? (
                  <div className='flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground'>
                    <Loader2 className='size-4 animate-spin' /> Cargando…
                  </div>
                ) : filtered.length === 0 ? (
                  <p className='py-6 text-center text-sm text-muted-foreground'>Sin resultados</p>
                ) : (
                  filtered.map((u) => {
                    const on = !!selected[u.id]
                    return (
                      <button
                        key={u.id}
                        type='button'
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted',
                          on && 'bg-muted',
                        )}
                        onClick={() => setSelected((s) => ({ ...s, [u.id]: !s[u.id] }))}
                      >
                        <span
                          className={cn(
                            'flex size-4 items-center justify-center rounded border text-[10px]',
                            on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
                          )}
                        >
                          {on ? '✓' : ''}
                        </span>
                        {u.avatar ? (
                          <img
                            src={resolveUserAvatar(u.avatar)}
                            alt=''
                            className='size-7 rounded-md object-cover'
                          />
                        ) : (
                          <div className='flex size-7 items-center justify-center rounded-md bg-muted text-[10px] font-semibold'>
                            {initials(u.name)}
                          </div>
                        )}
                        <span className='min-w-0 flex-1 truncate text-sm'>{u.name}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}

          <div className='flex justify-end gap-2 pt-1'>
            <Button type='button' variant='ghost' onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type='button' onClick={() => void submit()} disabled={saving}>
              {saving && <Loader2 className='mr-2 size-4 animate-spin' />}
              Crear
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
