/**
 * InstalledAddonsList — table-ish list of installations with per-row
 * upgrade and uninstall controls. Reads from `useInstalledAddons()`.
 * Actions are wired to mutations that the parent owns (so confirm modals
 * can be customised per host).
 */
import type { Installation } from '../client/types'
import { useInstalledAddons } from '../hooks/useInstalledAddons'
import { useMarketplaceLabels } from '../providers/MarketplaceProvider'
import { cn } from './utils'

export interface InstalledAddonsListProps {
  /** Click handler for the upgrade button on a row. */
  onUpgrade?: (installation: Installation) => void
  /** Click handler for the uninstall button on a row. */
  onUninstall?: (installation: Installation) => void
  /**
   * Map of addon_key → latest_version available on the Hub. When a row's
   * installed version differs from the latest, we surface the upgrade CTA.
   * Pass an empty/undefined map to hide all upgrade hints.
   */
  latestVersions?: Record<string, string>
  className?: string
}

export function InstalledAddonsList({
  onUpgrade,
  onUninstall,
  latestVersions,
  className,
}: InstalledAddonsListProps) {
  const labels = useMarketplaceLabels()
  const { data, isLoading, error } = useInstalledAddons()

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{labels.catalogLoading}</p>
  }
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      >
        {error.message}
      </p>
    )
  }
  if (!data || data.length === 0) {
    return (
      <p
        data-testid="installed-addons-empty"
        className="text-sm text-muted-foreground"
      >
        No addons installed yet.
      </p>
    )
  }

  return (
    <ul
      data-testid="installed-addons-list"
      className={cn('flex w-full flex-col divide-y divide-border rounded-md border border-border', className)}
    >
      {data.map((inst) => {
        const latest = latestVersions?.[inst.addon_key]
        const canUpgrade = Boolean(latest && latest !== inst.version)
        const transitioning =
          inst.status === 'installing' ||
          inst.status === 'upgrading' ||
          inst.status === 'uninstalling'
        return (
          <li
            key={inst.addon_key}
            data-addon-key={inst.addon_key}
            className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium">{inst.name}</span>
              <span className="text-xs text-muted-foreground">
                v{inst.version}
                {' · '}
                <span data-testid={`status-${inst.addon_key}`}>{inst.status}</span>
                {canUpgrade ? ` · ${labels.upgradeAvailable(latest!)}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {canUpgrade && onUpgrade ? (
                <button
                  type="button"
                  onClick={() => onUpgrade(inst)}
                  disabled={transitioning}
                  className="rounded-md border border-primary/40 px-3 py-1.5 text-sm text-primary hover:bg-primary/10 disabled:opacity-60"
                  data-testid={`upgrade-${inst.addon_key}`}
                >
                  {labels.upgradeButton}
                </button>
              ) : null}
              {onUninstall ? (
                <button
                  type="button"
                  onClick={() => onUninstall(inst)}
                  disabled={transitioning}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
                  data-testid={`uninstall-${inst.addon_key}`}
                >
                  {labels.uninstallButton}
                </button>
              ) : null}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
