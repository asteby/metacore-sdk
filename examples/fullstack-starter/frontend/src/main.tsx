import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { MetacoreAppShell } from '@asteby/metacore-app-providers'

import { router, queryClient } from './router'
import { api } from './lib/api'
import './lib/i18n'
import './styles/index.css'

// One line bootstraps every metacore provider:
// QueryClient, Api, PWA (install + update prompts + offline indicator),
// Toaster, and metadata-cache invalidation when a new SW lands.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MetacoreAppShell api={api} queryClient={queryClient}>
      <RouterProvider router={router} />
    </MetacoreAppShell>
  </StrictMode>
)
