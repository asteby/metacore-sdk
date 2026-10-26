/**
 * The unified timeline of an order (`OrderProgress`), the status badge and the next-action button. Headless: no styles,
 * `data-sf-*` hooks and `classNames` slots. Reads `order.progress` / `order.next_action` (or derives them for an older
 * OPS) and never invents a state: an unknown stage, step or problem code renders as a generic text.
 */
import type { NextAction, Order, OrderProgress as OrderProgressData, OrderProgressStep } from '@asteby/storefront'
import { nextAction as deriveNextAction, orderProgress as deriveProgress, safeTrackingUrl } from '@asteby/storefront'
import type { MouseEvent, ReactNode } from 'react'
import { enumText } from './orders-messages.js'
import { Hidden, Time, useAccountText, type AccountTextProps } from './orders-ui.js'

const STEP_STATES = new Set(['done', 'current', 'pending', 'problem'])
const stepState = (s: unknown): 'done' | 'current' | 'pending' | 'problem' => (typeof s === 'string' && STEP_STATES.has(s) ? (s as 'done') : 'pending')

/** A shape per state so the state never depends on color alone. */
const GLYPH = { done: '✓', current: '●', pending: '○', problem: '!' } as const

export type OrderTone = 'done' | 'current' | 'problem' | 'muted'

/** Tone of a stage for the store's own colors (`data-sf-tone`). */
export function stageTone(stage: string, problem?: unknown): OrderTone {
  if (problem) return 'problem'
  if (stage === 'delivered') return 'done'
  if (stage === 'cancelled' || stage === 'refunded') return 'muted'
  if (['pending_payment', 'paid', 'preparing', 'ready_for_pickup', 'shipped', 'in_transit', 'out_for_delivery'].includes(stage)) return 'current'
  return 'muted'
}

export type OrderStatusBadgeProps = AccountTextProps & {
  /** The order (its `progress` or a derived one is used) ... */
  order?: Order
  /** ... or the progress itself. */
  progress?: OrderProgressData
  className?: string
}

/** Status in words with a semantic tone: `<span data-sf-order-badge data-sf-tone="current">En camino</span>`. */
export function OrderStatusBadge({ order, progress, className, ...text }: OrderStatusBadgeProps) {
  const { m } = useAccountText(text)
  const p = progress ?? (order ? deriveProgress(order) : null)
  if (!p) return null
  return (
    <span className={className} data-sf-order-badge data-sf-stage={p.stage} data-sf-tone={stageTone(p.stage, p.problem)}>
      {enumText(m, 'stage', p.stage)}
      {p.problem ? <Hidden>{`, ${m['stepState.problem']}`}</Hidden> : null}
    </span>
  )
}

export type OrderProgressClassNames = Partial<Record<'root' | 'list' | 'step' | 'marker' | 'label' | 'time' | 'problem' | 'terminal', string>>

export type OrderProgressProps = AccountTextProps & {
  /** Pass the order (progress is read or derived) ... */
  order?: Order
  /** ... or the progress. */
  progress?: OrderProgressData
  /** `compact`: only the current step and "step 3 of 5", for a list card. */
  variant?: 'full' | 'compact'
  classNames?: OrderProgressClassNames
}

/**
 * `<ol>` with the steps paid → preparing → shipped → on its way → delivered (or pickup). The current step carries
 * `aria-current="step"`; every state also has text for screen readers, and a problem is written out below the list.
 */
export function OrderProgress({ order, progress, variant = 'full', classNames: cx = {}, ...text }: OrderProgressProps) {
  const { m, t, date } = useAccountText(text)
  const p = progress ?? (order ? deriveProgress(order) : null)
  if (!p) return null
  const steps: OrderProgressStep[] = Array.isArray(p.steps) ? p.steps.filter((s) => s && typeof s === 'object') : []
  const stepLabel = (s: OrderProgressStep) => enumText(m, 'step', s.key)

  if (steps.length === 0 || p.stage === 'cancelled' || p.stage === 'refunded') {
    const note = p.stage === 'cancelled' ? m['progress.cancelled'] : p.stage === 'refunded' ? m['progress.refunded'] : enumText(m, 'stage', p.stage)
    return (
      <div className={cx.root} data-sf-progress data-sf-stage={p.stage} data-sf-variant={variant}>
        <p className={cx.terminal} data-sf-progress-terminal>
          {note}
        </p>
      </div>
    )
  }

  if (variant === 'compact') {
    const at = Math.max(0, steps.findIndex((s) => stepState(s.state) === 'current' || stepState(s.state) === 'problem'))
    const index = steps.some((s) => stepState(s.state) === 'current' || stepState(s.state) === 'problem') ? at : steps.every((s) => stepState(s.state) === 'done') ? steps.length - 1 : 0
    return (
      <div className={cx.root} data-sf-progress data-sf-stage={p.stage} data-sf-variant="compact">
        <p className={cx.label} data-sf-progress-summary>
          {t('order.stepOf', { n: index + 1, total: steps.length, step: stepLabel(steps[index]!) })}
        </p>
      </div>
    )
  }

  return (
    <div className={cx.root} data-sf-progress data-sf-stage={p.stage} data-sf-variant="full">
      <ol className={cx.list} aria-label={m['progress.label']} data-sf-progress-list>
        {steps.map((s, i) => {
          const state = stepState(s.state)
          return (
            <li key={`${s.key}-${i}`} className={cx.step} data-sf-step={typeof s.key === 'string' ? s.key : 'unknown'} data-sf-step-state={state} {...(state === 'current' || state === 'problem' ? { 'aria-current': 'step' as const } : {})}>
              <span className={cx.marker} aria-hidden="true" data-sf-step-marker>
                {GLYPH[state]}
              </span>
              <span className={cx.label} data-sf-step-label>
                {stepLabel(s)}
                <Hidden>{`, ${m[`stepState.${state}`]}`}</Hidden>
              </span>
              <Time value={s.at} text={date(s.at)} className={cx.time} />
            </li>
          )
        })}
      </ol>
      {p.problem ? (
        <p className={cx.problem} data-sf-progress-problem={typeof p.problem.code === 'string' ? p.problem.code : 'unknown'}>
          {enumText(m, 'problem', p.problem.code)}
        </p>
      ) : null}
    </div>
  )
}

export type NextActionBarClassNames = Partial<Record<'root' | 'primary' | 'secondary', string>>

export type NextActionBarProps = AccountTextProps & {
  /** The order (its `next_action` is read or derived) ... */
  order?: Order
  /** ... or the action itself. */
  action?: NextAction | null
  /**
   * Where each action goes in YOUR store: `pay` → the voucher/checkout, `download_invoice` → your invoice-file route,
   * `request_invoice` / `correct_invoice_data` → your invoice form, `contact_store` → your contact page. `track` and
   * `pickup` default to the action's own `https` link. Return `null` when there is nowhere to go: the bar then renders
   * a button only if `onAction` handles it, and nothing otherwise.
   */
  hrefFor?: (action: NextAction) => string | null | undefined
  /** Click handler for actions with no link (`pay` opening a dialog...). Called with the action. */
  onAction?: (action: NextAction, event: MouseEvent<HTMLElement>) => void
  /** Secondary buttons next to the primary one (copy tracking number, request return...). */
  secondary?: ReactNode
  classNames?: NextActionBarClassNames
}

/**
 * ONE primary call to action: "Rastrear envío", "Descargar factura", "Pagar ahora"... Links that leave the store carry
 * `rel="noopener noreferrer"` and a hidden "(opens in a new tab)". Nothing renders for `none` or an action with no
 * way to act.
 */
export function NextActionBar({ order, action, hrefFor, onAction, secondary, classNames: cx = {}, ...text }: NextActionBarProps) {
  const { m } = useAccountText(text)
  const a = action ?? (order ? deriveNextAction(order) : null)
  if (!a || a.kind === 'none') return secondary ? <div className={cx.root} data-sf-action-bar>{secondary}</div> : null
  const fromApi = a.kind === 'track' || a.kind === 'pickup' ? safeTrackingUrl(a.href) : null
  const href = hrefFor?.(a) ?? fromApi
  const external = !!href && /^https:\/\//i.test(href)
  const label = enumText(m, 'action', a.kind)
  const common = { className: cx.primary, 'data-sf-action': typeof a.kind === 'string' ? a.kind : 'unknown' } as const
  let primary = null
  if (href) {
    primary = (
      <a href={href} {...common} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} onClick={onAction ? (e) => onAction(a, e) : undefined}>
        {label}
        {external ? <Hidden> {m['action.newTab']}</Hidden> : null}
      </a>
    )
  } else if (onAction) {
    primary = (
      <button type="button" {...common} onClick={(e) => onAction(a, e)}>
        {label}
      </button>
    )
  }
  if (!primary && !secondary) return null
  return (
    <div className={cx.root} role="group" aria-label={m['action.label']} data-sf-action-bar>
      {primary}
      {secondary}
    </div>
  )
}
