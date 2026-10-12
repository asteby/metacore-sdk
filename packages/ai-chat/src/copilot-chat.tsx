import { createContext, useContext, useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Plus, RotateCw, Send, WifiOff, X } from 'lucide-react'
import { Mascot } from '@asteby/metacore-app-providers'
import { AGENT_CAPSULE, AGENT_CARD, AGENT_ENTER, AGENT_FOCUS } from './surfaces'
import { useCopilot, useCopilotSuggestions } from './context'
import { useChat } from './use-chat'
import { useOnline } from './use-online'
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
  const { permissions, labels } = useCopilot()
  const { text } = useRevealText(message.content, !!message.fresh && message.role === 'ai', onFrame)
  const mine = message.role === 'user'
  return (
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start', AGENT_ENTER)}>
      <div
        className={cx(
          'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm',
          mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
          message.error && 'border border-destructive/50 text-destructive',
        )}
        role={message.error ? 'alert' : undefined}
      >
        {text}
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
}

/** The chat panel: header, thread, starter prompts, composer. No positioning. */
export function CopilotChat({ className, sessionId, onClose, demo, sessions, onSelectSession }: CopilotChatProps) {
  const { permissions, branding, labels, demo: ctxDemo } = useCopilot()
  const isDemo = demo ?? ctxDemo
  const online = useOnline()
  const suggestions = useCopilotSuggestions()
  const chat = useChat(sessionId)
  const [draft, setDraft] = useState('')
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

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!online) return
    const text = draft
    setDraft('')
    void chat.send(text)
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
          if (e.key === 'Escape' && onClose && !e.nativeEvent.isComposing) {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <header className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
          <Avatar size={28} thinking={chat.loading} />
          <h2 className="flex-1 truncate text-sm font-semibold">{branding.name ?? 'Copiloto'}</h2>
          {isDemo && (
            <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {labels.demo}
            </span>
          )}
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
          {onClose && (
            <button type="button" aria-label={labels.close} className={cx(TOUCH, 'rounded-md hover:bg-muted', AGENT_FOCUS)} onClick={onClose}>
              <X className="size-4" aria-hidden />
            </button>
          )}
        </header>

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

        <form onSubmit={submit} className={cx(AGENT_CAPSULE, 'm-3 flex items-end gap-2 p-2')}>
          <textarea
            aria-label={labels.placeholder}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
            placeholder={labels.placeholder}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e)
            }}
          />
          <button
            type="submit"
            aria-label={labels.send}
            disabled={!draft.trim() || chat.loading || !online}
            className={cx(TOUCH, 'rounded-full bg-primary text-primary-foreground disabled:opacity-50', AGENT_FOCUS)}
          >
            <Send className="size-4" aria-hidden />
          </button>
        </form>
      </section>
    </ChatBridge.Provider>
  )
}
