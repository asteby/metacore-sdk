import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { Check, Plus, RotateCw, WifiOff, X } from 'lucide-react'
import { Mascot } from '@asteby/metacore-app-providers'
import { AGENT_CARD, AGENT_ENTER, AGENT_FOCUS } from './surfaces'
import { ChatHeader } from './chat-header'
import { Composer } from './composer'
import { useCopilot, useCopilotSuggestions } from './context'
import { useChat } from './use-chat'
import { useOnline } from './use-online'
import { Markdown } from './markdown'
import { useRevealText } from './use-reveal-text'
import type { ChatMessage, ChatSessionSummary } from './types'

const TOUCH = 'inline-flex min-h-11 min-w-11 items-center justify-center'
const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')

function Avatar({ size, thinking }: { size: number; thinking?: boolean }) {
  const { branding } = useCopilot()
  if (branding.avatar) return <>{branding.avatar}</>
  return <Mascot skin={branding.mascotSkin} size={size} state={thinking ? 'thinking' : 'idle'} />
}

function Bubble({ message, onFrame }: { message: ChatMessage; onFrame: () => void }) {
  const { permissions, labels, onLinkClick } = useCopilot()
  const { text, revealing } = useRevealText(message.content, !!message.fresh && message.role === 'ai', onFrame)
  const mine = message.role === 'user'
  return (
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start', AGENT_ENTER)}>
      <div
        className={cx(
          'max-w-[85%] break-words rounded-2xl px-3 py-2 text-sm',
          (mine || message.error) && 'whitespace-pre-wrap',
          mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
          message.error && 'border border-destructive/50 text-destructive',
        )}
        role={message.error ? 'alert' : undefined}
      >
        {mine || message.error ? text : <Markdown content={text} streaming={revealing} onLinkClick={onLinkClick} />}
        {message.proposals?.map((p) => (
          <ProposalCard key={p.id} proposal={p} canDecide={permissions.canDecideProposals} labels={labels} />
        ))}
      </div>
    </div>
  )
}

function ProposalCard({
  proposal,
  canDecide,
  labels,
}: {
  proposal: NonNullable<ChatMessage['proposals']>[number]
  canDecide: boolean
  labels: { approve: string; reject: string }
}) {
  const { decide } = useChatBridge()
  const pending = !proposal.status || proposal.status === 'pending'
  return (
    <div className={cx(AGENT_CARD, 'mt-2 p-2 text-foreground')}>
      <div className="font-medium">{proposal.title}</div>
      {proposal.summary && <div className="text-xs text-muted-foreground">{proposal.summary}</div>}
      {pending && canDecide ? (
        <div className="mt-2 flex gap-2">
          <button type="button" className={cx(TOUCH, 'gap-1 rounded-md bg-primary px-3 text-xs text-primary-foreground', AGENT_FOCUS)} onClick={() => void decide(proposal.id, true)}>
            <Check className="size-3" aria-hidden /> {labels.approve}
          </button>
          <button type="button" className={cx(TOUCH, 'gap-1 rounded-md border px-3 text-xs', AGENT_FOCUS)} onClick={() => void decide(proposal.id, false)}>
            <X className="size-3" aria-hidden /> {labels.reject}
          </button>
        </div>
      ) : (
        !pending && <div className="mt-1 text-xs text-muted-foreground">{proposal.status === 'approved' ? labels.approve : labels.reject}</div>
      )}
    </div>
  )
}

// ProposalCard needs the active chat's `decide`; a tiny context avoids prop drilling.
const ChatBridge = createContext<{ decide: (id: string, approve: boolean) => Promise<void> }>({
  decide: async () => {},
})
const useChatBridge = () => useContext(ChatBridge)

export interface CopilotChatProps {
  className?: string
  /** Resume a stored session (needs `client.loadHistory`). */
  sessionId?: string | null
  /** Renders a close button when provided. */
  onClose?: () => void
  /** Shows the "demo data" badge. Overrides `CopilotProvider`'s `demo`. */
  demo?: boolean
  /** Optional session list; renders a picker in the header when non-empty. */
  sessions?: readonly ChatSessionSummary[]
  /** Called with the chosen session id. Pair with `sessionId` to load its history. */
  onSelectSession?: (id: string) => void
  /** Header title; defaults to the branding name. */
  title?: string
  /** Header subtitle (e.g. the agent's role). */
  subtitle?: string
  /** Header avatar; defaults to the mascot. */
  avatar?: ReactNode
  /** Rendered before the avatar (e.g. a back button). */
  headerStart?: ReactNode
  /** Rendered before the close button (e.g. expand / open-fullscreen). */
  headerEnd?: ReactNode
  /** Escape inside the panel; defaults to `onClose`. Lets a host collapse before closing. */
  onEscape?: () => void
}

/** The chat panel: header, thread, starter prompts, composer. No positioning. */
export function CopilotChat({ className, sessionId, onClose, demo, sessions, onSelectSession, title, subtitle, avatar, headerStart, headerEnd, onEscape }: CopilotChatProps) {
  const { permissions, branding, labels, demo: ctxDemo } = useCopilot()
  const online = useOnline()
  const suggestions = useCopilotSuggestions()
  const chat = useChat(sessionId)
  const isDemo = demo ?? (ctxDemo || chat.messages.some((m) => m.demo))
  const endRef = useRef<HTMLDivElement>(null)
  const scroll = () => endRef.current?.scrollIntoView?.({ block: 'end' })
  useEffect(() => {
    // Do not return scroll()'s value: scrollIntoView may yield a Promise, which React would treat as a cleanup.
    scroll()
  }, [chat.messages.length, chat.loading])

  if (!permissions.canChat) {
    return (
      <div className={cx('p-4 text-sm text-muted-foreground', className)} role="status">
        {labels.denied}
      </div>
    )
  }

  const lastFailed = !chat.loading && chat.messages[chat.messages.length - 1]?.error === true
  const retryBtn = (onClick: () => void) => (
    <button type="button" onClick={onClick} className={cx(TOUCH, 'gap-1 rounded-md border px-3 text-xs', AGENT_FOCUS)}>
      <RotateCw className="size-3" aria-hidden /> {labels.retry}
    </button>
  )

  return (
    <ChatBridge.Provider value={{ decide: chat.decide }}>
      <section
        className={cx('flex h-full min-h-0 flex-col', className)}
        aria-label={branding.name ?? 'Copiloto'}
        onKeyDown={(e) => {
          const esc = onEscape ?? onClose
          if (e.key === 'Escape' && esc && !e.nativeEvent.isComposing) {
            e.stopPropagation()
            esc()
          }
        }}
      >
        <ChatHeader
          start={headerStart}
          avatar={avatar ?? <Avatar size={28} thinking={chat.loading} />}
          title={title ?? branding.name ?? 'Copiloto'}
          subtitle={subtitle}
          badge={
            isDemo && (
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {labels.demo}
              </span>
            )
          }
        >
          {sessions && sessions.length > 0 && onSelectSession && (
            <select
              aria-label={labels.sessions}
              className={cx('min-h-11 max-w-[8rem] truncate rounded-md border bg-transparent px-1 text-xs', AGENT_FOCUS)}
              value={chat.sessionId ?? sessionId ?? ''}
              onChange={(e) => e.target.value && onSelectSession(e.target.value)}
            >
              {!(chat.sessionId ?? sessionId) && <option value="">{labels.newSession}</option>}
              {sessions.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title || x.id}
                </option>
              ))}
            </select>
          )}
          <button type="button" aria-label={labels.newChat} title={labels.newChat} className={cx(TOUCH, 'rounded-md hover:bg-muted', AGENT_FOCUS)} onClick={chat.reset}>
            <Plus className="size-4" aria-hidden />
          </button>
          {headerEnd}
          {onClose && (
            <button type="button" aria-label={labels.close} className={cx(TOUCH, 'rounded-md hover:bg-muted', AGENT_FOCUS)} onClick={onClose}>
              <X className="size-4" aria-hidden />
            </button>
          )}
        </ChatHeader>

        {!online && (
          <div role="status" className="flex items-center gap-2 border-b bg-muted px-3 py-2 text-xs">
            <WifiOff className="size-3.5 shrink-0" aria-hidden /> {labels.offline}
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" role="log" aria-live="polite" aria-busy={chat.loading}>
          {chat.historyError && (
            <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-destructive/50 p-2 text-xs text-destructive">
              <span>{labels.historyError}</span>
              {retryBtn(chat.reloadHistory)}
            </div>
          )}
          {chat.messages.length === 0 && !chat.historyError && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <Avatar size={56} />
              <p className="text-sm font-medium">{labels.emptyTitle}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={cx(TOUCH, 'rounded-full border px-3 text-xs hover:bg-muted', AGENT_FOCUS)}
                    onClick={() => void chat.send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {chat.messages.map((m) => (
            <Bubble key={m.id} message={m} onFrame={scroll} />
          ))}
          {chat.loading && (
            <div className="text-xs text-muted-foreground" role="status">
              {labels.thinking}
            </div>
          )}
          {lastFailed && <div className="flex justify-start">{retryBtn(() => void chat.retry())}</div>}
          {chat.decideFailed && (
            <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-destructive/50 p-2 text-xs text-destructive">
              <span>{labels.decideError}</span>
              <button type="button" onClick={chat.clearDecideError} aria-label={labels.close} className={cx(TOUCH, 'rounded-md', AGENT_FOCUS)}>
                <X className="size-3" aria-hidden />
              </button>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <Composer onSend={(t) => void chat.send(t)} busy={chat.loading} online={online} />
      </section>
    </ChatBridge.Provider>
  )
}
