import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { metacorePWA } from '@asteby/metacore-pwa/vite-plugin'
import path from 'node:path'

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwind(),
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
  server: {
    port: 5173,
  },
})
