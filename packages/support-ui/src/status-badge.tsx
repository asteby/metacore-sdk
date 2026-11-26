import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@asteby/metacore-ui/primitives'
import { SUPPORT_STATE_META, type SupportClientState } from './lifecycle'
import { useSupportT } from './labels'

export interface SupportStatusBadgeProps {
  state: SupportClientState
  /** Hide the explanation tooltip (e.g. where the hint is already visible next to it). */
  hideHint?: boolean
  className?: string
}

/**
 * State chip with icon + text (never colour alone). The tooltip, focusable by keyboard, carries the
 * one-line explanation of what is happening and what the customer can do.
 */
export function SupportStatusBadge({ state, hideHint, className }: SupportStatusBadgeProps) {
  const { t } = useSupportT()
  const { icon: Icon, tone } = SUPPORT_STATE_META[state]
  const label = t(`state.${state}.label`)
  const badge = (
    <Badge variant={tone} className={className} data-testid="support-state" data-state={state} tabIndex={hideHint ? undefined : 0}>
      <Icon aria-hidden />
      {label}
    </Badge>
  )
  if (hideHint) return badge
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-64 text-balance">{t(`state.${state}.hint`)}</TooltipContent>
    </Tooltip>
  )
}
