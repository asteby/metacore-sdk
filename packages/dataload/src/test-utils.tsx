import { vi } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { DataloadApi } from './api'
import { baseApi } from './fixtures'

export function wrap(ui: ReactNode): ReturnType<typeof render> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

/** The in-memory API with every method spied, plus overrides. */
export function fakeApi(over: Partial<DataloadApi> = {}): DataloadApi {
  const spied = Object.fromEntries(Object.entries(baseApi()).map(([k, f]) => [k, vi.fn(f as never)])) as unknown as DataloadApi
  return { ...spied, ...over }
}
