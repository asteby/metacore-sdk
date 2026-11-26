import { Button } from '@asteby/metacore-ui/primitives'
import type { SupportClientAction } from './lifecycle'
import { useSupportT } from './labels'

/** An action offered on a card or prompt. Texts come from the id (`action.*`); nothing is hardcoded. */
export interface SupportCardAction {
  id: SupportClientAction
  /** Navigation target (`view`). The host may intercept it through `onAction`. */
  href?: string
  /** Server-declared request the host runs for `reopen` / `finalize`. */
  request?: { method: string; path: string }
}

export interface SupportActionBarProps {
  actions: SupportCardAction[]
  /** Runs an action; return a promise to show the busy state. Without it `view` is a plain link. */
  onAction?: (a: SupportCardAction) => void | Promise<void>
  busy?: string | null
  className?: string
}

const KEY: Record<SupportClientAction, string> = {
  view: 'action.view',
  reopen: 'action.reopen',
  finalize: 'action.finalize',
  open_another: 'action.openAnother',
  reply: 'action.reply',
}

const VARIANT: Record<SupportClientAction, 'default' | 'outline' | 'ghost' | 'link'> = {
  view: 'link',
  reopen: 'outline',
  finalize: 'outline',
  open_another: 'default',
  reply: 'outline',
}

/** Row of contextual buttons shared by the lifecycle cards, the resolved prompt and the thread footer. */
export function SupportActionBar({ actions, onAction, busy, className }: SupportActionBarProps) {
  const { t } = useSupportT()
  if (!actions.length) return null
  return (
    <div className={['flex flex-wrap items-center gap-2', className].filter(Boolean).join(' ')}>
      {actions.map((a) => {
        const label = busy === a.id ? t('action.working') : t(KEY[a.id])
        if (a.id === 'view' && a.href && !onAction) {
          return (
            <Button key={a.id} asChild size="sm" variant={VARIANT[a.id]} className="h-7 px-1">
              <a href={a.href}>{label}</a>
            </Button>
          )
        }
        return (
          <Button
            key={a.id}
            type="button"
            size="sm"
            variant={VARIANT[a.id]}
            className={a.id === 'view' ? 'h-7 px-1' : undefined}
            disabled={Boolean(busy)}
            data-action={a.id}
            onClick={() => void onAction?.(a)}
          >
            {label}
          </Button>
        )
      })}
    </div>
  )
}
