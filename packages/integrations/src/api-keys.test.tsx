// @vitest-environment happy-dom
import * as React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiKeysManager, createT, type ApiKey, type ApiKeysApi } from './index'

afterEach(cleanup)
const t = createT('es')
const SECRET = 'sup_sk_SECRETO_UNICO_1234567890'

const scopes = [
  { value: 'support:read', label: 'Leer casos' },
  { value: 'support:write', label: 'Escribir casos' },
]

function fakeApi(initial: ApiKey[] = []) {
  let keys = initial.map((k) => ({ ...k }))
  const api: ApiKeysApi = {
    list: vi.fn(async () => keys.map((k) => ({ ...k }))),
    create: vi.fn(async (d) => {
      const key: ApiKey = { id: `k${keys.length + 1}`, name: d.name, prefix: 'sup_sk_AbCd', scopes: d.scopes, status: 'active', created_at: '2026-11-25T00:00:00Z' }
      keys.push(key)
      return { key, secret: SECRET }
    }),
    rotate: vi.fn(async (id, { graceSeconds }) => {
      const old = keys.find((k) => k.id === id)!
      old.valid_until = graceSeconds > 0 ? '2026-11-26T00:00:00Z' : null
      const key: ApiKey = { id: 'k9', name: old.name, prefix: 'sup_sk_Nuev', scopes: old.scopes, status: 'active', rotated_from_id: id }
      keys.push(key)
      return { key, secret: 'sup_sk_ROTADO_0987654321' }
    }),
    revoke: vi.fn(async (id) => {
      keys = keys.map((k) => (k.id === id ? { ...k, status: 'revoked' as const } : k))
    }),
  }
  return api
}

const existing: ApiKey = { id: 'k1', name: 'Backend tienda', prefix: 'sup_sk_Zz9', scopes: ['support:read'], status: 'active', created_at: '2026-11-01T00:00:00Z' }

describe('ApiKeysManager', () => {
  it('lista con prefijo y sin secreto', async () => {
    render(<ApiKeysManager api={fakeApi([existing])} scopes={scopes} t={t} />)
    const row = await screen.findByTestId('key-k1')
    expect(within(row).getByText('sup_sk_Zz9')).toBeTruthy()
    expect(within(row).getByText('Backend tienda')).toBeTruthy()
  })

  it('crea con ambito, muestra el secreto UNA vez y lo descarta al confirmar', async () => {
    const api = fakeApi()
    const onChanged = vi.fn()
    render(<ApiKeysManager api={api} scopes={scopes} t={t} onChanged={onChanged} />)
    await screen.findByText(t('keys.empty'))
    fireEvent.click(screen.getByText(t('keys.new')))
    fireEvent.click(screen.getByText(t('keys.create')))
    expect((await screen.findByRole('alert')).textContent).toContain(t('keys.needName'))
    fireEvent.change(screen.getByLabelText(t('keys.name')), { target: { value: 'CI' } })
    fireEvent.click(screen.getByText(t('keys.create')))
    expect((await screen.findByRole('alert')).textContent).toContain(t('keys.needScope'))
    fireEvent.click(screen.getByLabelText('Escribir casos'))
    fireEvent.click(screen.getByText(t('keys.create')))

    expect((await screen.findByTestId('credential-value')).textContent).toBe(SECRET)
    expect(api.create).toHaveBeenCalledWith({ name: 'CI', scopes: ['support:write'], expires_in_days: undefined, rate_limit_per_minute: undefined, fields: {} })
    expect(onChanged).toHaveBeenCalled()

    fireEvent.click(screen.getByText(t('credential.done')))
    await screen.findByText('CI')
    expect(screen.queryByTestId('credential-value')).toBeNull()
    expect(document.body.textContent).not.toContain(SECRET)
  })

  it('rota con solapamiento: pide la gracia, muestra el secreto nuevo y la vieja con su vigencia', async () => {
    const api = fakeApi([existing])
    render(<ApiKeysManager api={api} scopes={scopes} t={t} />)
    const row = await screen.findByTestId('key-k1')
    fireEvent.click(within(row).getByText(t('keys.rotate')))
    fireEvent.change(within(row).getByLabelText(t('keys.rotateGrace')), { target: { value: '72' } })
    fireEvent.click(within(row).getByText(t('keys.rotateConfirm')))
    await waitFor(() => expect(api.rotate).toHaveBeenCalledWith('k1', { graceSeconds: 72 * 3600 }))
    expect((await screen.findByTestId('credential-value')).textContent).toBe('sup_sk_ROTADO_0987654321')
    fireEvent.click(screen.getByText(t('credential.done')))
    const old = await screen.findByTestId('key-k1')
    expect(within(old).getByRole('status').textContent).toContain(new Date('2026-11-26T00:00:00Z').toLocaleDateString())
    expect(screen.queryByTestId('credential-value')).toBeNull()
  })

  it('revoca solo tras confirmar', async () => {
    const api = fakeApi([existing])
    render(<ApiKeysManager api={api} scopes={scopes} t={t} />)
    const row = await screen.findByTestId('key-k1')
    fireEvent.click(within(row).getByText(t('keys.revoke')))
    expect(api.revoke).not.toHaveBeenCalled()
    fireEvent.click(within(within(row).getByRole('alert')).getByText(t('keys.revoke')))
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith('k1'))
    await waitFor(() => expect(within(screen.getByTestId('key-k1')).getByText(t('keys.status.revoked'))).toBeTruthy())
    expect(within(screen.getByTestId('key-k1')).queryByText(t('keys.rotate'))).toBeNull()
  })

  it('exige los campos del host y los entrega en el borrador', async () => {
    const api = fakeApi()
    render(
      <ApiKeysManager
        api={api}
        scopes={scopes}
        t={t}
        fields={[{ name: 'device_id', label: 'Dispositivo', options: [{ value: 'd1', label: 'Caja 1' }] }]}
        expiryOptions={[30, 90]}
        defaultRateLimit={60}
        defaultScopes={['support:read']}
      />,
    )
    await screen.findByText(t('keys.empty'))
    fireEvent.click(screen.getByText(t('keys.new')))
    fireEvent.change(screen.getByLabelText(t('keys.name')), { target: { value: 'Caja' } })
    fireEvent.click(screen.getByText(t('keys.create')))
    expect((await screen.findByRole('alert')).textContent).toContain('Dispositivo')
    fireEvent.change(screen.getByLabelText('Dispositivo'), { target: { value: 'd1' } })
    fireEvent.change(screen.getByLabelText(t('keys.expires')), { target: { value: '90' } })
    fireEvent.click(screen.getByText(t('keys.create')))
    await screen.findByTestId('credential-value')
    expect(api.create).toHaveBeenCalledWith({ name: 'Caja', scopes: ['support:read'], expires_in_days: 90, rate_limit_per_minute: 60, fields: { device_id: 'd1' } })
  })

  it('muestra el error de la API y no pierde la lista', async () => {
    const api = fakeApi([existing])
    api.create = vi.fn(async () => {
      throw new Error('cuota')
    })
    render(<ApiKeysManager api={api} scopes={scopes} t={t} defaultScopes={['support:read']} />)
    await screen.findByTestId('key-k1')
    fireEvent.click(screen.getByText(t('keys.new')))
    fireEvent.change(screen.getByLabelText(t('keys.name')), { target: { value: 'X' } })
    fireEvent.click(screen.getByText(t('keys.create')))
    expect((await screen.findByText(/cuota/)).textContent).toContain('cuota')
    expect(screen.getByTestId('key-k1')).toBeTruthy()
  })
})
