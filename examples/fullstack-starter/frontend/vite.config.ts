import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { metacorePWA } from '@asteby/metacore-pwa/vite-plugin'
import federation from '@originjs/vite-plugin-federation'
import { metacoreFederationShared } from '@asteby/metacore-starter-config/vite'
import path from 'node:path'

/**
 * Module Federation host config.
 *
 * `metacoreFederationShared` cablea los 7 singletons obligatorios del ecosistema
 * (react, react-dom, runtime-react, theme, auth, ui, sdk) — ver
 * `@asteby/metacore-starter-config/README` para la lista completa. Sumar addons
 * en `apps` apunta el host a sus `remoteEntry.js` (URL absoluta o relativa
 * servida por el backend metacore en `/api/metacore/addons/<key>/frontend/`).
 */
export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwind(),
    federation(
      metacoreFederationShared({
        host: 'metacore_starter',
        apps: {
          // metacore_tickets: '/api/metacore/addons/tickets/frontend/remoteEntry.js',
        },
      }),
    ),
    metacorePWA({
      manifest: {
        name: 'Metacore Starter Kit',
        short_name: 'Metacore',
        description: 'Official fullstack starter for the Metacore platform',
        theme_color: '#14b8a6',
        background_color: '#0a0a0a',
        start_url: '/',
        display: 'standalone',
        icons: [
          { src: '/images/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    modulePreload: false,
  },
  server: {
    port: 5173,
  },
})
