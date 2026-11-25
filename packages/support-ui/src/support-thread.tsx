import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Composer,
  InboxProvider,
  ThreadView,
  type ComposerAttachment,
  type ComposerValue,
  type InboxLabels,
  type ThreadMessage,
} from '@asteby/metacore-inbox'
import { Alert, AlertDescription, AlertTitle, Badge, Button } from '@asteby/metacore-ui/primitives'
import type { SupportAttachmentView, SupportCaseStatus, SupportMessage } from '@asteby/metacore-sdk/support'
import { AttachmentViewer, MessageAttachments, usable } from './attachments'
import { useSupportT } from './labels'
import { useSupportThread, type SupportThreadApi } from './use-support-thread'

export interface SupportThreadProps {
  /** Transport adapter (`createSupportApi(...)` from `@asteby/metacore-sdk/support` or a stand-in). */
  api: SupportThreadApi
  /** Case folio. The component knows nothing about the instance. */
  folio: string
  /** Name shown on the optimistic message of the person writing. */
  authorName?: string
  /** Uploads one file and returns it as an attachment (with its signed URL). Without it, files are sent by name only. */
  uploadAttachment?: (file: File) => Promise<SupportAttachmentView>
  maxAttachmentBytes?: number
  /** Reopens a resolved case. The reopen button only shows when this is set; the thread reloads when it resolves. */
  onReopen?: () => void | Promise<void>
  /** Idempotency key generator for outgoing messages. */
  newId?: () => string
  /** Clock, injectable for expiry checks. */
  now?: () => number
  className?: string
}

const STATUS_VARIANT = { open: 'info', resolved: 'success', closed: 'muted' } as const satisfies Record<SupportCaseStatus, string>

let uid = 0

/**
 * Support thread: person / agent / AI messages, case status, attachments with thumbnail, viewer
 * and expiry notice, and a composer. Built from `metacore-inbox` (thread + composer) and
 * `metacore-ui` primitives; data goes through the injected `api`.
 */
export function SupportThread({
  api,
  folio,
  authorName,
  uploadAttachment,
  maxAttachmentBytes,
  onReopen,
  newId,
  now = Date.now,
  className,
}: SupportThreadProps) {
  const { t, locale } = useSupportT()
  const { status, error, supportCase, send, retry, reload } = useSupportThread({ api, folio, authorName, newId })
  const [viewing, setViewing] = useState<SupportAttachmentView | null>(null)
  const [reopening, setReopening] = useState(false)
  const uploaded = useRef(new Map<string, SupportAttachmentView>())
  const clock = now()

  const index = useMemo(() => {
    const attachments = new Map<string, SupportAttachmentView>()
    const messages = new Map<string, SupportMessage>()
    for (const m of supportCase?.messages ?? []) {
      messages.set(m.id, m)
      m.attachments?.forEach((a, i) => attachments.set(`${m.id}:${a.id ?? i}`, a))
    }
    return { attachments, messages }
  }, [supportCase?.messages])

  const messages = useMemo<ThreadMessage[]>(
    () =>
      (supportCase?.messages ?? []).map((m) => ({
        id: m.id,
        direction: m.author_type === 'reporter' ? 'out' : 'in',
        sender: { name: m.author_name || t(`author.${m.author_type === 'reporter' ? 'you' : m.author_type}`) },
        sentAt: m.created_at,
        text: m.body,
        status: m.state,
        attachments: m.attachments?.map((a, i) => ({
          id: `${m.id}:${a.id ?? i}`,
          name: a.name,
          size: a.size,
          mimeType: a.content_type ?? a.mime_type,
          // A dead link is never handed to the thread: the click opens the viewer with the notice.
          url: usable(a, clock) ? a.url : undefined,
        })),
      })),
    [supportCase?.messages, t, clock],
  )

  const labels = useMemo<Partial<InboxLabels>>(
    () => ({
      emptyThreadTitle: t('emptyTitle'),
      emptyThreadBody: t('emptyBody'),
      errorTitle: t('loadErrorTitle'),
      errorBody: t('loadErrorBody'),
      retry: t('retry'),
      loading: t('loading'),
      you: t('author.you'),
      placeholder: t('placeholder'),
      send: t('send'),
      attach: t('attach'),
    }),
    [t],
  )

  const upload = useMemo(
    () =>
      uploadAttachment
        ? async (file: File): Promise<Omit<ComposerAttachment, 'file'>> => {
            const a = await uploadAttachment(file)
            const id = a.id ?? `up_${++uid}`
            uploaded.current.set(id, { ...a, id })
            return { id, name: a.name, size: a.size, mimeType: a.content_type ?? a.mime_type }
          }
        : undefined,
    [uploadAttachment],
  )

  const handleSend = useCallback(
    async (value: ComposerValue) => {
      const attachments = value.attachments.map<SupportAttachmentView>((c) => {
        const up = uploaded.current.get(c.id)
        uploaded.current.delete(c.id)
        return up ?? { id: c.id, name: c.name, size: c.size, mime_type: c.mimeType }
      })
      // The optimistic message carries its own `failed` state and retry, so the composer clears at once.
      await send({ body: value.text, attachments: attachments.length ? attachments : undefined }).catch(() => {})
    },
    [send],
  )

  const handleReopen = async () => {
    if (!onReopen) return
    setReopening(true)
    try {
      await onReopen()
      reload()
    } finally {
      setReopening(false)
    }
  }

  const caseStatus = supportCase?.status
  let footer: ReactNode = null
  if (status === 'ready' && caseStatus === 'open') {
    footer = (
      <Composer
        onSend={handleSend}
        draftKey={`support:${folio}`}
        formatting={false}
        uploadAttachment={upload}
        maxAttachmentBytes={maxAttachmentBytes}
        labels={labels}
      />
    )
  } else if (status === 'ready' && caseStatus) {
    const resolved = caseStatus === 'resolved'
    footer = (
      <div className="p-3 sm:p-4">
        <Alert>
          <AlertTitle>{t(resolved ? 'resolvedTitle' : 'closedTitle')}</AlertTitle>
          <AlertDescription>
            <p>{supportCase?.solution || t(resolved ? 'resolvedBody' : 'closedBody')}</p>
            {resolved && onReopen && (
              <Button type="button" variant="outline" size="sm" className="mt-2" disabled={reopening} onClick={handleReopen}>
                {reopening ? t('reopening') : t('reopen')}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <InboxProvider locale={locale}>
      <ThreadView
        className={className}
        title={supportCase?.subject}
        messages={messages}
        loading={status === 'loading'}
        error={status === 'error' ? error : undefined}
        onRetry={reload}
        labels={labels}
        actions={
          caseStatus ? (
            <Badge variant={STATUS_VARIANT[caseStatus] ?? 'muted'} data-testid="case-status">
              {t(`status.${caseStatus}`)}
            </Badge>
          ) : undefined
        }
        onOpenAttachment={(a) => setViewing(index.attachments.get(a.id) ?? null)}
        onRetrySend={(m) => void retry(m.id).catch(() => {})}
        renderMessageActions={(m) => {
          const src = index.messages.get(m.id)
          if (!src) return null
          const items = (src.attachments ?? []).map((a, i) => ({ key: `${src.id}:${a.id ?? i}`, value: a }))
          return (
            <>
              {src.author_type === 'ai' && (
                <Badge variant="muted" title={t('author.ai')}>
                  {t('aiBadge')}
                </Badge>
              )}
              <MessageAttachments attachments={items} now={clock} t={t} onOpen={(k) => setViewing(index.attachments.get(k) ?? null)} />
            </>
          )
        }}
        footer={footer}
      />
      <AttachmentViewer attachment={viewing} now={clock} t={t} onClose={() => setViewing(null)} />
    </InboxProvider>
  )
}
