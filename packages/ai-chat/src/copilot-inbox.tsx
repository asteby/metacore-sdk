import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { BOT_CHANNEL_ID, type ChannelAdapter, type ChatChannel } from './channels'
import { ChannelAvatar, ChannelList } from './channel-list'
import { ChannelThread } from './channel-thread'
import { ChatHeader } from './chat-header'
import { CopilotChat } from './copilot-chat'
import { CopilotScope, useCopilot } from './context'
import { AGENT_FOCUS } from './surfaces'
import type { useChannels } from './use-channels'

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')
const TOUCH = 'inline-flex min-h-11 min-w-11 items-center justify-center'

type ChannelsState = ReturnType<typeof useChannels>

export interface CopilotInboxProps {
  adapter: ChannelAdapter
  state: ChannelsState
  activeId: string | null
  onSelect: (id: string | null) => void
  /** Expanded (full screen): list and thread side by side from `md` up. */
  expanded: boolean
  /** Show the built-in bot channel first. Default true. */
  includeBot?: boolean
  /** Expand / fullscreen controls, rendered in every header. */
  actions?: ReactNode
  onClose: () => void
  /** Escape: the host collapses before closing. */
  onEscape: () => void
  className?: string
}

/** Unified inbox: bot + agents + team channels, list ↔ thread (side by side when expanded). */
export function CopilotInbox({
  adapter,
  state,
  activeId,
  onSelect,
  expanded,
  includeBot = true,
  actions,
  onClose,
  onEscape,
  className,
}: CopilotInboxProps) {
  const { branding, labels } = useCopilot()
  const botChannel = useMemo<ChatChannel>(
    () => ({ id: BOT_CHANNEL_ID, kind: 'bot', name: branding.name ?? 'Copiloto', description: labels.emptyTitle }),
    [branding.name, labels.emptyTitle],
  )
  const channels = useMemo(() => (includeBot ? [botChannel, ...state.channels] : state.channels), [includeBot, botChannel, state.channels])
  const active = channels.find((c) => c.id === activeId) ?? null

  // AI panes stay mounted once visited, so going back to the list keeps the conversation.
  const [visited, setVisited] = useState<string[]>([])
  useEffect(() => {
    if (active && (active.kind === 'bot' || active.client) && !visited.includes(active.id)) setVisited((v) => [...v, active.id])
  }, [active, visited])

  // Expanded on a wide screen always shows a thread beside the list.
  useEffect(() => {
    if (!expanded || activeId || !channels.length) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(min-width: 768px)').matches) onSelect(channels[0]!.id)
  }, [expanded, activeId, channels, onSelect])

  const open = (id: string) => {
    onSelect(id)
    state.clearUnread(id)
  }

  const back = (
    <button
      type="button"
      aria-label={labels.back}
      title={labels.back}
      onClick={() => onSelect(null)}
      className={cx(TOUCH, 'rounded-md hover:bg-muted', AGENT_FOCUS, expanded && 'md:hidden')}
    >
      <ArrowLeft className="size-4" aria-hidden />
    </button>
  )

  const aiPanes = channels.filter((c) => visited.includes(c.id) && (c.kind === 'bot' || c.client))
  const threadChannel = active && !(active.kind === 'bot' || active.client) ? active : null
  const showList = !activeId || expanded

  return (
    <div className={cx('flex h-full min-h-0 w-full', className)}>
      <aside
        className={cx(
          'min-h-0 flex-col',
          expanded
            ? cx('md:flex md:w-80 md:shrink-0 md:border-r md:border-border/50', activeId ? 'hidden' : 'flex flex-1 md:flex-none')
            : showList
              ? 'flex flex-1'
              : 'hidden',
        )}
      >
        <ChatHeader title={labels.channels} className="md:border-b-0">
          {actions}
          <button type="button" aria-label={labels.close} title={labels.close} onClick={onClose} className={cx(TOUCH, 'rounded-md hover:bg-muted', AGENT_FOCUS, expanded && 'md:hidden')}>
            <X className="size-4" aria-hidden />
          </button>
        </ChatHeader>
        <ChannelList channels={channels} activeId={activeId} loading={state.loading} error={state.error} onSelect={open} onRetry={state.reload} />
      </aside>

      <div
        className={cx(
          'min-h-0 min-w-0 flex-col',
          expanded ? cx('md:flex md:flex-1', activeId ? 'flex flex-1' : 'hidden') : activeId ? 'flex flex-1' : 'hidden',
        )}
      >
        {aiPanes.map((c) => (
          <div key={c.id} hidden={c.id !== activeId} className={cx('min-h-0 flex-1 flex-col', c.id === activeId ? 'flex' : 'hidden')}>
            <CopilotScope client={c.client} branding={c.kind === 'bot' ? undefined : { ...branding, name: c.name, avatar: c.avatar ?? branding.avatar }}>
              <CopilotChat
                title={c.name}
                subtitle={c.kind === 'agent' ? c.description : undefined}
                avatar={c.kind === 'bot' ? undefined : <ChannelAvatar channel={c} size={28} />}
                headerStart={back}
                headerEnd={actions}
                onClose={onClose}
                onEscape={onEscape}
              />
            </CopilotScope>
          </div>
        ))}
        {threadChannel && (
          <section className="flex min-h-0 flex-1 flex-col" aria-label={threadChannel.name} onKeyDown={(e) => {
            if (e.key === 'Escape' && !e.nativeEvent.isComposing) {
              e.stopPropagation()
              onEscape()
            }
          }}>
            <ChatHeader
              start={back}
              avatar={<ChannelAvatar channel={threadChannel} size={28} />}
              title={threadChannel.name}
              subtitle={threadChannel.online ? labels.online : threadChannel.description}
            >
              {actions}
              <button type="button" aria-label={labels.close} title={labels.close} onClick={onClose} className={cx(TOUCH, 'rounded-md hover:bg-muted', AGENT_FOCUS)}>
                <X className="size-4" aria-hidden />
              </button>
            </ChatHeader>
            <ChannelThread key={threadChannel.id} adapter={adapter} channel={threadChannel} onRead={state.clearUnread} />
          </section>
        )}
        {!active && expanded && (
          <div className="hidden flex-1 items-center justify-center text-sm text-muted-foreground md:flex">{labels.selectChannel}</div>
        )}
      </div>
    </div>
  )
}
