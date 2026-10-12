import { memo } from 'react'
import { format, formatDistanceToNowStrict, isToday } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { Phone } from 'lucide-react'

import { cn } from '@asteby/metacore-ui'
import { type TeamChatChannel, messagePreviewText } from '../data/types'
import { ChannelAvatar, channelDisplayName } from './channel-avatar'

// date-fns v4 does not re-export the `Locale` type from its root entry; derive it.
type Locale = typeof enUS

interface ChatListItemProps {
  channel: TeamChatChannel
  isSelected: boolean
  currentUserId?: string
  youLabel: string
  locale: Locale
  onSelect: (channel: TeamChatChannel) => void
  online?: boolean
}

function previewTime(iso: string, locale: Locale) {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'p', { locale })
  return formatDistanceToNowStrict(d, { locale, addSuffix: false })
}

/**
 * A single row of the inbox: monochrome square avatar, name, last-message
 * preview truncated on one line, the last activity time, and an unread badge.
 * Mirrors the polished look of Link's chat-list-item, adapted to team chat.
 */
export const ChatListItem = memo(
  ({
    channel,
    isSelected,
    currentUserId,
    youLabel,
    locale,
    onSelect,
    online,
  }: ChatListItemProps) => {
    const last = channel.last_message
    const name = channelDisplayName(channel)
    const mine = last && last.sender_id === currentUserId
    const bodyPreview = messagePreviewText(last)
    const liveCall = !!channel.active_call
    const preview = liveCall
      ? 'Llamada en curso'
      : bodyPreview
        ? `${mine ? youLabel + ': ' : channel.kind !== 'dm' ? last!.sender_name + ': ' : ''}${bodyPreview}`
        : ''
    const showPresence = channel.kind === 'dm'

    return (
      <button
        type='button'
        onClick={() => onSelect(channel)}
        className={cn(
          'group mb-1 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          isSelected && 'bg-muted',
        )}
      >
        <ChannelAvatar channel={channel} online={showPresence ? !!online : undefined} />
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <span className='flex-1 truncate text-sm font-semibold'>{name}</span>
            {liveCall ? (
              <span className='inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary'>
                <Phone className='size-3' />
                En vivo
              </span>
            ) : last ? (
              <span
                className={cn(
                  'shrink-0 text-[11px]',
                  channel.unread > 0 ? 'font-medium text-primary' : 'text-muted-foreground',
                )}
              >
                {previewTime(last.created_at, locale)}
              </span>
            ) : null}
          </div>
          <div className='flex items-center gap-2'>
            <span
              className={cn(
                'line-clamp-1 flex-1 text-ellipsis text-xs',
                liveCall
                  ? 'font-medium text-primary'
                  : channel.unread > 0
                    ? 'font-medium text-foreground/90'
                    : 'text-muted-foreground',
              )}
            >
              {preview || <span className='italic opacity-70'>Sin mensajes</span>}
            </span>
            {channel.unread > 0 && !liveCall && (
              <span className='inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground'>
                {channel.unread > 99 ? '99+' : channel.unread}
              </span>
            )}
          </div>
        </div>
      </button>
    )
  },
)
