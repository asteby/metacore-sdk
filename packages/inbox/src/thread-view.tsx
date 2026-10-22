import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Download, File as FileIcon, Check, CheckCheck, Loader2 } from 'lucide-react'
import type { InboxAttachment, InboxParticipant, ThreadMessage } from './types'
import { useInboxLabels, type InboxLabels } from './i18n'
import { groupMessages, linkify, splitQuoted, type MessageGroup } from './thread-utils'
import { HtmlSandboxFrame } from './html-sandbox-frame'
import { EmptyState, ErrorState, ThreadSkeleton } from './states'
import { cx, FOCUS, formatBytes, formatFullTime, initials, safeUrl } from './utils'

const senderName = (p: InboxParticipant, fallback: string) => p.name || p.address || fallback

function PlainText({ text }: { text: string }) {
  const parts = useMemo(() => linkify(text), [text])
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
      {parts.map((p, i) =>
        p.type === 'link' ? (
          <a key={i} href={p.value} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline-offset-2 hover:underline">
            {p.value}
          </a>
        ) : (
          p.value
        ),
      )}
    </p>
  )
}

function Body({ message, collapseQuotes, rewriteImageUrl, onLoadImages, labels }: {
  message: ThreadMessage
  collapseQuotes: boolean
  rewriteImageUrl?: (url: string) => string
  onLoadImages?: (m: ThreadMessage) => void
  labels: InboxLabels
}) {
  const [open, setOpen] = useState(false)
  const split = useMemo(() => (message.html || !message.text ? null : splitQuoted(message.text)), [message.html, message.text])
  if (message.html) {
    return (
      <HtmlSandboxFrame
        html={message.html}
        inlineResources={message.inlineResources}
        rewriteImageUrl={rewriteImageUrl}
        collapseQuoted={collapseQuotes}
        onLoadImages={onLoadImages ? () => onLoadImages(message) : undefined}
      />
    )
  }
  if (!split) return null
  const hasQuote = collapseQuotes && split.quoted.length > 0
  return (
    <div className="space-y-2">
      <PlainText text={hasQuote ? split.body : message.text ?? ''} />
      {hasQuote && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className={cx('rounded-full border border-border bg-background px-3 py-1 text-xs font-medium transition-colors hover:bg-muted', FOCUS)}
          >
            {open ? labels.hideQuoted : labels.showQuoted}
          </button>
          {open && (
            <div className="border-l-2 border-border pl-3 text-muted-foreground">
              <PlainText text={split.quoted.replace(/^>+ ?/gm, '')} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Attachments({ items, onOpen, labels }: { items: InboxAttachment[]; onOpen?: (a: InboxAttachment) => void; labels: InboxLabels }) {
  return (
    <ul aria-label={labels.attachments} className="mt-3 flex flex-wrap gap-2">
      {items.map((a) => {
        const inner = (
          <>
            <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 max-w-48 truncate text-sm font-medium">{a.name}</span>
            {a.size != null && <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(a.size)}</span>}
            <Download className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">{labels.download}</span>
          </>
        )
        const cls = cx('flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 transition-colors hover:bg-muted', FOCUS)
        return (
          <li key={a.id}>
            {onOpen ? (
              <button type="button" className={cls} onClick={() => onOpen(a)}>
                {inner}
              </button>
            ) : safeUrl(a.url) ? (
              <a className={cls} href={safeUrl(a.url)} download={a.name} target="_blank" rel="noopener noreferrer">
                {inner}
              </a>
            ) : (
              <span className={cls}>{inner}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function StatusIcon({ status, labels }: { status?: ThreadMessage['status']; labels: InboxLabels }) {
  if (!status) return null
  const map = {
    sending: [<Loader2 key="s" className="size-3 animate-spin motion-reduce:animate-none" />, labels.statusSending],
    sent: [<Check key="s" className="size-3" />, labels.statusSent],
    delivered: [<CheckCheck key="s" className="size-3" />, labels.statusDelivered],
    failed: [<AlertTriangle key="s" className="size-3 text-destructive" />, labels.statusFailed],
  } as const
  const [icon, text] = map[status]
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={text}>
      {icon}
      <span className="sr-only">{text}</span>
    </span>
  )
}

interface GroupProps {
  group: MessageGroup
  locale: string
  labels: InboxLabels
  collapseQuotes: boolean
  rewriteImageUrl?: (url: string) => string
  onOpenAttachment?: (a: InboxAttachment, m: ThreadMessage) => void
  onRetrySend?: (m: ThreadMessage) => void
  onLoadImages?: (m: ThreadMessage) => void
  renderMessageActions?: (m: ThreadMessage) => ReactNode
}

const Group = memo(function Group({ group, locale, labels, collapseQuotes, rewriteImageUrl, onOpenAttachment, onRetrySend, onLoadImages, renderMessageActions }: GroupProps) {
  const out = group.direction === 'out'
  const name = out ? labels.you : senderName(group.sender, '—')
  const first = group.messages[0]!
  return (
    <section aria-label={name} className="flex gap-3 px-4 py-3 [content-visibility:auto] [contain-intrinsic-size:auto_120px] sm:px-6">
      <span
        aria-hidden
        className={cx(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold',
          out ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        {safeUrl(group.sender.avatarUrl) ? <img src={safeUrl(group.sender.avatarUrl)} alt="" className="size-full object-cover" loading="lazy" /> : initials(name)}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <header className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{name}</span>
          {!out && group.sender.name && group.sender.address && (
            <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:inline">{group.sender.address}</span>
          )}
          <time className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground" title={formatFullTime(first.sentAt, locale)}>
            {formatFullTime(first.sentAt, locale)}
          </time>
        </header>
        {group.messages.map((m) => (
          <article key={m.id} data-message-id={m.id} className="group/msg relative">
            <Body message={m} collapseQuotes={collapseQuotes} rewriteImageUrl={rewriteImageUrl} onLoadImages={onLoadImages} labels={labels} />
            {m.attachments && m.attachments.length > 0 && (
              <Attachments items={m.attachments} onOpen={onOpenAttachment ? (a) => onOpenAttachment(a, m) : undefined} labels={labels} />
            )}
            {(m.status || renderMessageActions) && (
              <div className="mt-1 flex items-center gap-2">
                <StatusIcon status={m.status} labels={labels} />
                {m.status === 'failed' && onRetrySend && (
                  <button type="button" onClick={() => onRetrySend(m)} className={cx('rounded px-1 text-xs font-medium text-destructive underline-offset-2 hover:underline', FOCUS)}>
                    {labels.retry}
                  </button>
                )}
                {renderMessageActions?.(m)}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
})

export interface ThreadViewProps {
  messages: ThreadMessage[]
  /** Thread title shown in the sticky header. */
  title?: string
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  /** Grouping window in ms. 0 disables grouping. */
  groupWindowMs?: number
  collapseQuotes?: boolean
  rewriteImageUrl?: (url: string) => string
  /** Provide to fetch/sign attachments yourself; otherwise `url` is linked. */
  onOpenAttachment?: (a: InboxAttachment, m: ThreadMessage) => void
  onRetrySend?: (m: ThreadMessage) => void
  /** The user opted to load remote images in a message. */
  onLoadImages?: (m: ThreadMessage) => void
  renderMessageActions?: (m: ThreadMessage) => ReactNode
  /** Header actions (archive, snooze...). */
  actions?: ReactNode
  /** Optional slot under the messages: composer, proposal cards. */
  footer?: ReactNode
  emptyState?: ReactNode
  labels?: Partial<InboxLabels>
  className?: string
}

/** Scrollable conversation: grouped messages, collapsible quotes, attachments, states. */
export function ThreadView({
  messages,
  title,
  loading,
  error,
  onRetry,
  groupWindowMs = 5 * 60_000,
  collapseQuotes = true,
  rewriteImageUrl,
  onOpenAttachment,
  onRetrySend,
  onLoadImages,
  renderMessageActions,
  actions,
  footer,
  emptyState,
  labels: o,
  className,
}: ThreadViewProps) {
  const { labels, locale } = useInboxLabels(o)
  const groups = useMemo(() => (groupWindowMs > 0 ? groupMessages(messages, groupWindowMs) : groupMessages(messages, -1)), [messages, groupWindowMs])
  const endRef = useRef<HTMLDivElement>(null)
  const lastId = messages[messages.length - 1]?.id

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [lastId])

  let content: ReactNode
  if (error && messages.length === 0) content = <ErrorState onRetry={onRetry} labels={o} />
  else if (loading && messages.length === 0) content = <ThreadSkeleton />
  else if (messages.length === 0)
    content = emptyState ?? <EmptyState title={labels.emptyThreadTitle} description={labels.emptyThreadBody} />
  else
    content = (
      <div role="log" aria-label={title} aria-live="polite" className="divide-y divide-border/40">
        {groups.map((g) => (
          <Group
            key={g.key}
            group={g}
            locale={locale}
            labels={labels}
            collapseQuotes={collapseQuotes}
            rewriteImageUrl={rewriteImageUrl}
            onOpenAttachment={onOpenAttachment}
            onRetrySend={onRetrySend}
            onLoadImages={onLoadImages}
            renderMessageActions={renderMessageActions}
          />
        ))}
        <div ref={endRef} />
      </div>
    )

  return (
    <div className={cx('flex h-full min-h-0 flex-col', className)}>
      {(title || actions) && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-4 py-3 sm:px-6">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-foreground">{title || labels.noSubject}</h2>
          {actions}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{content}</div>
      {footer && <div className="shrink-0 border-t border-border/50">{footer}</div>}
    </div>
  )
}
