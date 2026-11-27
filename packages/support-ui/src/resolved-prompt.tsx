import { Alert, AlertDescription, AlertTitle } from '@asteby/metacore-ui/primitives'
import { SupportActionBar, type SupportCardAction } from './ticket-actions'
import { useSupportT } from './labels'

export interface SupportResolvedPromptProps {
  folio: string
  /** `resolved` asks "Was it resolved?" (reopen / finish / open another); `closed` only offers a new ticket. */
  state: 'resolved' | 'closed'
  solution?: string
  /** Only the actions given are offered, so a surface without `close` (Hub widget) shows fewer buttons. */
  onReopen?: () => void | Promise<void>
  onFinalize?: () => void | Promise<void>
  onOpenAnother?: () => void
  busy?: string | null
  /** The last action failed. */
  failed?: boolean
  className?: string
}

/** The footer that replaces the composer once a ticket is resolved or finished. */
export function SupportResolvedPrompt({ folio, state, solution, onReopen, onFinalize, onOpenAnother, busy, failed, className }: SupportResolvedPromptProps) {
  const { t } = useSupportT()
  const resolved = state === 'resolved'
  const actions: SupportCardAction[] = []
  if (resolved && onReopen) actions.push({ id: 'reopen' })
  if (resolved && onFinalize) actions.push({ id: 'finalize' })
  if (onOpenAnother) actions.push({ id: 'open_another' })
  const run = async (a: SupportCardAction) => {
    if (a.id === 'reopen') await onReopen?.()
    else if (a.id === 'finalize') await onFinalize?.()
    else onOpenAnother?.()
  }
  return (
    <div className={['p-3 sm:p-4', className].filter(Boolean).join(' ')} data-testid="support-resolved-prompt" data-state={state}>
      <Alert>
        <AlertTitle>{resolved ? t('resolvedPrompt.title') : t('closedPrompt.title')}</AlertTitle>
        <AlertDescription>
          <p>{resolved ? t('resolvedPrompt.body', { folio }) : t('closedPrompt.body', { folio })}</p>
          {solution ? <p className="whitespace-pre-wrap text-muted-foreground">{solution}</p> : null}
          <SupportActionBar actions={actions} onAction={run} busy={busy} className="mt-2" />
          {failed ? (
            <p role="alert" className="mt-1 text-destructive">
              {t('action.failed')}
            </p>
          ) : null}
        </AlertDescription>
      </Alert>
    </div>
  )
}
