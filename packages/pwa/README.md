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

## Estado de conexión

`<OfflineIndicator />` es una pastilla discreta (abajo al centro, `aria-live`) que avisa «Sin internet», «Sin conexión con el servidor · reintentando…» y «Conexión restablecida». Un error de red suelto no avisa: inicia una comprobación en silencio con reintentos espaciados y solo se muestra si la caída dura más de 6 s. Los fallos con la pestaña oculta o recién recuperada (peticiones cortadas por el sistema en móvil) no cuentan, y 502–504 del proxy cuentan como backend reiniciando.

```tsx
import { attachConnectionReporter, onConnectionRestored, OfflineIndicator, PWAProvider } from '@asteby/metacore-pwa'

attachConnectionReporter(api) // axios: errores de red alimentan el estado; cualquier respuesta lo recupera
onConnectionRestored(() => queryClient.invalidateQueries({ refetchType: 'active' }))

<PWAProvider api={api} connectionToasts={false}>
  <OfflineIndicator />
</PWAProvider>
```

- `configureConnectionProbe({ url, graceMs })`: URL pública y barata para comprobar el servidor (por defecto `/api/push/public-key`) y gracia en ms.
- `connectionToasts={false}` en `PWAProvider` evita duplicar el aviso con los toasts de red del dispositivo.
- Sin `attachConnectionReporter`, el indicador solo detecta la red del dispositivo.
- `useConnectionState()` y `getConnectionState()` exponen el estado (`online`, `checking`, `offline`, `no-internet`, `restored`).

## Push endpoints

By default, `PushNotificationService` calls these endpoints on your injected `api`:

| Method | Path                | Purpose                            |
| ------ | ------------------- | ---------------------------------- |
| GET    | `/push/public-key`  | Returns `{ publicKey: string }`    |
| POST   | `/push/subscribe`   | Register a subscription            |
| POST   | `/push/unsubscribe` | Remove a subscription              |
| POST   | `/push/test`        | Trigger a test notification        |

Override any path via `<PWAProvider pushOptions={{ publicKeyPath: '/v1/webpush/key' }} />`.

## Política de actualización

Por defecto (`updateStrategy="auto"`) nada cambia: el provider recarga en cada `controllerchange`. Con `updateStrategy="prompt"` la actualización la gobierna una política compartida, sin cambios de comportamiento para quien no la activa.

```tsx
<PWAProvider
  api={api}
  updateStrategy="prompt"
  updateCheckIntervalMs={5 * 60_000}      // update() cada 5 min (solo pestaña visible) + al volver + focus
  autoApplyAfterMs={24 * 60 * 60_000}     // opcional: aplicar solo tras 24 h esperando, en momento seguro
  staleAutoApplyAfterMs={10 * 60_000}     // opcional: umbral cuando versionCheck detecta desfase
  versionCheck={{
    current: __APP_COMMIT__,              // versión embebida en el build (Vite `define`)
    fetchLatest: async () => (await fetch('/health').then((r) => r.json())).commit,
  }}
>
  <PWAUpdatePrompt />   {/* solo UI: toast compartido, se retrae con un modal abierto */}
</PWAProvider>
```

Requisito: el `sw.js` no debe hacer `skipWaiting` al instalar, solo al mensaje `SKIP_WAITING` (como la plantilla incluida).

| Opción | Default | Efecto |
|---|---|---|
| `dismissTtlMs` | 1 h | "Después" oculta el aviso ese tiempo |
| (interno) `acceptedTtlMs` | 2 min | tras "Actualizar", un SW aún en espera se aplica sin re-preguntar |
| `autoApplyAfterMs` | `undefined` | **nunca** auto-aplica; si se define, aplica al cumplirse y en momento seguro (también si se descartó el aviso) |
| `staleAutoApplyAfterMs` | `undefined` | umbral usado mientras `versionCheck` indique que el cliente está desfasado (gana el menor de los dos) |
| `isSafeToApply` | ver abajo | reemplaza el test de momento seguro |
| `versionCheck` | — | `{ current, fetchLatest, intervalMs = 5 min }`. Si `fetchLatest()` difiere de `current` se marca *stale* y se fuerza `registration.update()` al instante. La librería no asume el endpoint |

**Momento seguro** (por defecto; un `apply` nunca ocurre sin él): sin diálogo Radix abierto; sin campo enfocado con contenido ni campo en el que el usuario escribió (evento `input` de confianza, últimos 30 min) que aún tenga contenido (los campos precargados/autocompletados no cuentan); y pestaña oculta, o usuario inactivo ≥ 60 s. Se reevalúa cada 15 s mientras hay una actualización esperando.

Un `<input type="file">` con archivos seleccionados cuenta como edición en curso (no seguro). Limitaciones del test por defecto: **no detecta subidas, peticiones `fetch`/XHR ni escrituras en curso** que no pasen por un campo con contenido, y el clic explícito en "Actualizar" **omite** el momento seguro (es decisión del usuario). Si tu host tiene subidas o formularios críticos, pasa tu propio `isSafeToApply` (por ejemplo, devolviendo `false` mientras haya una subida o mutación activa).

**Garantía anti-bucle**: máximo UN intento de recarga por `acceptedTtlMs` (2 min) y por worker en espera. Se persiste `metacore_pwa_update_last_apply_attempt_at`; si tras recargar el worker sigue en espera (p. ej. un `sw.js` que ignora `SKIP_WAITING`) no se vuelve a aplicar de forma automática (ni por aceptación previa ni por `autoApplyAfterMs`): se limpia la aceptación y se vuelve al aviso. Solo un clic explícito en "Actualizar" puede reintentar. Cuando cambia el worker en espera (otro `scriptURL` o instancia) se reinician su antigüedad, el descarte y el intento.

**Recarga**: una sola, solo tras `SKIP_WAITING` -> `controllerchange`, con fallback a 5 s. En modo `prompt` un `controllerchange` ajeno (otra pestaña) no recarga esta.

Los estados de persistencia (`metacore_pwa_update_*` en `localStorage`) permiten que `autoApplyAfterMs` cuente desde la primera vez que se vio la actualización aunque el usuario recargue sin activarla. Si el storage no está disponible la política degrada a solo-sesión.

Capas reutilizables: `decideUpdate` / `isSafeSnapshot` (puras), `createUpdateController` (sin React) y `useServiceWorkerUpdate` (hook) para hosts que no usan `PWAProvider`.

## Exports

```ts
import '@asteby/metacore-pwa'                 // everything
import '@asteby/metacore-pwa/provider'        // PWAProvider, usePWAContext
import '@asteby/metacore-pwa/hooks'           // usePWA, useNotifications
import '@asteby/metacore-pwa/components'      // prompts + indicators
import '@asteby/metacore-pwa/vite-plugin'     // metacorePWA()
```

`@asteby/metacore-pwa/sw.js` resolves to the packaged template for use with bundlers that support it; otherwise copy from `node_modules/@asteby/metacore-pwa/templates/sw.js`.
