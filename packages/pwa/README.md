# @asteby/metacore-pwa

Metacore PWA helpers for React apps built on Vite: service-worker registration, install/update prompts, push notifications, offline indicator, and a `vite-plugin-pwa` wrapper with sensible defaults.

## Install

```bash
pnpm add @asteby/metacore-pwa sonner vite-plugin-pwa
```

Peer deps: `react >=18`, `react-dom >=18`, `sonner >=1.7`, `vite >=5`, `vite-plugin-pwa >=1`.

## 1. Vite config

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { metacorePWA } from '@asteby/metacore-pwa/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    metacorePWA({
      // Everything is optional — these are the Metacore defaults:
      // registerType: 'prompt'
      // strategies: 'injectManifest', srcDir: 'src', filename: 'sw.js'
      // workbox.runtimeCaching: NetworkFirst /api/, CacheFirst Google Fonts
      manifest: {
        name: 'My App',
        short_name: 'App',
        theme_color: '#84cc16',
        icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
      },
    }),
  ],
})
```

## 2. Copy the service worker template

`metacorePWA()` uses `strategies: 'injectManifest'`, which requires a source SW file. Copy the template:

```bash
cp node_modules/@asteby/metacore-pwa/templates/sw.js src/sw.js
```

Edit `src/sw.js` to adjust the `LANDING_ROUTES` regex and runtime caching to match your deployment.

## 3. Mount the provider

```tsx
// src/main.tsx
import { PWAProvider } from '@asteby/metacore-pwa/provider'
import {
  PWAInstallPrompt,
  PWAUpdatePrompt,
  OfflineIndicator,
} from '@asteby/metacore-pwa/components'
import { api } from './lib/api' // your axios instance

function App() {
  return (
    <PWAProvider api={api}>
      <OfflineIndicator />
      <PWAInstallPrompt />
      <PWAUpdatePrompt />
      {/* ...rest of the app */}
    </PWAProvider>
  )
}
```

The `api` prop is any object with `get(url)` and `post(url, body?)` methods returning `{ data }` (compatible with axios). It's used by the push subscription service.

## 4. Use the hooks

```tsx
import { usePWA, useNotifications } from '@asteby/metacore-pwa/hooks'

function Settings() {
  const {
    isOnline,
    isInstallable,
    isPushSubscribed,
    subscribeToPush,
    unsubscribeFromPush,
    testPushNotification,
  } = usePWA()

  const { permission, requestPermission, showNotification } = useNotifications()

  return (
    <div>
      <p>{isOnline ? 'Online' : 'Offline'}</p>
      {!isPushSubscribed && (
        <button onClick={() => subscribeToPush()}>Enable push</button>
      )}
    </div>
  )
}
```

## Push endpoints

By default, `PushNotificationService` calls these endpoints on your injected `api`:

| Method | Path                | Purpose                            |
| ------ | ------------------- | ---------------------------------- |
| GET    | `/push/public-key`  | Returns `{ publicKey: string }`    |
| POST   | `/push/subscribe`   | Register a subscription            |
| POST   | `/push/unsubscribe` | Remove a subscription              |
| POST   | `/push/test`        | Trigger a test notification        |

Override any path via `<PWAProvider pushOptions={{ publicKeyPath: '/v1/webpush/key' }} />`.

## Exports

```ts
import '@asteby/metacore-pwa'                 // everything
import '@asteby/metacore-pwa/provider'        // PWAProvider, usePWAContext
import '@asteby/metacore-pwa/hooks'           // usePWA, useNotifications
import '@asteby/metacore-pwa/components'      // prompts + indicators
import '@asteby/metacore-pwa/vite-plugin'     // metacorePWA()
```

`@asteby/metacore-pwa/sw.js` resolves to the packaged template for use with bundlers that support it; otherwise copy from `node_modules/@asteby/metacore-pwa/templates/sw.js`.
