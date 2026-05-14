/**
 * {{ADDON_NAME}} — federated addon entrypoint (crud-model template).
 *
 * Exposes:
 *   - A custom dashboard page at `/m/{{ADDON_KEY}}_items/board`.
 *   - A small "summary" widget contributed to the host dashboard.
 *
 * The default CRUD table for the `{{ADDON_KEY}}_items` model is rendered by
 * the host via `DynamicTable` based on `manifest.model_definitions` — no
 * frontend code required for the default list/detail flow.
 */
import React from 'react'
import { definePlugin, type AddonAPI } from '@asteby/metacore-sdk'

function ItemsBoard({ api }: { api: AddonAPI }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">{{ADDON_NAME}} — Board</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Custom board for the <code>{{ADDON_KEY}}_items</code> model. The host
        already renders a CRUD table at{' '}
        <code>/m/{{ADDON_KEY}}_items</code> from <code>manifest.model_definitions</code>;
        this page is your place for richer visualisations (kanban, calendar,
        etc.).
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Addon v{api.manifest.version} · kernel {api.kernelVersion}
      </p>
    </div>
  )
}

function SummaryWidget() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm text-muted-foreground">{{ADDON_NAME}}</div>
      <div className="mt-1 text-3xl font-bold">—</div>
      <div className="mt-1 text-xs text-muted-foreground">
        Wire this widget to <code>api.client</code> to pull live counts.
      </div>
    </div>
  )
}

export default definePlugin({
  key: '{{ADDON_KEY}}',
  register(api) {
    api.registry.registerRoute({
      path: '/m/{{ADDON_KEY}}_items/board',
      component: () => <ItemsBoard api={api} />,
    })

    api.registry.registerSlot({
      name: 'dashboard.widgets',
      component: SummaryWidget,
      priority: 30,
    })

    api.log.info('{{ADDON_KEY}} addon registered', {
      version: api.manifest.version,
    })
  },
  dispose() {
    // no-op: registry is torn down with the host shell
  },
})
