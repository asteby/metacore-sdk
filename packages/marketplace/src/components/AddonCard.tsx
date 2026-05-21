/**
 * AddonCard — single addon tile shown inside `MarketplaceCatalog`. Pure
 * presentational — no data fetching, no install side effects. Clicks
 * bubble up via `onSelect` so the parent can drive navigation/modal
 * state however it likes.
 */
import type { AddonSummary } from '../client/types'
import { cn } from './utils'

export interface AddonCardProps {
  addon: AddonSummary
  /** Called when the tile (or its CTA) is activated. */
  onSelect?: (addon: AddonSummary) => void
  /** Optional badge — e.g. "Installed" — rendered top-right. */
  badge?: string
  /** Force the card into a disabled visual state (e.g. plan-locked). */
  disabled?: boolean
  className?: string
}

export function AddonCard({
  addon,
  onSelect,
  badge,
  disabled = false,
  className,
}: AddonCardProps) {
  const interactive = !disabled && Boolean(onSelect)
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={interactive ? () => onSelect?.(addon) : undefined}
      data-testid={`addon-card-${addon.key}`}
      data-addon-key={addon.key}
      className={cn(
        'group relative flex w-full flex-col items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition',
        interactive && 'hover:border-primary/40 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      {badge ? (
        <span className="absolute right-3 top-3 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {badge}
        </span>
      ) : null}
      <div className="flex items-center gap-2">
        {addon.icon_slug ? (
          <div
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-sm font-semibold"
            style={addon.icon_color ? { color: addon.icon_color } : undefined}
          >
            {addon.icon_slug.slice(0, 2).toUpperCase()}
          </div>
        ) : (
          <div
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-sm font-semibold"
          >
            {addon.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{addon.name}</span>
          <span className="text-xs text-muted-foreground">
            v{addon.latest_version}
            {addon.category ? ` · ${addon.category}` : ''}
          </span>
        </div>
      </div>
      {addon.description ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {addon.description}
        </p>
      ) : null}
      {addon.tags && addon.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {addon.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  )
}
