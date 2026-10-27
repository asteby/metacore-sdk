import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Spinner } from './navigation-progress'
import { pendingMessages, type PendingKind, type PendingMessages } from './pending-messages'
import type { ActionResult } from './use-action-lock'

type Common = {
  /** The action (or its form) is running: the control is locked. */
  pending?: boolean
  /**
   * Show the spinner and the working label. Default: `pending`, or with `shared` only when THIS control was the one
   * clicked (a form with several submit buttons shares one `pending`).
   */
  busy?: boolean
  shared?: boolean
  /** What is being done: picks the working text («Descargando…», «Generando factura…»…). */
  kind?: PendingKind
  /** Working text; wins over `kind`. */
  pendingLabel?: ReactNode
  /** How the last run ended: announced («Listo.» / failed) in the live region. */
  result?: ActionResult
  doneLabel?: string
  errorLabel?: string
  locale?: string | null
  messages?: Partial<PendingMessages>
  /** Lock held after the work ends against a second click. Default 600 ms. */
  cooldownMs?: number
  /** Give the focus back to the control when it unlocks (it lost it when it was disabled). Default true. */
  restoreFocus?: boolean
  classNames?: Partial<Record<'root' | 'spinner' | 'label' | 'status', string>>
  children?: ReactNode
}

export type PendingButtonProps = Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof Common> & { href?: undefined }
export type PendingLinkButtonProps = Common & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof Common> & { href: string }

const HIDDEN = { position: 'absolute', width: 1, height: 1, margin: -1, padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 } as const

/**
 * A button (or a link, with `href`) for work that costs: pay, download, process, send. Headless: no colors, no brand,
 * you dress it with `className` / `classNames` or the `data-sf-pending` attribute.
 *
 * While `pending`: `disabled` + `aria-disabled` + `aria-busy`, a `Spinner`, the working text, the EXACT width it had (fixed
 * while it works, the text is cut with an ellipsis if it does not fit, so the layout never jumps), a polite `role="status"` announcement, and a click is ignored. When it ends it announces
 * the result, hands the focus back, and keeps ignoring clicks for `cooldownMs` (600 ms) against a double click. It never
 * sets `disabled` inside the click itself (that would cancel the submit of a form); the lock follows `pending`.
 * It renders a normal `<button type="submit">` (or `<a href>`), so a form still works without JavaScript.
 * Needs `@asteby/storefront-react/progress.css` (spinner animation).
 */
export const PendingButton = forwardRef<HTMLElement, PendingButtonProps | PendingLinkButtonProps>(function PendingButton(props, outerRef) {
  const {
    pending = false, busy: busyProp, shared = false, kind = 'send', pendingLabel, result = 'idle', doneLabel, errorLabel, locale, messages,
    cooldownMs = 600, restoreFocus = true, classNames: cx = {}, children, className, onClick, ...rest
  } = props as Common & { className?: string; onClick?: (e: MouseEvent<HTMLElement>) => void; href?: string; disabled?: boolean; type?: 'button' | 'submit' | 'reset' } & Record<string, unknown>
  const ref = useRef<HTMLElement | null>(null)
  const setRef = useCallback(
    (el: HTMLElement | null) => {
      ref.current = el
      if (typeof outerRef === 'function') outerRef(el)
      else if (outerRef) (outerRef as { current: HTMLElement | null }).current = el
    },
    [outerRef],
  )
  const m = pendingMessages(locale ?? (typeof document !== 'undefined' ? document.documentElement.lang : undefined), messages)
  const mine = useRef(false)
  const armed = useRef(false)
  const hadFocus = useRef(false)
  const [cool, setCool] = useState(false)
  // Width of the control while it is idle, kept at every commit: the first locked render reads it BEFORE the busy content
  // (spinner + working text) is laid out, so the width never jumps.
  const idleWidth = useRef<number | null>(null)
  const prev = useRef(false)

  useEffect(() => {
    if (pending && !prev.current) {
      const el = ref.current
      if (el) hadFocus.current = typeof document !== 'undefined' && document.activeElement === el
    }
    if (!pending && prev.current) {
      if (cooldownMs > 0) {
        setCool(true)
        const id = setTimeout(() => setCool(false), cooldownMs)
        prev.current = pending
        return () => clearTimeout(id)
      }
    }
    prev.current = pending
    return undefined
  }, [pending, cooldownMs])

  const locked = pending || cool
  useLayoutEffect(() => {
    if (!locked && ref.current) idleWidth.current = Math.round(ref.current.getBoundingClientRect().width) || null
  })
  useEffect(() => {
    if (locked) return
    mine.current = false
    const el = ref.current
    if (restoreFocus && hadFocus.current && el && typeof document !== 'undefined' && (document.activeElement === document.body || document.activeElement === null)) {
      el.focus({ preventScroll: true })
    }
    hadFocus.current = false
  }, [locked, restoreFocus])

  const busy = busyProp ?? (pending && (!shared || mine.current))
  const disabledProp = (rest as { disabled?: boolean }).disabled === true
  const label = pendingLabel ?? m[`pending.${kind}` as keyof PendingMessages]
  const status = busy ? (typeof label === 'string' ? label : m[`pending.${kind}` as keyof PendingMessages]) : result === 'done' ? (doneLabel ?? m['pending.done']) : result === 'error' ? (errorLabel ?? m['pending.failed']) : ''

  const handleClick = (e: MouseEvent<HTMLElement>) => {
    if (locked || disabledProp || armed.current) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    onClick?.(e)
    if (!e.defaultPrevented) {
      mine.current = true
      // A plain button: two clicks inside the same tick (before `pending` reaches us) run once. A submit button is not
      // armed: the form may be refused by validation and the next click must go through; the router's `pending`
      // (and `useSubmitOnce`) lock the real submit.
      if ((rest as { type?: string }).type === 'submit') return
      armed.current = true
      setTimeout(() => {
        armed.current = false
      }, 120)
    }
  }

  const style = { ...((rest as { style?: object }).style ?? {}), ...(idleWidth.current && locked ? { width: idleWidth.current, boxSizing: 'border-box' as const } : {}) }
  const inner = (
    <>
      {busy ? (
        <span data-sf-pending-content="" className={cx.label} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4em', maxWidth: '100%', minWidth: 0 }}>
          <Spinner className={cx.spinner ?? ''} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{label}</span>
        </span>
      ) : (
        children
      )}
    </>
  )
  const common = {
    ref: setRef as never,
    className: [className, cx.root].filter(Boolean).join(' ') || undefined,
    'aria-busy': busy || undefined,
    'aria-disabled': locked || disabledProp || ((rest as { 'aria-disabled'?: unknown })['aria-disabled'] ? true : undefined) || undefined,
    'data-sf-pending': busy ? '' : undefined,
    'data-sf-locked': locked ? '' : undefined,
    onClick: handleClick,
    style,
  }
  const live = status ? (
    <span role="status" aria-live="polite" className={cx.status} data-sf-pending-status="" style={HIDDEN}>
      {status}
    </span>
  ) : null
  if (typeof (props as { href?: string }).href === 'string') {
    const { disabled: _d, type: _t, ...anchor } = rest as Record<string, unknown>
    void _d
    void _t
    return (
      <>
        <a {...(anchor as AnchorHTMLAttributes<HTMLAnchorElement>)} {...common}>
          {inner}
        </a>
        {live}
      </>
    )
  }
  const { type = 'button', ...button } = rest as { type?: 'button' | 'submit' | 'reset' } & Record<string, unknown>
  return (
    <>
      <button type={type} {...(button as ButtonHTMLAttributes<HTMLButtonElement>)} {...common} disabled={locked || disabledProp}>
        {inner}
      </button>
      {live}
    </>
  )
})
