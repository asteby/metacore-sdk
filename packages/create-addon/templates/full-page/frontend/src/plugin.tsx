/**
 * {{ADDON_NAME}} — federated addon entrypoint (full-page / immersive).
 *
 * `manifest.json#frontend.layout = "immersive"` makes the host hand over the
 * whole viewport. This file owns layout, navigation back to the shell, and
 * any kiosk-style ergonomics.
 */
import React from 'react'
import { definePlugin, type AddonAPI } from '@asteby/metacore-sdk'

function ImmersiveShell({ api }: { api: AddonAPI }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{{ADDON_NAME}}</h1>
          <span className="text-xs text-muted-foreground">
            v{api.manifest.version}
          </span>
        </div>
        <button
          onClick={() => {
            // The host exposes a navigate helper; falling back to a hard
            // redirect keeps this template framework-agnostic.
            if (typeof window !== 'undefined') window.location.assign('/')
          }}
          className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
        >
          ← Back to shell
        </button>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <div className="max-w-md text-center">
          <h2 className="text-3xl font-bold">Immersive surface</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            This addon owns the whole viewport. Build a POS, KDS, or any
            kiosk-style UI right here.
          </p>
          <p className="mt-6 text-xs text-muted-foreground">
            Edit <code className="rounded bg-muted px-1.5 py-0.5">src/plugin.tsx</code>{' '}
            to get started.
          </p>
        </div>
      </main>
    </div>
  )
}

export default definePlugin({
  key: '{{ADDON_KEY}}',
  register(api) {
    api.registry.registerRoute({
      path: '/m/{{ADDON_KEY}}',
      component: () => <ImmersiveShell api={api} />,
    })

    api.log.info('{{ADDON_KEY}} addon registered (immersive)', {
      version: api.manifest.version,
    })
  },
  dispose() {
    // no-op: registry is torn down with the host shell
  },
})
