import type { ReactNode } from 'react'
import { Hash, Megaphone, Store, Users } from 'lucide-react'
import { cn } from '@asteby/metacore-ui'
import { getImageUrl, getStorageUrl } from '@asteby/metacore-starter-core'
import { type TeamChatChannel } from '../data/types'

export function initials(name?: string) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function channelDisplayName(ch: Pick<TeamChatChannel, 'kind' | 'name' | 'dm_user'>) {
  if (ch.kind === 'dm') return ch.dm_user?.name || ch.name || 'Mensaje directo'
  return ch.name
}

/**
 * User.avatar is often a bare filename under storage/public/avatars/
 * (see ProfileDropdown). Full /storage/… paths and absolute URLs pass through.
 */
export function resolveUserAvatar(avatar?: string | null): string {
  if (!avatar) return ''
  if (
    avatar.startsWith('http://') ||
    avatar.startsWith('https://') ||
    avatar.startsWith('data:') ||
    avatar.startsWith('blob:')
  ) {
    return avatar
  }
  if (avatar.startsWith('/storage/') || avatar.includes('/storage/')) {
    return getImageUrl(avatar)
  }
  return getStorageUrl(avatar, 'avatars')
}

const sizeMap = {
  sm: 'size-9 text-xs',
  md: 'size-10 text-sm',
} as const

/**
 * Monochrome, square-rounded avatar coherent with the rest of ops — NOT a
 * rainbow of colors. Channels show their kind icon (hash / store); DMs show the
 * person's initials, or their photo when available. Optional online green dot.
 */
export function ChannelAvatar({
  channel,
  size = 'md',
  online,
}: {
  channel: Pick<TeamChatChannel, 'kind' | 'name' | 'dm_user' | 'icon'>
  size?: keyof typeof sizeMap
  online?: boolean
}) {
  const base = cn(
    'flex shrink-0 items-center justify-center rounded-lg bg-muted font-semibold text-muted-foreground',
    sizeMap[size],
  )

  let avatar: ReactNode
  if (channel.kind === 'dm') {
    const u = channel.dm_user
    const src = resolveUserAvatar(u?.avatar)
    if (src) {
      avatar = (
        <img
          src={src}
          alt={u?.name}
          className={cn('shrink-0 rounded-lg object-cover', sizeMap[size])}
        />
      )
    } else {
      avatar = <div className={base}>{initials(channelDisplayName(channel))}</div>
    }
  } else {
    const Icon =
      channel.kind === 'branch'
        ? Store
        : channel.kind === 'broadcast'
          ? Megaphone
          : channel.kind === 'topic'
            ? Users
            : Hash
    avatar = (
      <div className={base}>
        <Icon className='size-[45%]' />
      </div>
    )
  }

  if (online === undefined) return avatar

  return (
    <div className='relative shrink-0'>
      {avatar}
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background',
          online ? 'bg-primary' : 'bg-muted-foreground/40',
        )}
        title={online ? 'En línea' : 'Desconectado'}
      />
    </div>
  )
}
