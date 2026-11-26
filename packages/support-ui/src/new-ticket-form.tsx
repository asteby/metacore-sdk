import { useId, useState } from 'react'
import { Button, Input, Textarea } from '@asteby/metacore-ui/primitives'
import { SupportDuplicateNotice } from './duplicate-notice'
import { useSupportT } from './labels'

export interface SupportNewTicketFormProps {
  /** Creates the ticket and resolves once it exists. A rejection shows the generic error. */
  onSubmit: (subject: string, body: string) => Promise<void>
  /** A ticket that is still open: when given, submitting first asks "continue it or open a new one?". */
  openTicket?: { folio: string; subject?: string }
  /** The person chose to keep working on the open ticket. */
  onContinue?: () => void
  onCancel?: () => void
  /** Ask for a subject (the embed does; the chat derives it from the first line). */
  withSubject?: boolean
  className?: string
}

/**
 * "New ticket" form shared by the team chat and the embed. When another ticket is open it names it
 * (folio + subject) and lets the person continue that one or open a new one before anything is sent.
 */
export function SupportNewTicketForm({ onSubmit, openTicket, onContinue, onCancel, withSubject = true, className }: SupportNewTicketFormProps) {
  const { t } = useSupportT()
  const id = useId()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [asking, setAsking] = useState(false)

  const submit = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await onSubmit(subject.trim(), body.trim())
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className={['space-y-3 p-4', className].filter(Boolean).join(' ')}
      aria-labelledby={`${id}-h`}
      onSubmit={(e) => {
        e.preventDefault()
        if (!body.trim() || busy) return
        if (openTicket && !confirmed) {
          setAsking(true)
          return
        }
        void submit()
      }}
    >
      <h2 id={`${id}-h`} className="text-sm font-semibold">
        {t('newTicket.title')}
      </h2>
      <p className="text-xs text-muted-foreground">{t('newTicket.hint')}</p>
      {withSubject ? (
        <div className="space-y-1">
          <label htmlFor={`${id}-s`} className="text-sm font-medium">
            {t('embed.subject')}
          </label>
          <Input id={`${id}-s`} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
        </div>
      ) : null}
      <div className="space-y-1">
        <label htmlFor={`${id}-b`} className="text-sm font-medium">
          {t('newTicket.body')}
        </label>
        <Textarea id={`${id}-b`} value={body} maxLength={8000} required rows={5} placeholder={t('newTicket.placeholder')} onChange={(e) => setBody(e.target.value)} />
      </div>
      {asking && openTicket ? (
        <SupportDuplicateNotice
          folio={openTicket.folio}
          subject={openTicket.subject}
          onContinue={() => onContinue?.()}
          onOpenNew={() => {
            setConfirmed(true)
            setAsking(false)
            void submit()
          }}
          onCancel={() => setAsking(false)}
        />
      ) : null}
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {t('embed.errorBody')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || !body.trim() || asking}>
          {busy ? t('embed.starting2') : t('newTicket.submit')}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('duplicate.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
