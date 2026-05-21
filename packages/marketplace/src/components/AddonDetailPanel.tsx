/**
 * AddonDetailPanel — full addon page (header, screenshots, README,
 * permissions, install CTA). The CTA does NOT call `useInstallAddon`
 * directly; it just fires `onInstallClick` so the parent can open its
 * own `InstallConfirmModal` (and avoid double-opening dialogs).
 */
import type { AddonDetail, Manifest } from '../client/types'
import { normalizeManifest } from '../client/manifest'
import { useMarketplaceLabels } from '../providers/MarketplaceProvider'
import { PermissionsDiff } from './PermissionsDiff'
import { cn } from './utils'

export interface AddonDetailPanelProps {
  detail: AddonDetail
  /** Already installed? Used to flip the CTA between Install and Upgrade/Uninstall. */
  installedVersion?: string | null
  /** Click handler for the primary action. */
  onInstallClick?: (manifest: Manifest) => void
  /** Optional override — show a specific version's manifest. Defaults to latest. */
  selectedVersion?: string
  onVersionChange?: (version: string) => void
  className?: string
}

export function AddonDetailPanel({
  detail,
  installedVersion = null,
  onInstallClick,
  selectedVersion,
  onVersionChange,
  className,
}: AddonDetailPanelProps) {
  const labels = useMarketplaceLabels()
  const versions = detail.versions
  const activeVersion =
    versions.find((v) => v.version === selectedVersion) ?? versions[0]
  const manifest: Manifest | null = activeVersion
    ? normalizeManifest(activeVersion.manifest)
    : null

  const screenshots = [...detail.screenshots].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  )

  const isInstalled = Boolean(installedVersion)
  const canUpgrade =
    isInstalled && activeVersion && installedVersion !== activeVersion.version

  return (
    <article
      data-testid="addon-detail-panel"
      className={cn('flex w-full flex-col gap-6', className)}
    >
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{detail.name}</h2>
          {detail.description ? (
            <p className="text-sm text-muted-foreground">{detail.description}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {activeVersion ? `v${activeVersion.version}` : ''}
            {detail.author ? ` · ${detail.author}` : ''}
            {detail.category ? ` · ${detail.category}` : ''}
          </p>
        </div>
        {onInstallClick && manifest ? (
          <button
            type="button"
            onClick={() => onInstallClick(manifest)}
            data-testid="addon-detail-install-button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {canUpgrade
              ? labels.upgradeAvailable(activeVersion?.version ?? '')
              : isInstalled
                ? labels.uninstallButton
                : labels.installButton}
          </button>
        ) : null}
      </header>

      {versions.length > 1 ? (
        <section>
          <h3 className="mb-2 text-sm font-medium">{labels.versionsTitle}</h3>
          <select
            value={activeVersion?.version ?? ''}
            onChange={(e) => onVersionChange?.(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            data-testid="addon-detail-version-select"
          >
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
                {v.published_at ? ` — ${v.published_at.slice(0, 10)}` : ''}
              </option>
            ))}
          </select>
        </section>
      ) : null}

      {screenshots.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-medium">{labels.screenshotsTitle}</h3>
          <ul className="flex gap-3 overflow-x-auto pb-2">
            {screenshots.map((s, i) => (
              <li key={s.url} className="flex-shrink-0">
                <img
                  src={s.url}
                  alt={s.alt ?? `Screenshot ${i + 1}`}
                  className="h-40 rounded-md border border-border object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {manifest ? (
        <section>
          <h3 className="mb-2 text-sm font-medium">{labels.permissionsTitle}</h3>
          {manifest.permissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{labels.permissionsNone}</p>
          ) : (
            <PermissionsDiff current={null} next={manifest} hideUnchanged={false} />
          )}
        </section>
      ) : null}

      {detail.readme ? (
        <section>
          <h3 className="mb-2 text-sm font-medium">{labels.readmeTitle}</h3>
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 text-xs">
            {detail.readme}
          </pre>
        </section>
      ) : null}
    </article>
  )
}
