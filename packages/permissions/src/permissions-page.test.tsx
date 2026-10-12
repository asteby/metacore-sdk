// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@asteby/metacore-runtime-react', async (orig) => ({
  ...(await orig<typeof import('@asteby/metacore-runtime-react')>()),
  PermissionsManager: (p: { title: string }) => <div data-testid="manager">{p.title}</div>,
}))

import { PermissionsPage } from './permissions-page'
import type { PermissionsApi } from './permissions-api'

afterEach(cleanup)

function api(over: Partial<PermissionsApi> = {}): PermissionsApi {
  return {
    fetchMyPermissions: vi.fn(),
    loadPermissionModules: vi.fn(async () => ({
      modules: [{ key: 'orders', label: 'Orders', actions: [{ key: 'index', label: 'List' }] }],
      general: [],
    })),
    loadRoles: vi.fn(async () => []),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    loadRolePermissions: vi.fn(async () => []),
    syncRolePermissions: vi.fn(async () => {}),
    ...over,
  } as PermissionsApi
}
const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)
const groups = [{ title: 'G', items: [{ title: 'Orders', url: '/m/orders' }] }]

describe('PermissionsPage', () => {
  it('shows an accessible loading state then the manager', async () => {
    wrap(<PermissionsPage api={api()} groups={groups} labels={{ title: 'Perms' }} />)
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    await waitFor(() => expect(screen.getByTestId('manager').textContent).toBe('Perms'))
  })
  it('shows error with retry', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({ modules: [{ key: 'orders', label: 'O', actions: [{ key: 'index', label: 'L' }] }], general: [] })
    wrap(<PermissionsPage api={api({ loadPermissionModules: load })} groups={groups} />)
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByTestId('manager')
  })
  it('shows empty state when nav yields no modules', async () => {
    wrap(<PermissionsPage api={api()} groups={[]} />)
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('No modules'))
  })
})
