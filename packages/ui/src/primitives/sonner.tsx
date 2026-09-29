import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { Toaster as Sonner, toast, useSonner, type ToasterProps } from 'sonner'
import {
  ensureToastCloseStyles,
  removeToastCloseButtons,
  syncToastCloseButtons,
} from './toast-close'

type MetacoreToasterProps = Omit<ToasterProps, 'closeButton'> & {
  /**
   * Theme override. Defaults to 'system'. The consumer is expected to wire their
   * own theme provider and pass the resolved theme (`'light' | 'dark' | 'system'`).
   */
  theme?: ToasterProps['theme']
  /**
   * macOS-style "x" on the toast's top-left corner, shown on hover or keyboard
   * focus (always on touch screens). Covers every toast, custom and loading
   * included. Defaults to true; a toast opts out with `closeButton: false`
   * or `dismissible: false`.
   */
  closeButton?: boolean
  /** Accessible name of the close button. Defaults to `toast.dismiss` (i18n). */
  closeButtonLabel?: string
}

function useToastCloseButtons(
  rootRef: React.RefObject<HTMLElement | null>,
  opts: { enabled: boolean; label: string; defaultPosition: string; toasterId?: string },
) {
  const { toasts } = useSonner()
  const ids = React.useRef(new WeakMap<Element, string | number>())
  const sync = React.useRef<() => void>(() => {})
  sync.current = () => {
    const root = rootRef.current
    if (!root) return
    syncToastCloseButtons(root, toasts, {
      label: opts.label,
      defaultPosition: opts.defaultPosition,
      toasterId: opts.toasterId,
      ids: ids.current,
      onDismiss: (id) => toast.dismiss(id),
    })
  }

  React.useEffect(() => {
    const root = rootRef.current
    if (!opts.enabled || !root) return
    ensureToastCloseStyles()
    // Sonner adds/removes toast <li>s on its own schedule; re-pair on every change.
    const observer = new MutationObserver(() => sync.current())
    observer.observe(root, { childList: true, subtree: true })
    sync.current()
    return () => {
      observer.disconnect()
      removeToastCloseButtons(root)
    }
  }, [opts.enabled, rootRef])

  React.useEffect(() => {
    if (opts.enabled) sync.current()
  })
}

function defaultCloseLabel(language: string | undefined): string {
  const lang =
    language || (typeof document !== 'undefined' ? document.documentElement.lang : '')
  return lang.toLowerCase().startsWith('es') ? 'Cerrar notificación' : 'Dismiss notification'
}

export function Toaster({
  theme = 'system',
  closeButton = true,
  closeButtonLabel,
  ...props
}: MetacoreToasterProps) {
  const { t, i18n } = useTranslation()
  const rootRef = React.useRef<HTMLElement>(null)
  const label =
    closeButtonLabel ?? t('toast.dismiss', { defaultValue: defaultCloseLabel(i18n?.language) })

  useToastCloseButtons(rootRef, {
    enabled: closeButton,
    label,
    defaultPosition: props.position ?? 'bottom-right',
    toasterId: props.id,
  })

  return (
    <Sonner
      ref={rootRef}
      theme={theme}
      className='toaster group [&_div[data-content]]:w-full'
      toastOptions={{
        classNames: {
          toast: 'rounded-lg border bg-background shadow-lg',
          title: 'font-semibold',
          description: 'text-sm text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
      // Our button replaces sonner's, which skips custom and loading toasts.
      closeButton={false}
    />
  )
}
