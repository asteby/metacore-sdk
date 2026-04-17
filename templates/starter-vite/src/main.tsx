import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { PWAProvider } from '@asteby/metacore-pwa/provider'
import { Toaster } from '@asteby/metacore-ui/primitives'

import { router, queryClient } from './router'
import { api } from './lib/api'
import './styles/index.css'

const rootElement = document.getElementById('root')!
ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PWAProvider api={api}>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors />
      </PWAProvider>
    </QueryClientProvider>
  </StrictMode>
)
