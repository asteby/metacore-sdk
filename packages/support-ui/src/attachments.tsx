import { Download } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@asteby/metacore-ui/primitives'
import { isAttachmentExpired, type SupportAttachmentView } from '@asteby/metacore-sdk/support'
import type { SupportT } from './labels'

const mimeOf = (a: SupportAttachmentView) => a.content_type ?? a.mime_type ?? ''

export const isImage = (a: SupportAttachmentView) => mimeOf(a).startsWith('image/') && !/svg/i.test(mimeOf(a))

/** Only http(s), blob and same-origin paths ever reach an `href`/`src`. */
export function safeHref(url?: string): string | undefined {
  if (!url) return undefined
  return /^(https?:|blob:|\/(?!\/))/i.test(url.trim()) ? url : undefined
}

/** Has a link that is safe to open and has not expired. */
export const usable = (a: SupportAttachmentView, now: number) => !isAttachmentExpired(a, now) && Boolean(safeHref(a.url))

/** Thumbnails of the image attachments plus a notice for each one whose link expired. */
export function MessageAttachments({
  attachments,
  now,
  t,
  onOpen,
}: {
  attachments: Array<{ key: string; value: SupportAttachmentView }>
  now: number
  t: SupportT
  onOpen: (key: string) => void
}) {
  const thumbs = attachments.filter((a) => isImage(a.value) && usable(a.value, now))
  const expired = attachments.filter((a) => isAttachmentExpired(a.value, now))
  if (thumbs.length === 0 && expired.length === 0) return null
  return (
    <div className="flex w-full flex-col gap-2">
      {thumbs.length > 0 && (
        <ul aria-label={t('attachmentsOf')} className="flex flex-wrap gap-2">
          {thumbs.map((a) => (
            <li key={a.key}>
              <button
                type="button"
                aria-label={t('viewer.open', { name: a.value.name })}
                onClick={() => onOpen(a.key)}
                className="block overflow-hidden rounded-md border border-border bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <img src={safeHref(a.value.url)} alt={t('viewer.thumb', { name: a.value.name })} loading="lazy" className="size-20 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {expired.map((a) => (
        <Alert key={a.key} variant="destructive" data-testid="attachment-expired">
          <AlertTitle>{t('expired.title')}</AlertTitle>
          <AlertDescription>{t('expired.body', { name: a.value.name })}</AlertDescription>
        </Alert>
      ))}
    </div>
  )
}

/** Preview dialog with download. An expired attachment shows the notice instead of the file. */
export function AttachmentViewer({
  attachment,
  now,
  t,
  onClose,
}: {
  attachment: SupportAttachmentView | null
  now: number
  t: SupportT
  onClose: () => void
}) {
  const a = attachment
  const expired = a ? isAttachmentExpired(a, now) : false
  const href = a && !expired ? safeHref(a.url) : undefined
  return (
    <Dialog open={Boolean(a)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="break-all">{t('viewer.title', { name: a?.name ?? '' })}</DialogTitle>
          <DialogDescription className="sr-only">{(a && mimeOf(a)) || a?.name}</DialogDescription>
        </DialogHeader>
        {a && expired ? (
          <Alert variant="destructive">
            <AlertTitle>{t('expired.title')}</AlertTitle>
            <AlertDescription>{t('expired.body', { name: a.name })}</AlertDescription>
          </Alert>
        ) : a && href && isImage(a) ? (
          <img src={href} alt={a.name} className="max-h-[60vh] w-full rounded-md bg-muted object-contain" />
        ) : (
          <p className="text-sm text-muted-foreground">{t('viewer.noPreview')}</p>
        )}
        <DialogFooter>
          {href && (
            <Button asChild>
              <a href={href} download={a?.name} target="_blank" rel="noopener noreferrer">
                <Download aria-hidden />
                {t('viewer.download')}
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
