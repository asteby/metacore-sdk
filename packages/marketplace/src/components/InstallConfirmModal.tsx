/**
 * InstallConfirmModal — pre-install/pre-upgrade consent surface. Shows
 * the normalized permission list (or a diff against the current version
 * when upgrading) and surfaces the v3 consent toggles. Calls
 * `onConfirm(acceptedCapabilities, acceptedConsents)` when the user
 * accepts.
 *
 * The modal is intentionally a controlled component — `open` and
 * `onClose` are owned by the parent so we don't have to mount a portal
 * here. Consumers wrap it in their preferred dialog primitive (Radix
 * Dialog, headless-ui, etc.) or render it inline.
 */
import { useMemo, useState } from 'react'
import type { Capability, Manifest } from '../client/types'
import { diffRequiresConsent, diffPermissions } from '../client/manifest'
import { useMarketplaceLabels } from '../providers/MarketplaceProvider'
import { PermissionsDiff } from './PermissionsDiff'
import { cn } from './utils'

export interface InstallConfirmModalProps {
  open: boolean
  onClose: () => void
  /** Title — defaults to the addon name. */
  title?: string
  /** Manifest being installed/upgraded INTO. */
  next: Manifest
  /** Existing (consented) manifest when upgrading; null for fresh install. */
  current?: Manifest | null
  /** Called when the user confirms. */
  onConfirm: (input: {
    acceptedCapabilities: Capability[]
    acceptedConsents: Record<string, boolean>
  }) => void
  /** Render in a disabled/loading state (e.g. during mutation). */
  busy?: boolean
  /** Error string from the parent mutation, if any. */
  error?: string | null
  className?: string
}

export function InstallConfirmModal({
  open,
  onClose,
  title,
  next,
  current = null,
  onConfirm,
  busy = false,
  error,
  className,
}: InstallConfirmModalProps) {
  const labels = useMarketplaceLabels()

  // Track consent toggle state — v3 manifests can request optional
  // consents (e.g. anonymized telemetry). Defaults come from the
  // manifest itself; the parent gets the final set on confirm.
  const [consentState, setConsentState] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const c of next.consents) initial[c.key] = c.default ?? false
    return initial
  })

  const diff = useMemo(() => diffPermissions(current, next), [current, next])
  const requiresConsent = useMemo(() => diffRequiresConsent(diff), [diff])

  if (!open) return null

  const handleConfirm = () => {
    onConfirm({
      acceptedCapabilities: next.permissions,
      acceptedConsents: consentState,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-busy={busy}
      data-testid="install-confirm-modal"
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-lg">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{title ?? next.name}</h3>
            <p className="text-xs text-muted-foreground">
              v{next.version}
              {next.apiVersion ? ` · API v${next.apiVersion}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label={labels.cancel}
          >
            ×
          </button>
        </header>

        <section>
          <h4 className="mb-2 text-sm font-medium">{labels.permissionsTitle}</h4>
          {next.permissions.length === 0 && diff.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labels.permissionsNone}</p>
          ) : current ? (
            <>
              {requiresConsent ? (
                <p className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  {labels.permissionsConsentRequired}
                </p>
              ) : null}
              <PermissionsDiff current={current} next={next} hideUnchanged />
            </>
          ) : (
            <PermissionsDiff current={null} next={next} hideUnchanged />
          )}
        </section>

        {next.consents.length > 0 ? (
          <section>
            <h4 className="mb-2 text-sm font-medium">Optional consents</h4>
            <ul className="flex flex-col gap-2">
              {next.consents.map((c) => (
                <li key={c.key} className="flex items-start gap-2 text-sm">
                  <input
                    id={`consent-${c.key}`}
                    type="checkbox"
                    checked={consentState[c.key] ?? false}
                    onChange={(e) =>
                      setConsentState((s) => ({ ...s, [c.key]: e.target.checked }))
                    }
                    disabled={busy}
                    className="mt-1"
                  />
                  <label htmlFor={`consent-${c.key}`} className="leading-snug">
                    {c.label}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <footer className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy}
            data-testid="install-confirm-button"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? labels.installInProgress : labels.confirm}
          </button>
        </footer>
      </div>
    </div>
  )
}
