/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>
}

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})
clientsClaim()

registerRoute(
  ({ url }) => /^https?:\/\/localhost:7200\/api/i.test(url.href),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  })
)

registerRoute(
  ({ url }) => /^https:\/\/fonts\.googleapis\.com/.test(url.href),
  new StaleWhileRevalidate({ cacheName: 'google-fonts-stylesheets' })
)

registerRoute(
  ({ url }) => /^https:\/\/fonts\.gstatic\.com/.test(url.href),
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
)

interface PushPayload {
  title?: string
  body?: string
  icon?: string
  badge?: string
  url?: string
  tag?: string
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {}
  if (event.data) {
    try {
      payload = event.data.json() as PushPayload
    } catch {
      payload = { body: event.data.text() }
    }
  }
  const title = payload.title ?? 'Notification'
  const options: NotificationOptions = {
    body: payload.body ?? 'You have a new notification',
    icon: payload.icon ?? '/images/icons/android-launchericon-192-192.png',
    badge: payload.badge ?? '/images/icons/monochrome.png',
    data: { url: payload.url ?? '/' },
    tag: payload.tag ?? 'general-notification',
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const targetUrl = (event.notification.data as { url?: string } | null)?.url ?? '/'
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})

export {}
