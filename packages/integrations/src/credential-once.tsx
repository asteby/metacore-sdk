import * as React from 'react'
import type { TFunction } from './i18n'
import type { OneTimeCredential } from './types'
import { cx } from './ui'

export interface CredentialOnceProps {
  credential: OneTimeCredential
  /** Called when the user confirms they saved it; the parent must drop it. */
  onDone: () => void
  t: TFunction
}

/**
 * Shows a freshly generated credential a single time. The value lives only in
 * the props of this component: it is never written to storage, logs or the
 * DOM after `onDone`. The user must confirm before it disappears.
 */
export function CredentialOnce({ credential, onDone, t }: CredentialOnceProps) {
  const [copied, setCopied] = React.useState(false)
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  React.useEffect(() => {
    headingRef.current?.focus()
  }, [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(credential.value)
      setCopied(true)
    } catch {
      // Clipboard may be blocked: the value stays selectable on screen.
    }
  }
  return (
    <div role="alertdialog" aria-labelledby="cred-title" aria-describedby="cred-warn" className={`${cx.card} space-y-3 border-amber-500`}>
      <h3 id="cred-title" ref={headingRef} tabIndex={-1} className="text-base font-semibold">
        {t('credential.title')}
      </h3>
      <p id="cred-warn" className={cx.muted}>
        {t('credential.warning')}
      </p>
      <div>
        <span className={cx.label}>{credential.label ?? t('credential.label')}</span>
        <code data-testid="credential-value" className="block break-all rounded bg-muted p-2 text-sm select-all">
          {credential.value}
        </code>
      </div>
      <div className="flex gap-2">
        <button type="button" className={cx.button} onClick={copy}>
          {copied ? t('common.copied') : t('common.copy')}
        </button>
        <button type="button" className={cx.primary} onClick={onDone}>
          {t('credential.done')}
        </button>
      </div>
      <span aria-live="polite" className="sr-only">
        {copied ? t('common.copied') : ''}
      </span>
    </div>
  )
}
