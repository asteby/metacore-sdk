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
        name: 'Metacore Starter',
        short_name: 'Metacore',
        description: 'Metacore-powered starter app',
        theme_color: '#0ea5e9',
        background_color: '#0a0a0a',
        start_url: '/',
        display: 'standalone',
        icons: [],
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
