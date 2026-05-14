/**
 * Standalone dev harness — runs the plugin against a stub registry so a
 * developer can `pnpm dev` without booting the full host. The production
 * load path is Module Federation; this file is NOT shipped to the host.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  MarketplaceClient,
  Registry,
  type AddonAPI,
  type Manifest,
} from '@asteby/metacore-sdk'

import plugin from './plugin'
import './index.css'

const manifest: Manifest = {
  key: '{{ADDON_KEY}}',
  name: '{{ADDON_NAME}}',
  version: '0.1.0',
  kernel: '>=2.0.0 <3.0.0',
} as unknown as Manifest

const registry = new Registry()

const client = new MarketplaceClient({
  baseUrl: 'http://localhost:0/_dev_stub',
  fetch: async () => {
    throw new Error('dev harness: network disabled')
  },
})

const api: AddonAPI = {
  manifest,
  settings: {},
  registry,
  client,
  kernelVersion: '2.0.0-dev',
  telemetry: (event, data) => console.debug('[telemetry]', event, data),
  log: {
    debug: (...a) => console.debug('[{{ADDON_KEY}}]', ...a),
    info: (...a) => console.info('[{{ADDON_KEY}}]', ...a),
    warn: (...a) => console.warn('[{{ADDON_KEY}}]', ...a),
    error: (...a) => console.error('[{{ADDON_KEY}}]', ...a),
  },
}

void Promise.resolve(plugin.register(api)).then(() => {
  const routes = registry.getRoutes()
  const root = document.getElementById('root')
  if (!root) {
    console.error('dev harness: #root element missing')
    return
  }
  const first = routes[0]
  const Node = first ? <first.component /> : <div>no routes registered</div>
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border px-6 py-3 text-sm">
          <strong>{{ADDON_KEY}}</strong> dev harness · {routes.length} route(s) registered
        </header>
        <main>{Node}</main>
      </div>
    </React.StrictMode>
  )
})
