// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { DataloadApi } from './api'
import { DataloadLauncher } from './dataload-launcher'
import { MediaBackupPanel } from './media-backup-panel'
import { media, plan, run } from './fixtures'

afterEach(cleanup)

function wrap(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

function fakeApi(over: Partial<DataloadApi> = {}): DataloadApi {
  return {
    listProfiles: vi.fn(async () => [{ profile: { name: 'catalogo', version: '1', entity: 'product', key: ['sku'], fields: [] } }]),
    saveProfile: vi.fn(),
    dryRun: vi.fn(async () => ({ plan, run: run({ mode: 'dry_run', state: 'succeeded' }) })),
    execute: vi.fn(async () => run({ state: 'running' })),
    run: vi.fn(async () => run({ state: 'succeeded', progress: { ...run().progress, done: 2 } })),
    runPlan: vi.fn(),
    runs: vi.fn(async () => [run({ state: 'succeeded' })]),
    cancel: vi.fn(async () => run({ state: 'canceled' })),
    mediaStatus: vi.fn(async () => media),
    mediaManifest: vi.fn(async () => []),
    mediaVerify: vi.fn(async () => ({ checked: 5, ok: 5, missing: [], corrupt: [] })),
    mediaRetry: vi.fn(async () => 1),
    ...over,
  }
}

const pick = (label: RegExp, name: string, content: string) => {
  const input = screen.getByLabelText(label) as HTMLInputElement
  const f = new File([content], name, { type: 'text/csv' })
  fireEvent.change(input, { target: { files: [f] } })
}

describe('DataloadLauncher', () => {
  it('walks pick -> dry-run -> diff -> apply -> finished', async () => {
    const api = fakeApi()
    const onFinished = vi.fn()
    const notify = { success: vi.fn(), error: vi.fn() }
    wrap(<DataloadLauncher api={api} notify={notify} onFinished={onFinished} />)

    const dryBtn = screen.getByRole('button', { name: 'Simular carga' }) as HTMLButtonElement
    expect(dryBtn.disabled).toBe(true)

    await waitFor(() => expect(screen.getByRole('option', { name: /catalogo/ })).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Perfil'), { target: { value: 'catalogo' } })
    pick(/Archivo/, 'catalogo.csv', 'sku,name\nSKU-1,Uno')
    await waitFor(() => expect(dryBtn.disabled).toBe(false))

    fireEvent.click(dryBtn)
    await waitFor(() => expect(api.dryRun).toHaveBeenCalled())
    expect(api.dryRun).toHaveBeenCalledWith({ profile: 'catalogo', source: { format: 'csv', name: 'catalogo.csv', content: 'sku,name\nSKU-1,Uno' } })

    // Default filter shows only the rows with changes; the field diff is visible.
    await screen.findByText('SKU-2')
    expect(screen.getByText('SKU-1')).toBeTruthy()
    expect(screen.queryByText('SKU-3')).toBeNull()
    expect(screen.getByText('DOS')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Inválidas' }))
    expect(screen.getByText(/no es un número/)).toBeTruthy()

    fireEvent.click(screen.getByLabelText(/No aplicar nada si alguna fila es inválida/))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar carga' }))
    await waitFor(() => expect(api.execute).toHaveBeenCalled())
    expect(api.execute).toHaveBeenCalledWith(expect.objectContaining({ profile: 'catalogo', force: false, failOnInvalid: true }))

    await waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1))
    expect(onFinished.mock.calls[0]?.[0].state).toBe('succeeded')
    expect(screen.getByRole('progressbar', { name: 'Avance de la carga' })).toBeTruthy()
    expect(notify.success).toHaveBeenCalledWith('Carga iniciada')
  })

  it('rejects unsupported files without calling the API', async () => {
    const api = fakeApi()
    wrap(<DataloadLauncher api={api} showMedia={false} showHistory={false} />)
    pick(/Archivo/, 'catalogo.xlsx', 'x')
    await screen.findByText(/Formato no soportado/)
    expect(api.dryRun).not.toHaveBeenCalled()
  })

  it('shows the dry-run error from the server', async () => {
    const api = fakeApi({ dryRun: vi.fn(async () => { throw { response: { data: { message: 'perfil inválido' } } } }) })
    const notify = { success: vi.fn(), error: vi.fn() }
    wrap(<DataloadLauncher api={api} notify={notify} defaultProfile='catalogo' showMedia={false} showHistory={false} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /catalogo/ })).toBeTruthy())
    pick(/Archivo/, 'a.csv', 'sku\n1')
    const btn = screen.getByRole('button', { name: 'Simular carga' }) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
    fireEvent.click(btn)
    await screen.findByText('perfil inválido', { selector: 'p' })
    expect(notify.error).toHaveBeenCalledWith('perfil inválido')
  })

  it('does not offer to apply a plan without valid rows', async () => {
    const api = fakeApi({ dryRun: vi.fn(async () => ({ plan: { ...plan, counts: { invalid: 2 }, rows: [] }, run: run({ mode: 'dry_run' }) })) })
    wrap(<DataloadLauncher api={api} defaultProfile='catalogo' showMedia={false} showHistory={false} />)
    await waitFor(() => expect(screen.getByRole('option', { name: /catalogo/ })).toBeTruthy())
    pick(/Archivo/, 'a.csv', 'sku\n1')
    const btn = screen.getByRole('button', { name: 'Simular carga' }) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
    fireEvent.click(btn)
    await screen.findByText('No hay filas válidas para aplicar.')
    expect((screen.getByRole('button', { name: 'Aplicar carga' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('MediaBackupPanel', () => {
  it('shows integrity, dead jobs, and verifies / retries', async () => {
    const api = fakeApi()
    const notify = { success: vi.fn(), error: vi.fn() }
    wrap(<MediaBackupPanel api={api} notify={notify} watch={false} />)
    await screen.findByText('Requiere atención')
    expect(screen.getByText('3.0 MB')).toBeTruthy()
    expect(screen.getByText('https://origen.test/a.jpg')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Verificar respaldo/ }))
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Respaldo verificado: 5 de 5 íntegros.'))

    fireEvent.click(screen.getByRole('button', { name: /Reintentar fallidas/ }))
    await waitFor(() => expect(api.mediaRetry).toHaveBeenCalledWith(undefined))
    expect(notify.success).toHaveBeenCalledWith('1 imágenes vuelven a la cola.')
  })

  it('reports a failed verification', async () => {
    const entry = { ...media.dead[0]! } as never
    const api = fakeApi({ mediaVerify: vi.fn(async () => ({ checked: 5, ok: 4, missing: [], corrupt: [entry] })) })
    const notify = { success: vi.fn(), error: vi.fn() }
    wrap(<MediaBackupPanel api={api} notify={notify} watch={false} />)
    await screen.findByText('Requiere atención')
    fireEvent.click(screen.getByRole('button', { name: /Verificar respaldo/ }))
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('Verificación: 1 con problemas de 5.'))
  })
})
