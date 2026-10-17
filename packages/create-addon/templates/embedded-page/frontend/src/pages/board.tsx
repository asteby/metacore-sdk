/**
 * {{ADDON_NAME}} — embedded page (`./pages/board`, layout "shell").
 *
 * Mounted by the host at /a/{{ADDON_KEY}}/board with its sidebar and header.
 * Everything host-related comes from hooks; the page never reads a token,
 * the browser location or the host stores:
 *
 *   useHostApi()        authenticated client (bodies only, no credentials)
 *   useHostContext()    org, user, branch, locale
 *   usePageChrome()     title + header actions (rendered by the host)
 *   useBreadcrumbs()    trail before the title
 *   useAddonNavigate()  navigation relative to the page base
 *
 * Budget: manifest `budget_kb` (60 KB gzip, shares excluded). Prefer a
 * declarative view (manifest `view_type`) over growing this page.
 */
import { useEffect, useState } from 'react'
import { definePage } from '@asteby/metacore-sdk/page'
import {
  useAddonNavigate,
  useBreadcrumbs,
  useHostApi,
  useHostContext,
  usePageChrome,
} from '@asteby/metacore-runtime-react'

interface SummaryCard {
  key: string
  label: string
  value: number
}

interface Summary {
  cards: SummaryCard[]
}

export default definePage(function Board() {
  const api = useHostApi()
  const { org } = useHostContext()
  const navigate = useAddonNavigate()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  usePageChrome({
    title: '{{ADDON_NAME}}',
    subtitle: org?.name,
    actions: [{ key: 'refresh', label: 'Actualizar', icon: 'RefreshCw', onSelect: () => setTick((n) => n + 1) }],
  })
  useBreadcrumbs([{ title: 'Items', url: '/m/Item' }])

  useEffect(() => {
    const ctrl = new AbortController()
    setError(null)
    // The route of manifest.json#contributions.api, served by backend/main.go
    // through the host's API gateway.
    api
      .get<Summary>('/gw/{{ADDON_KEY}}/summary', { signal: ctrl.signal })
      .then(setSummary)
      .catch((e: Error) => {
        if (!ctrl.signal.aborted) setError(e.message)
      })
    return () => ctrl.abort()
  }, [api, tick])

  if (error) {
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        {error}
      </p>
    )
  }
  if (!summary) {
    return <div aria-busy="true" className="m-4 h-24 animate-pulse rounded-lg bg-muted" />
  }
  return (
    <section className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
      {summary.cards.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => navigate(`?status=${c.key}`)}
          className="rounded-lg border bg-card p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="block text-xs text-muted-foreground">{c.label}</span>
          <span className="mt-1 block text-2xl font-semibold tabular-nums">{c.value}</span>
        </button>
      ))}
    </section>
  )
})
