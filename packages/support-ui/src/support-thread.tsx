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
import { STATUS_VARIANT } from './support-case-card'
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
  /** Show the attach button. Defaults to whether `uploadAttachment` is given: without an uploader (anonymous widget visitors) there is nothing to attach to. Pass `true` to keep the legacy send-by-name behavior. */
  allowAttachments?: boolean
  /** Overrides the reopen action (default: `api.reopen`). The reopen button shows when this or `api.reopen` exists; the thread reloads after `onReopen`. */
  onReopen?: () => void | Promise<void>
  /** Idempotency key generator for outgoing messages. */
  newId?: () => string
  /** Clock, injectable for expiry checks. */
  now?: () => number
  className?: string
}

/** Load failures that retrying cannot fix: no retry button, a specific message. */
const FINAL_LOAD_ERRORS = new Set(['support_disabled', 'forbidden', 'unauthorized', 'not_found'])
const LOAD_ERROR_KEY: Record<string, string> = {
  support_disabled: 'disabled',
  forbidden: 'forbidden',
  unauthorized: 'forbidden',
  not_found: 'not_found',
  rate_limited: 'rate_limited',
}
const SEND_ERRORS = new Set(['rate_limited', 'case_resolved', 'case_closed', 'body_required', 'body_too_long', 'too_many_attachments', 'invalid_attachment', 'support_disabled', 'forbidden'])

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ')

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
  allowAttachments,
  onReopen,
  newId,
  now = Date.now,
  className,
}: SupportThreadProps) {
  const { t, locale } = useSupportT()
  const { status, error, errorCode, supportCase, send, sendErrorCode, retry, hasOlder, loadingOlder, loadOlder, reopen, reload } = useSupportThread({
    api,
    folio,
    authorName,
    newId,
  })
  const canReopen = Boolean(onReopen || api.reopen)
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

  const errKind = errorCode ? LOAD_ERROR_KEY[errorCode] : undefined
  const labels = useMemo<Partial<InboxLabels>>(
    () => ({
      emptyThreadTitle: t('emptyTitle'),
      emptyThreadBody: t('emptyBody'),
      errorTitle: t(errKind ? `loadErrors.${errKind}.title` : 'loadErrorTitle'),
      errorBody: t(errKind ? `loadErrors.${errKind}.body` : 'loadErrorBody'),
      retry: t('retry'),
      loading: t('loading'),
      you: t('author.you'),
      placeholder: t('placeholder'),
      send: t('send'),
      attach: t('attach'),
    }),
    [t, errKind],
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
    setReopening(true)
    try {
      if (onReopen) {
        await onReopen()
        reload()
      } else await reopen()
    } finally {
      setReopening(false)
    }
  }

  const caseStatus = supportCase?.status
  let footer: ReactNode = null
  if (status === 'ready' && caseStatus === 'open') {
    footer = (
      <>
        {sendErrorCode && (
          <Alert variant="destructive" className="m-3 w-auto" data-testid="send-error">
            <AlertDescription>{t(SEND_ERRORS.has(sendErrorCode) ? `sendErrors.${sendErrorCode}` : 'sendErrors.unknown')}</AlertDescription>
          </Alert>
        )}
        <Composer
          onSend={handleSend}
          draftKey={`support:${folio}`}
          formatting={false}
          uploadAttachment={upload}
          maxAttachmentBytes={maxAttachmentBytes}
          attachable={allowAttachments ?? Boolean(uploadAttachment)}
          labels={labels}
        />
      </>
    )
  } else if (status === 'ready' && caseStatus) {
    const resolved = caseStatus === 'resolved'
    footer = (
      <div className="p-3 sm:p-4">
        <Alert>
          <AlertTitle>{t(resolved ? 'resolvedTitle' : 'closedTitle')}</AlertTitle>
          <AlertDescription>
            <p>{supportCase?.solution || t(resolved ? 'resolvedBody' : 'closedBody')}</p>
            {resolved && canReopen && (
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
      <div className={cx('flex h-full min-h-0 flex-col', className)}>
      {hasOlder && (
        <div className="flex shrink-0 justify-center border-b border-border/50 p-2">
          <Button type="button" variant="ghost" size="sm" disabled={loadingOlder} onClick={() => void loadOlder().catch(() => {})}>
            {loadingOlder ? t('loadingOlder') : t('loadOlder')}
          </Button>
        </div>
      )}
      <ThreadView
        className="min-h-0 flex-1"
        title={supportCase?.subject}
        messages={messages}
        loading={status === 'loading'}
        error={status === 'error' ? error : undefined}
        onRetry={errorCode && FINAL_LOAD_ERRORS.has(errorCode) ? undefined : reload}
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
      </div>
      <AttachmentViewer attachment={viewing} now={clock} t={t} onClose={() => setViewing(null)} />
    </InboxProvider>
  )
}
