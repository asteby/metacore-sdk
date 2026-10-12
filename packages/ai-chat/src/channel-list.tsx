import { Mascot } from '@asteby/metacore-app-providers'
import { BOT_CHANNEL_ID, formatRelativeTime, type ChatChannel } from './channels'
import { useCopilot } from './context'
import { AGENT_ENTER, AGENT_FOCUS } from './surfaces'

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')

export function ChannelAvatar({ channel, size = 36 }: { channel: ChatChannel; size?: number }) {
  const { branding } = useCopilot()
  const initials = channel.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  let inner
  if (channel.avatar) inner = channel.avatar
  else if (channel.avatarUrl) inner = <img src={channel.avatarUrl} alt="" className="size-full rounded-full object-cover" />
  else if (channel.kind === 'bot' || channel.id === BOT_CHANNEL_ID) {
    inner = branding.avatar ?? <Mascot skin={branding.mascotSkin} size={size} />
  } else {
    inner = (
      <span
        aria-hidden
        className={cx(
          'flex size-full items-center justify-center rounded-full text-xs font-semibold',
          channel.kind === 'agent' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        {initials || '?'}
      </span>
    )
  }
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {inner}
      {channel.online && (
        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[var(--surface-panel,var(--card))] bg-emerald-500" aria-hidden />
      )}
    </span>
  )
}

export function UnreadBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null
  return (
    <span
      className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground"
      aria-label={`${count} ${label}`}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}

/** Conversation list: avatar, name, last message, relative time, unread badge. */
export function ChannelList({
  channels,
  activeId,
  loading,
  error,
  onSelect,
  onRetry,
}: {
  channels: readonly ChatChannel[]
  activeId: string | null
  loading?: boolean
  error?: boolean
  onSelect: (id: string) => void
  onRetry?: () => void
}) {
  const { labels } = useCopilot()
  return (
    <nav aria-label={labels.channels} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
      {error && (
        <div role="alert" className="mb-2 flex items-center justify-between gap-2 rounded-md border border-destructive/50 p-2 text-xs text-destructive">
          <span>{labels.channelsError}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className={cx('inline-flex min-h-11 items-center rounded-md border px-3', AGENT_FOCUS)}>
              {labels.retry}
            </button>
          )}
        </div>
      )}
      {loading && channels.length === 0 && (
        <div aria-busy="true" aria-label={labels.loadingMessages} className="space-y-2 p-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex animate-pulse items-center gap-3 motion-reduce:animate-none">
              <div className="size-9 rounded-full bg-muted" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/3 rounded bg-muted" />
                <div className="h-3 w-2/3 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && channels.length === 0 && <p className="p-4 text-center text-sm text-muted-foreground">{labels.noChannels}</p>}
      <ul className="space-y-0.5">
        {channels.map((c) => {
          const active = c.id === activeId
          const unread = c.unread ?? 0
          return (
            <li key={c.id} className={AGENT_ENTER}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(c.id)}
                className={cx(
                  'flex min-h-14 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors motion-reduce:transition-none',
                  active ? 'bg-primary/10' : 'hover:bg-muted',
                  AGENT_FOCUS,
                )}
              >
                <ChannelAvatar channel={c} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cx('truncate text-sm', unread > 0 ? 'font-semibold' : 'font-medium')}>{c.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelativeTime(c.lastAt, labels.locale)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-muted-foreground">{c.lastMessage || c.description || ''}</span>
                    <UnreadBadge count={unread} label={labels.unread} />
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
