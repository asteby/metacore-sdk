import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, PenSquare } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@asteby/metacore-ui'
import { toast } from 'sonner'

import { api } from '../../host'
import { cn } from '@asteby/metacore-ui'
import { initials, resolveUserAvatar } from './channel-avatar'
import { type OrgUser, type TeamChatChannel } from '../data/types'
import { useChatOrgUsers } from '../hooks/use-chat-org-users'

interface NewMessageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId?: string
  onOpened: (channel: TeamChatChannel) => void
}

/**
 * People-picker to start a direct message. Lists org members via
 * GET /internal-chat/users (auth-only — not gated on users-table read).
 */
export function NewMessageDialog({ open, onOpenChange, currentUserId, onOpened }: NewMessageDialogProps) {
  const { t } = useTranslation()
  const { users, loading } = useChatOrgUsers(open, currentUserId)
  const [query, setQuery] = useState('')
  const [opening, setOpening] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setOpening(null)
    }
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) => u.name.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q),
    )
  }, [users, query])

  const startDM = async (user: OrgUser) => {
    if (opening) return
    setOpening(user.id)
    try {
      const { data } = await api.post('/internal-chat/dm', { user_id: user.id })
      const channel = data.channel as TeamChatChannel
      onOpened(channel)
      onOpenChange(false)
    } catch {
      toast.error(t('team_chat.dm_error', 'No se pudo iniciar la conversación'))
    } finally {
      setOpening(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='gap-0 overflow-hidden p-0 sm:max-w-[460px]'>
        <DialogHeader className='border-b px-4 py-3'>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <PenSquare className='size-4' />
            {t('team_chat.new_message', 'Nuevo mensaje')}
          </DialogTitle>
        </DialogHeader>
        <Command shouldFilter={false} className='rounded-none border-0'>
          <CommandInput
            placeholder={t('team_chat.search_people', 'Buscar personas…')}
            value={query}
            onValueChange={setQuery}
            className='h-11'
          />
          <CommandList className='max-h-[380px] overflow-y-auto p-2'>
            {loading ? (
              <div className='flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground'>
                <Loader2 className='size-4 animate-spin' /> {t('team_chat.loading', 'Cargando…')}
              </div>
            ) : (
              <>
                <CommandEmpty className='py-8 text-center text-sm text-muted-foreground'>
                  {t('team_chat.no_people', 'Sin resultados')}
                </CommandEmpty>
                <CommandGroup heading={t('team_chat.people', 'Personas')}>
                  {filtered.map((u) => (
                    <CommandItem
                      key={u.id}
                      value={u.id}
                      onSelect={() => startDM(u)}
                      className='flex cursor-pointer items-center gap-3 p-2'
                    >
                      {u.avatar ? (
                        <img src={resolveUserAvatar(u.avatar)} alt={u.name} className='size-9 shrink-0 rounded-lg object-cover' />
                      ) : (
                        <div className='flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground'>
                          {initials(u.name)}
                        </div>
                      )}
                      <div className='min-w-0 flex-1'>
                        <div className='truncate text-sm font-medium'>{u.name}</div>
                        {u.email && (
                          <div className='truncate text-xs text-muted-foreground'>{u.email}</div>
                        )}
                      </div>
                      {opening === u.id && (
                        <Loader2 className={cn('size-4 animate-spin text-muted-foreground')} />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
