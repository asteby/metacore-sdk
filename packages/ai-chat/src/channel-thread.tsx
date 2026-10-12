import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCw, WifiOff } from 'lucide-react'
import type { ChannelAdapter, ChannelMessage, ChatChannel } from './channels'
import { Composer } from './composer'
import { useCopilot } from './context'
import { AGENT_ENTER, AGENT_FOCUS } from './surfaces'
import { useOnline } from './use-online'

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')

function timeLabel(iso: string | undefined, locale: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

/** Human conversation (team / adapter-served agent): history, live messages, composer. */
export function ChannelThread({
  adapter,
  channel,
  onRead,
}: {
  adapter: ChannelAdapter
  channel: ChatChannel
  /** Called when the channel was read (open + new messages while visible). */
  onRead?: (channelId: string) => void
}) {
  const { labels } = useCopilot()
  const online = useOnline()
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const lastSent = useRef<string>('')

  const markRead = useCallback(() => {
    void adapter.markRead?.(channel.id)?.catch?.(() => {})
    onRead?.(channel.id)
  }, [adapter, channel.id, onRead])

  useEffect(() => {
    let live = true
    setLoading(true)
    setLoadError(false)
    setMessages([])
    adapter.loadMessages(channel.id).then(
      (m) => {
        if (!live) return
        setMessages(m)
        setLoading(false)
        markRead()
      },
      () => {
        if (!live) return
        setLoadError(true)
        setLoading(false)
      },
    )
    const off = adapter.subscribe?.((e) => {
      if (!live || e.type !== 'message' || e.message.channelId !== channel.id) return
      setMessages((prev) => (prev.some((x) => x.id === e.message.id) ? prev : [...prev, e.message]))
      if (!e.message.mine) markRead()
    })
    return () => {
      live = false
      off?.()
    }
    // markRead intentionally excluded: it only forwards to the adapter for the same channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, channel.id, nonce])

  useEffect(() => {
    // Do not return scrollIntoView's value (may be a Promise).
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages.length, loading])

  const send = async (text: string) => {
    const body = text.trim()
    if (!body) return
    lastSent.current = body
    setSending(true)
    setSendError(null)
    try {
      const stored = await adapter.send(channel.id, body)
      if (stored) setMessages((prev) => (prev.some((x) => x.id === stored.id) ? prev : [...prev, stored]))
    } catch {
      setSendError(labels.sendFailed)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!online && (
        <div role="status" className="flex items-center gap-2 border-b bg-muted px-3 py-2 text-xs">
          <WifiOff className="size-3.5 shrink-0" aria-hidden /> {labels.offline}
        </div>
      )}
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3" role="log" aria-live="polite" aria-busy={loading}>
        {loading && (
          <div aria-busy="true" aria-label={labels.loadingMessages} className="flex flex-col gap-1.5 py-2">
            <div className="ml-auto h-10 w-[55%] animate-pulse rounded-xl rounded-tr-none bg-primary/15 motion-reduce:animate-none" />
            <div className="h-10 w-[65%] animate-pulse rounded-xl rounded-tl-none bg-muted motion-reduce:animate-none" />
            <div className="ml-auto h-8 w-[40%] animate-pulse rounded-xl rounded-tr-none bg-primary/15 motion-reduce:animate-none" />
          </div>
        )}
        {loadError && (
          <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-destructive/50 p-2 text-xs text-destructive">
            <span>{labels.messagesError}</span>
            <button type="button" onClick={() => setNonce((n) => n + 1)} className={cx('inline-flex min-h-11 items-center gap-1 rounded-md border px-3', AGENT_FOCUS)}>
              <RotateCw className="size-3" aria-hidden /> {labels.retry}
            </button>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cx('flex flex-col', m.mine ? 'items-end' : 'items-start', AGENT_ENTER)}>
            {!m.mine && m.senderName && <span className="mb-0.5 px-1 text-[11px] text-muted-foreground">{m.senderName}</span>}
            <div
              className={cx(
                'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm',
                m.mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-muted text-foreground',
              )}
            >
              {m.body}
              {m.attachments?.map((a) => (
                <a key={a.url} href={a.url} target="_blank" rel="noreferrer noopener" className="mt-1 block text-xs underline">
                  {a.name}
                </a>
              ))}
            </div>
            <span className="px-1 pt-0.5 text-[10px] text-muted-foreground">{timeLabel(m.createdAt, labels.locale)}</span>
          </div>
        ))}
        {sendError && (
          <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-destructive/50 p-2 text-xs text-destructive">
            <span>{sendError}</span>
            <button type="button" onClick={() => void send(lastSent.current)} className={cx('inline-flex min-h-11 items-center gap-1 rounded-md border px-3', AGENT_FOCUS)}>
              <RotateCw className="size-3" aria-hidden /> {labels.retry}
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <Composer onSend={(t) => void send(t)} busy={sending} online={online} />
    </div>
  )
}
