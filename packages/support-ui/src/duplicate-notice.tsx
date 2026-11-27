import { Alert, AlertDescription, AlertTitle, Button } from '@asteby/metacore-ui/primitives'
import { useSupportT } from './labels'

export interface SupportDuplicateNoticeProps {
  /** The ticket that is still open. */
  folio: string
  subject?: string
  onContinue: () => void
  onOpenNew: () => void
  onCancel?: () => void
  className?: string
}

/**
 * Shown when the person starts a new ticket while another one is open: names the open one and lets
 * them continue it or open a new one. Inline (not a modal) so it also themes inside the embed.
 */
export function SupportDuplicateNotice({ folio, subject, onContinue, onOpenNew, onCancel, className }: SupportDuplicateNoticeProps) {
  const { t } = useSupportT()
  return (
    <Alert role="alertdialog" aria-labelledby="support-dup-title" className={className} data-testid="support-duplicate-notice">
      <AlertTitle id="support-dup-title">{t('duplicate.title')}</AlertTitle>
      <AlertDescription>
        <p>{t('duplicate.body', { folio, subject: subject ?? '' })}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onContinue}>
            {t('duplicate.continue', { folio })}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onOpenNew}>
            {t('duplicate.openNew')}
          </Button>
          {onCancel ? (
            <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
              {t('duplicate.cancel')}
            </Button>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  )
}
