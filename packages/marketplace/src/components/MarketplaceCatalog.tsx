/**
 * MarketplaceCatalog — top-level browse surface. Grid of addons with a
 * search input and a category filter. Stateless except for the local
 * search/filter form; query state belongs to the parent so the URL can
 * drive it (e.g. via TanStack Router search params).
 */
import { useState } from 'react'
import type { AddonSummary, CatalogQuery } from '../client/types'
import { useCatalog } from '../hooks/useCatalog'
import { useMarketplaceLabels } from '../providers/MarketplaceProvider'
import { AddonCard } from './AddonCard'
import { cn } from './utils'

export interface MarketplaceCatalogProps {
  /** Initial filter — uncontrolled mode. */
  initialQuery?: CatalogQuery
  /** Controlled query — when supplied, the search input is read-only-ish. */
  query?: CatalogQuery
  /** Called whenever the local query changes (uncontrolled mode). */
  onQueryChange?: (q: CatalogQuery) => void
  /** Click handler for an addon tile. */
  onSelectAddon?: (addon: AddonSummary) => void
  /**
   * Optional list of installed addon keys — when supplied, matching cards
   * render an "Installed" badge. Pass the keys (not full Installation
   * rows) so the catalog stays decoupled from the kernel response shape.
   */
  installedKeys?: ReadonlySet<string>
  className?: string
}

export function MarketplaceCatalog({
  initialQuery,
  query: controlledQuery,
  onQueryChange,
  onSelectAddon,
  installedKeys,
  className,
}: MarketplaceCatalogProps) {
  const labels = useMarketplaceLabels()
  const [localQuery, setLocalQuery] = useState<CatalogQuery>(
    controlledQuery ?? initialQuery ?? {},
  )
  const query = controlledQuery ?? localQuery

  const { data, isLoading, error } = useCatalog({ query })

  const updateQuery = (patch: Partial<CatalogQuery>) => {
    const next = { ...query, ...patch }
    if (!controlledQuery) setLocalQuery(next)
    onQueryChange?.(next)
  }

  return (
    <section
      data-testid="marketplace-catalog"
      className={cn('flex w-full flex-col gap-4', className)}
    >
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-semibold">{labels.catalogTitle}</h2>
        <input
          type="search"
          value={query.search ?? ''}
          onChange={(e) => updateQuery({ search: e.target.value || undefined, page: 1 })}
          placeholder={labels.catalogSearchPlaceholder}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none md:w-72"
          data-testid="marketplace-catalog-search"
        />
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error.message}
        </p>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{labels.catalogLoading}</p>
      ) : null}

      {data && data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.catalogEmpty}</p>
      ) : null}

      {data && data.items.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.items.map((addon) => (
            <li key={addon.key}>
              <AddonCard
                addon={addon}
                onSelect={onSelectAddon}
                badge={installedKeys?.has(addon.key) ? 'Installed' : undefined}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
