/**
 * {{ADDON_NAME}} — federated addon entrypoint.
 *
 * Exposed via `./plugin` in `vite.config.ts`; loaded by the metacore host at
 * runtime through Module Federation. The host calls `register(api)` once on
 * mount and `dispose()` on uninstall / reload.
 */
import React from 'react'
import { definePlugin, type AddonAPI } from '@asteby/metacore-sdk'

function AddonHome({ api }: { api: AddonAPI }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">{{ADDON_NAME}}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Addon v{api.manifest.version} · kernel {api.kernelVersion}
      </p>
      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <p className="text-sm">
          Edit <code className="rounded bg-muted px-1.5 py-0.5">src/plugin.tsx</code>{' '}
          and hit save.
        </p>
      </div>
    </div>
  )
}

export default definePlugin({
  key: '{{ADDON_KEY}}',
  register(api) {
    api.registry.registerRoute({
      path: '/m/{{ADDON_KEY}}',
      component: () => <AddonHome api={api} />,
    })

    api.log.info('{{ADDON_KEY}} addon registered', {
      version: api.manifest.version,
    })
  },
  dispose() {
    // no-op: registry is torn down with the host shell
  },
})
