import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { Toaster } from '@asteby/metacore-ui/primitives'
import { ApiProvider } from '@asteby/metacore-runtime-react'

import { router, queryClient } from './router'
import { api } from './lib/api'
import './lib/i18n'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={api}>
        <RouterProvider router={router} />
        <Toaster position='top-right' richColors theme='light' />
      </ApiProvider>
    </QueryClientProvider>
  </StrictMode>
)
