import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
// Theme context is exported from the starter-core and drives light/dark mode
// using the oklch tokens in `@asteby/metacore-theme`.
import { ThemeProvider } from '@asteby/metacore-starter-core'
import { App } from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element in index.html')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="{{APP_NAME}}-theme">
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
)
